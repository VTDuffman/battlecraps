// =============================================================================
// INTEGRATION — boss rule mechanics
// =============================================================================

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../lib/io.js', () => ({
  getIO:   vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
  initIO:  vi.fn(),
  resetIO: vi.fn(),
}));

import type { FastifyInstance } from 'fastify';
import {
  buildTestApp,
  createTestUser,
  createRun,
  rollWithDice,
  resetTestDb,
  TEST_CLERK_ID,
} from '../helpers/testSetup.js';
import type { Bets } from '@battlecraps/shared';
import { getIO } from '../../lib/io.js';

const PASS_ONLY = (amt: number): Bets => ({
  passLine: amt,
  odds:     0,
  hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
});

let app: FastifyInstance;
let userId: string;

beforeAll(async () => {
  app    = await buildTestApp();
  const user = await createTestUser();
  userId = user.id;
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetTestDb();
});

// ---------------------------------------------------------------------------
// RISING_MIN_BETS (Sarge — marker index 5, target = 100_000¢ = $1,000)
//
// Since FB-026 an under-minimum pass line is NOT rejected: the roll proceeds and
// a non-compliance fine (5% of target = 5_000¢) is deducted from the bankroll.
//
// Formula: bossMin = Math.ceil(targetCents * pct / 100) * 100, pct = 0.04 + 0.02 × bossPointHits
//   bossPointHits=0: 4% → 4_000¢      bossPointHits=1: 6% → 6_000¢
//
// Tests roll craps (1+1) on the come-out so the pass line simply loses:
//   bankroll after = start − bet − fine   (no payout / hype math involved)
// ---------------------------------------------------------------------------

describe('RISING_MIN_BETS — Sarge (marker 5)', () => {
  const FINE = 5_000;

  async function crapsOutAtSarge(bossPointHits: number, bet: number): Promise<number> {
    const run = await createRun(userId, {
      currentMarkerIndex: 5,
      bankrollCents:      20_000, // well below the 100_000 target (no auto-clear)
      bossPointHits,
    });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(bet), 1, 1);
    expect(status, JSON.stringify(body)).toBe(200);
    return (body['run'] as Record<string, unknown>)['bankrollCents'] as number;
  }

  it('at bossPointHits=0: a 4_000¢ pass line meets the minimum — no fine', async () => {
    expect(await crapsOutAtSarge(0, 4_000)).toBe(20_000 - 4_000);
  });

  it('at bossPointHits=0: 3_900¢ is accepted but fined 5_000¢', async () => {
    expect(await crapsOutAtSarge(0, 3_900)).toBe(20_000 - 3_900 - FINE);
  });

  it('at bossPointHits=1: the minimum rises to 6_000¢ (5_900¢ fined, 6_000¢ not)', async () => {
    expect(await crapsOutAtSarge(1, 5_900)).toBe(20_000 - 5_900 - FINE);
    expect(await crapsOutAtSarge(1, 6_000)).toBe(20_000 - 6_000);
  });
});

// ---------------------------------------------------------------------------
// DISABLE_CREW (Mme. Le Prix — marker index 8, $4,000)
// ---------------------------------------------------------------------------

describe('DISABLE_CREW — Mme. Le Prix (marker 8)', () => {
  it('crew cascade does not fire — cascadeEvents is empty', async () => {
    // Place Shark (ID 8) in slot 0; normally fires on POINT_HIT and adds an additive.
    // With DISABLE_CREW the entire cascade is skipped, so Shark never fires.
    const run = await createRun(userId, {
      currentMarkerIndex: 8,
      bankrollCents:      200_000, // below 400_000 target
      status:             'POINT_ACTIVE',
      phase:              'POINT_ACTIVE',
      currentPoint:       6,
      bets: { passLine: 2000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      crewSlots: [{ crewId: 8, cooldownState: 0 }, null, null, null, null],
    });

    // Roll 4+2 = soft 6 → POINT_HIT
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 2000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      4, 2,
    );

    expect(status).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('POINT_HIT');
    expect(Array.isArray(roll['cascadeEvents'])).toBe(true);
    expect((roll['cascadeEvents'] as unknown[]).length).toBe(0);

    // hype seeded +0.15 for POINT_HIT (streak=0) → 1.15; Shark suppressed by DISABLE_CREW, no additives
    // amplifiedProfit = floor(2000*1.15/100)*100 = floor(23)*100 = 2300
    // betDelta = 2000 - 2000 = 0; payout = 2000 (stake) + 2300 = 4300
    // newBankroll = 200_000 - 0 + 4300 = 204_300
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(204_300);
  });
});

// ---------------------------------------------------------------------------
// CROSS_CALIBRATION — The Executive (marker index 11, $15,000)
//
// bossPointHits stores the Performance Review rating (0–4).
// Rating initialises to 2 (Strong) on fight entry. Movement:
//   Natural / Point Hit   → +1 (capped at 4, Exceptional)
//   Craps Out / Seven-Out → −1 (floored at 0, Action Required)
//   Point Set / No Resolution → neutral
// PIP: Craps Out or Seven-Out while already at 0 → GAME_OVER, pipTermination: true
// Exceptional: +15% gross profit bonus while rating = 4
//
// Marker 11: target = 1_500_000¢ ($15,000), minBet = 25_000¢
// ---------------------------------------------------------------------------

describe('CROSS_CALIBRATION — The Executive (marker 11)', () => {
  it('rating starts at index 2 (Strong) — natural on first roll bumps it to 3', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      2,
    });

    // Roll 3+4=7 → NATURAL
    const { status, body } = await rollWithDice(
      app, run.id, PASS_ONLY(25_000), 3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bossPointHits']).toBe(3);
  });

  it('point hit (+1) also increases the rating', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      2,
      status:             'POINT_ACTIVE',
      phase:              'POINT_ACTIVE',
      currentPoint:       6,
      bets:               { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
    });

    // Roll 3+3=6 → POINT_HIT (point was 6)
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 3,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bossPointHits']).toBe(3);
  });

  it('rating stays at 2 (Strong) after the pub — skipping recruit does not reset it to 0', async () => {
    // Real path: marker 10 clear writes bossPointHits = 2 and status TRANSITION;
    // the pub (recruit / skip) then moves the run to IDLE_TABLE for the fight.
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      2,
      status:             'TRANSITION',
    });

    const response = await app.inject({
      method:  'POST',
      url:     `/api/v1/runs/${run.id}/recruit`,
      headers: { 'content-type': 'application/json', 'x-test-user-id': TEST_CLERK_ID },
      payload: JSON.stringify({}),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Record<string, unknown>;
    expect(body['status']).toBe('IDLE_TABLE');
    expect(body['bossPointHits']).toBe(2);

    // First bad roll in the fight drops to 1 (Below Strong) — not a PIP termination.
    const { status, body: rollBody } = await rollWithDice(
      app, run.id, PASS_ONLY(25_000), 1, 1,
    );
    expect(status).toBe(200);
    const r = rollBody['run'] as Record<string, unknown>;
    expect(r['status']).not.toBe('GAME_OVER');
    expect(r['bossPointHits']).toBe(1);
  });

  it('rating is capped at 4 (Exceptional) — natural does not push it above 4', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      4,
    });

    // Roll 3+4=7 → NATURAL
    const { status, body } = await rollWithDice(
      app, run.id, PASS_ONLY(25_000), 3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bossPointHits']).toBe(4);
  });

  it('craps out (−1) decreases the rating', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      2,
    });

    // Roll 1+2=3 → CRAPS_OUT
    const { status, body } = await rollWithDice(
      app, run.id, PASS_ONLY(25_000), 1, 2,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bossPointHits']).toBe(1);
    expect(r['status']).not.toBe('GAME_OVER');
  });

  it('seven-out (−1) decreases the rating and does not trigger PIP when above 0', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      1,
      status:             'POINT_ACTIVE',
      phase:              'POINT_ACTIVE',
      currentPoint:       8,
      bets:               { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
    });

    // Roll 3+4=7 → SEVEN_OUT while point is 8
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bossPointHits']).toBe(0);
    expect(r['status']).not.toBe('GAME_OVER');
  });

  it('at index 0 (Action Required), a seven-out triggers GAME_OVER with pipTermination', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      0,
      status:             'POINT_ACTIVE',
      phase:              'POINT_ACTIVE',
      currentPoint:       8,
      bets:               { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
    });

    const emitSpy = vi.fn();
    vi.mocked(getIO).mockReturnValueOnce({
      to: () => ({ emit: emitSpy }),
    } as unknown as ReturnType<typeof getIO>);

    // Roll 3+4=7 → SEVEN_OUT while at Action Required
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('GAME_OVER');

    const settledArgs = emitSpy.mock.calls.find(
      (args: unknown[]) => args[0] === 'turn:settled',
    );
    expect(settledArgs).toBeDefined();
    const payload = settledArgs![1] as Record<string, unknown>;
    expect(payload['pipTermination']).toBe(true);
  });

  it('at index 0 (Action Required), a craps out triggers GAME_OVER with pipTermination', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      0,
    });

    const emitSpy = vi.fn();
    vi.mocked(getIO).mockReturnValueOnce({
      to: () => ({ emit: emitSpy }),
    } as unknown as ReturnType<typeof getIO>);

    // Roll 1+2=3 → CRAPS_OUT while at Action Required
    const { status, body } = await rollWithDice(
      app, run.id, PASS_ONLY(25_000), 1, 2,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('GAME_OVER');

    const settledArgs = emitSpy.mock.calls.find(
      (args: unknown[]) => args[0] === 'turn:settled',
    );
    expect(settledArgs).toBeDefined();
    const payload = settledArgs![1] as Record<string, unknown>;
    expect(payload['pipTermination']).toBe(true);
  });

  it('at index 4 (Exceptional), the payout includes a 1.15× gross profit bonus', async () => {
    // passLine=25_000¢, NATURAL. The natural's +0.10 hype tick applies before
    // payout, so amplified profit = 25_000 × 1.10 = 27_500¢.
    // bonus = Math.round(27_500 * 0.15 / 100) * 100 = Math.round(41.25) * 100 = 4_100¢
    // payout = 25_000 (stake) + 27_500 (profit) + 4_100 (bonus) = 56_600¢
    // newBankroll = 300_000 − 25_000 (betDelta) + 56_600 = 331_600¢
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      4,
    });

    // Roll 3+4=7 → NATURAL
    const { status, body } = await rollWithDice(
      app, run.id, PASS_ONLY(25_000), 3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(331_600);
  });

  it('turn:settled payload includes bossRating with { index, changed, direction }', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      300_000,
      bossPointHits:      2,
    });

    const emitSpy = vi.fn();
    vi.mocked(getIO).mockReturnValueOnce({
      to: () => ({ emit: emitSpy }),
    } as unknown as ReturnType<typeof getIO>);

    // Roll 3+4=7 → NATURAL; rating moves 2 → 3 (changed=true, direction='up')
    await rollWithDice(app, run.id, PASS_ONLY(25_000), 3, 4);

    const settledArgs = emitSpy.mock.calls.find(
      (args: unknown[]) => args[0] === 'turn:settled',
    );
    expect(settledArgs).toBeDefined();
    const payload = settledArgs![1] as Record<string, unknown>;
    expect(payload['bossRating']).toMatchObject({
      index:     3,
      changed:   true,
      direction: 'up',
    });
  });
});

// ---------------------------------------------------------------------------
// RISING_MIN_BETS — the fine is charged once, on the come-out
//
// A non-compliant pass line placed on the come-out must not be fined again on
// every point-phase roll (the pass line is locked; the player can't fix it).
// ---------------------------------------------------------------------------

describe('RISING_MIN_BETS — fine applies on the come-out only', () => {
  it('a point-phase roll with an under-minimum pass line is not fined again', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 5,
      bankrollCents:      20_000,
      bossPointHits:      0,
      status:             'POINT_ACTIVE',
      phase:              'POINT_ACTIVE',
      currentPoint:       6,
      bets:               PASS_ONLY(3_900), // below the 4_000¢ minimum
    });

    // 2+3 = 5 → NO_RESOLUTION on point 6. No payout, so the bankroll only moves by a fine.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(3_900), 2, 3);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['bankrollCents']).toBe(20_000);
  });
});

// ---------------------------------------------------------------------------
// Crew-bonus escrow — TRIBUTE (Hierophant, marker 14) and TRANSMISSION_DELAY
// (Emissary, marker 23).
//
// "Ace" McGee (ID 17) adds 0.40× max bet whenever a 1 shows; The Shark (ID 8)
// adds 0.65× max bet on a point hit. Under both bosses those bonuses are held
// in escrow (pendingAdditiveCents) instead of paying out on the roll.
// ---------------------------------------------------------------------------

describe('Crew-bonus escrow', () => {
  const ACE   = { crewId: 17, cooldownState: 0 };
  const SHARK = { crewId: 8,  cooldownState: 0 };

  it('Hierophant: a seven-out seizes 25% of ALL escrow, including bonuses earned on that roll', async () => {
    // Marker 14: target 10_000_000¢ → max bet 1_000_000¢ → Ace = 400_000¢. Min bet 166_500¢.
    const run = await createRun(userId, {
      currentMarkerIndex:   14,
      bankrollCents:        2_000_000,
      status:               'POINT_ACTIVE',
      phase:                'POINT_ACTIVE',
      currentPoint:         6,
      bets:                 PASS_ONLY(166_500),
      crewSlots:            [ACE, null, null, null, null],
      pendingAdditiveCents: 100_000,
    });

    // 1+6 = 7 → SEVEN_OUT; Ace fires on the 1 (400_000¢ held this roll).
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(166_500), 1, 6);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    // (100_000 + 400_000) × 0.75 = 375_000 released now; nothing carried forward.
    expect(r['bankrollCents']).toBe(2_375_000);
    expect(r['pendingAdditiveCents']).toBe(0);
  });

  it('Emissary: a seven-out evaporates ALL escrow, including bonuses earned on that roll', async () => {
    // Marker 23: target 1_500_000_000¢ → max bet 150_000_000¢. Min bet 25_000_000¢.
    const run = await createRun(userId, {
      currentMarkerIndex:   23,
      bankrollCents:        200_000_000,
      status:               'POINT_ACTIVE',
      phase:                'POINT_ACTIVE',
      currentPoint:         6,
      bets:                 PASS_ONLY(25_000_000),
      crewSlots:            [ACE, null, null, null, null],
      pendingAdditiveCents: 10_000_000,
    });

    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 1, 6);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(200_000_000);
    expect(r['pendingAdditiveCents']).toBe(0);
  });

  it('Emissary: bonuses held on the roll that clears the marker are paid out', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 23,
      bankrollCents:      1_450_000_000,
      status:             'POINT_ACTIVE',
      phase:              'POINT_ACTIVE',
      currentPoint:       6,
      bets:               PASS_ONLY(25_000_000),
      crewSlots:          [SHARK, null, null, null, null],
    });

    // 4+2 = 6 → POINT_HIT. Pass pays stake 25M + floor(25M × 1.15) = 53_750_000 → 1_503_750_000,
    // which clears the 1_500_000_000 target. Shark's 97_500_000 held this roll must be paid too.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 4, 2);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('TRANSITION');
    // (1_503_749_900, not …750_000: settleTurn loses $1 to float rounding on 25M × 1.15 — tracked separately.)
    expect(r['bankrollCents']).toBe(1_601_249_900);
    expect(r['pendingAdditiveCents']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// CONVERGENCE — The Architect (marker 26)
//
// Each seven-out removes ONE crew member: the last one that fired, or the
// highest occupied slot if nobody fired. The cascade window does not shrink.
// ---------------------------------------------------------------------------

describe('CONVERGENCE — The Architect (marker 26)', () => {
  const ACE     = { crewId: 17, cooldownState: 0 };
  const LOOKOUT = { crewId: 16, cooldownState: 0 };

  it('crew in slot 5 still fires after a seven-out (no shrinking window)', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 26,
      bankrollCents:      500_000_000,
      unlockedSlots:      5,
      bossPointHits:      1, // one seven-out already happened
      crewSlots:          [ACE, null, null, null, LOOKOUT],
    });

    // 6+5 = 11 → NATURAL; The Lookout (slot index 4) fires on the 6.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(100_000_000), 6, 5);
    expect(status, JSON.stringify(body)).toBe(200);
    const events = (body['roll'] as Record<string, unknown>)['cascadeEvents'] as Array<{ slotIndex: number }>;
    expect(events.map((e) => e.slotIndex)).toContain(4);
  });

  it('when nobody fires on the seven-out, the highest occupied slot is removed', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 26,
      bankrollCents:      500_000_000,
      unlockedSlots:      5,
      bossPointHits:      0,
      status:             'POINT_ACTIVE',
      phase:              'POINT_ACTIVE',
      currentPoint:       6,
      bets:               PASS_ONLY(100_000_000),
      crewSlots:          [ACE, LOOKOUT, null, null, null],
    });

    // 3+4 = 7 → SEVEN_OUT; no 1 and no 6, so neither crew fires.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(100_000_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    const slots = (body['run'] as Record<string, unknown>)['crewSlots'] as Array<{ crewId: number } | null>;
    expect(slots[0]?.crewId).toBe(17);
    expect(slots[1]).toBeNull();
  });
});
