// =============================================================================
// INTEGRATION — boss rule mechanics
// =============================================================================

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

// Crew re-rolls (Lefty) use the server RNG, not cheat_dice. Pin them to a blank
// (2+3) so the Double Time / Lefty interaction is deterministic. randomBelow
// (Le Prix's charm selection) keeps its real implementation.
vi.mock('../../lib/rng.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/rng.js')>()),
  rollDice: vi.fn((): [number, number] => [2, 3]),
}));

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
import { rollDice } from '../../lib/rng.js';

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
// DOUBLE_TIME (Sarge — marker index 5, target = 100_000¢ = $1,000) — FB-030
//
// Once a point is set the shooter has rollLimit (6) point-phase rolls to hit it.
// bossPointHits = point-phase rolls used. If the 6th roll is a blank, it is
// converted to a SEVEN_OUT after the cascade ("TIME'S UP"): Pass Line + Odds
// lost, all Hardways clear, shooter lost. Crew that react to a dice Seven-Out
// (Lefty, Floor Walker, Lucky Charm) do NOT trigger on a timeout.
// ---------------------------------------------------------------------------

describe('DOUBLE_TIME — Sarge (marker 5)', () => {
  const PASS = PASS_ONLY(2_000);

  async function sargePoint(overrides: Record<string, unknown>, d1: number, d2: number, bets: Bets = PASS) {
    const run = await createRun(userId, {
      currentMarkerIndex: 5,
      bankrollCents:      50_000,
      status:             'POINT_ACTIVE',
      phase:              'POINT_ACTIVE',
      currentPoint:       6,
      bets,
      ...overrides,
    });
    const { status, body } = await rollWithDice(app, run.id, bets, d1, d2);
    expect(status, JSON.stringify(body)).toBe(200);
    return { roll: body['roll'] as Record<string, unknown>, run: body['run'] as Record<string, unknown> };
  }

  it('a blank on the 6th point-phase roll is a Seven-Out ("TIME\'S UP")', async () => {
    const { roll, run } = await sargePoint({ bossPointHits: 5 }, 2, 3); // 5 → blank on point 6
    expect(roll['rollResult']).toBe('SEVEN_OUT');
    expect(roll['clockExpired']).toBe(true);
    expect(run['shooters']).toBe(4);
    expect(run['phase']).toBe('COME_OUT');
    expect((run['bets'] as Bets).passLine).toBe(0);
    expect(run['bankrollCents']).toBe(50_000); // pass line was already deducted; nothing returned
    expect(run['bossPointHits']).toBe(0);
  });

  it('hitting the point on the 6th roll wins normally', async () => {
    const { roll, run } = await sargePoint({ bossPointHits: 5 }, 4, 2);
    expect(roll['rollResult']).toBe('POINT_HIT');
    expect(roll['clockExpired']).toBeUndefined();
    expect(run['shooters']).toBe(5);
    // stake 2_000 + floor(2_000 × 1.15) = 4_300
    expect(run['bankrollCents']).toBe(54_300);
    expect(run['bossPointHits']).toBe(0);
  });

  it('a blank before the limit just ticks the clock', async () => {
    const { roll, run } = await sargePoint({ bossPointHits: 2 }, 2, 3);
    expect(roll['rollResult']).toBe('NO_RESOLUTION');
    expect(run['bossPointHits']).toBe(3);
    expect(run['phase']).toBe('POINT_ACTIVE');
  });

  it('a real Seven-Out before the limit is normal and resets the clock', async () => {
    const { roll, run } = await sargePoint({ bossPointHits: 2 }, 3, 4);
    expect(roll['rollResult']).toBe('SEVEN_OUT');
    expect(roll['clockExpired']).toBeUndefined();
    expect(run['bossPointHits']).toBe(0);
  });

  it('come-out rolls do not tick the clock', async () => {
    const run = await createRun(userId, { currentMarkerIndex: 5, bankrollCents: 50_000, bossPointHits: 0 });
    const setPoint = await rollWithDice(app, run.id, PASS, 4, 2);
    expect((setPoint.body['roll'] as Record<string, unknown>)['rollResult']).toBe('POINT_SET');
    expect((setPoint.body['run'] as Record<string, unknown>)['bossPointHits']).toBe(0);
  });

  it('blank-roll crew (Grinder) still pay on the timed-out roll', async () => {
    // Max bet 10_000¢ → Grinder 0.15× = 1_500¢, Hype 1.0 → +1_500¢.
    const { roll, run } = await sargePoint(
      { bossPointHits: 5, crewSlots: [{ crewId: 25, cooldownState: 0 }, null, null, null, null] }, 2, 3);
    expect(roll['rollResult']).toBe('SEVEN_OUT');
    expect(run['bankrollCents']).toBe(51_500);
  });

  it('Floor Walker does not refund and Lefty does not re-roll on a timeout', async () => {
    const { roll, run } = await sargePoint({
      bossPointHits: 5,
      crewSlots: [{ crewId: 5, cooldownState: 0 }, { crewId: 1, cooldownState: 0 }, null, null, null],
    }, 2, 3);
    expect(roll['rollResult']).toBe('SEVEN_OUT');
    expect(roll['cascadeEvents']).toEqual([]);
    expect(run['shooters']).toBe(4);
    expect(run['bankrollCents']).toBe(50_000);
  });

  it('Lefty re-rolling a real 7 into a blank on the last roll does not save the shooter', async () => {
    // Dice 3+4 = 7 → Lefty re-rolls (RNG pinned to 2+3 above) into a blank on point 6;
    // the clock is on its last roll, so time's up and the shooter is still lost.
    const { roll, run } = await sargePoint(
      { bossPointHits: 5, crewSlots: [{ crewId: 1, cooldownState: 0 }, null, null, null, null] }, 3, 4);
    expect(roll['rollResult']).toBe('SEVEN_OUT');
    expect(roll['clockExpired']).toBe(true);
    expect(run['shooters']).toBe(4);
  });

  it('a Hardway that wins on the timed-out roll still pays; the rest clear', async () => {
    const bets: Bets = { passLine: 2_000, odds: 0, hardways: { hard4: 0, hard6: 1_000, hard8: 0, hard10: 1_000 } };
    // Point 8, roll 3+3 = Hard 6 (9:1) — a blank on the point, so time's up.
    const { roll, run } = await sargePoint({ bossPointHits: 5, currentPoint: 8 }, 3, 3, bets);
    expect(roll['rollResult']).toBe('SEVEN_OUT');
    // Hard 6 stake 1_000 + 9_000 profit returned; Pass Line and Hard 10 lost.
    expect(run['bankrollCents']).toBe(60_000);
    expect(run['bets']).toEqual({ passLine: 0, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } });
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

  // FB-036: in an escrow fight the roll log's Net counts only what the escrow
  // actually paid — never crew cash that went into it. (Net is the bets' win /
  // loss for the roll, so a lost stake counts here though it left the bankroll
  // when it was placed.)
  const expectNet = (body: Record<string, unknown>, cents: number) => {
    const roll = body['roll'] as { receipt: { netDelta: number } };
    expect(roll.receipt.netDelta).toBe(cents);
  };

  it('Hierophant: a seven-out seizes 75% of the whole offering, including bonuses earned on that roll', async () => {
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
    // (100_000 + 400_000) × Hype 1.0 = 500_000 offered; 75% seized → 125_000 paid.
    expect(r['bankrollCents']).toBe(2_125_000);
    expect(r['pendingAdditiveCents']).toBe(0);

    // FB-036: the client is told what happened to the offering…
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['escrow']).toEqual({ heldCents: 0, releasedCents: 125_000, seizedCents: 375_000 });
    // …and the receipt shows the real tribute (it used to be computed as 0).
    const receipt = roll['receipt'] as { lines: { text: string }[] };
    expect(receipt.lines.some((l) => l.text === 'The Hierophant: $3750.00 tribute')).toBe(true);
    expect(receipt.lines.some((l) => l.text === 'Released from the offering: $1250.00')).toBe(true);
    expectNet(body, -166_500 + 125_000);   // Pass Line lost + what the offering paid
  });

  it('Hierophant: a blank keeps holding — the offering grows (FB-036)', async () => {
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

    // 1+2 = 3 → blank in the point phase; Ace fires on the 1 (400_000¢ held).
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(166_500), 1, 2);
    expect(status, JSON.stringify(body)).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['escrow']).toEqual({ heldCents: 500_000, releasedCents: 0, seizedCents: 0 });
    expect((body['run'] as Record<string, unknown>)['pendingAdditiveCents']).toBe(500_000);
    // Ace's bonus reads as offered, not paid (it used to inflate Net).
    const receipt = roll['receipt'] as { lines: { kind: string; text: string }[] };
    expect(receipt.lines).toContainEqual({ kind: 'info', text: '"Ace" McGee: $4000.00 → the offering' });
    expectNet(body, 0);   // nothing won, nothing paid — Ace's $4,000 is in the bowl
  });

  it('Hierophant: the ADVANCE clear pays out the offering (with Hype) instead of carrying it', async () => {
    // Bankroll already meets the $100,000 target at the start of the roll.
    const run = await createRun(userId, {
      currentMarkerIndex:   14,
      bankrollCents:        10_000_000,
      status:               'IDLE_TABLE',
      phase:                'COME_OUT',
      hype:                 2.0,
      pendingAdditiveCents: 100_000,
    });

    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(0), 1, 1);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('TRANSITION');
    expect(r['bankrollCents']).toBe(10_200_000);   // + 100_000 × 2.0
    expect(r['pendingAdditiveCents']).toBe(0);
  });

  it('Hierophant: a craps out on the come-out keeps holding (only a win releases)', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex:   14,
      bankrollCents:        2_000_000,
      status:               'IDLE_TABLE',
      phase:                'COME_OUT',
      bets:                 PASS_ONLY(166_500),
      crewSlots:            [ACE, null, null, null, null],
      pendingAdditiveCents: 100_000,
    });

    // 1+1 = 2 → CRAPS_OUT; Ace fires on the 1s (400_000¢ more offered).
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(166_500), 1, 1);
    expect(status, JSON.stringify(body)).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['escrow']).toEqual({ heldCents: 500_000, releasedCents: 0, seizedCents: 0 });
  });

  it('Hierophant: hitting the point releases the whole offering multiplied by Hype', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex:   14,
      bankrollCents:        2_000_000,
      status:               'POINT_ACTIVE',
      phase:                'POINT_ACTIVE',
      currentPoint:         6,
      hype:                 2.0,
      bets:                 PASS_ONLY(166_500),
      crewSlots:            [null, null, null, null, null],
      pendingAdditiveCents: 100_000,
    });

    // 4+2 = 6 → POINT_HIT; Hype ticks 2.0 → 2.15 before settlement.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(166_500), 4, 2);
    expect(status, JSON.stringify(body)).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['escrow']).toEqual({ heldCents: 0, releasedCents: 215_000, seizedCents: 0 });
    expect((body['run'] as Record<string, unknown>)['pendingAdditiveCents']).toBe(0);
    expectNet(body, 357_900 + 215_000);   // Pass Line profit × 2.15 + the offering × 2.15
  });

  it('Emissary (FB-039): a bonus the crew earns now lands on the NEXT roll', async () => {
    // Marker 23: target 1_500_000_000¢ → max bet 150_000_000¢. Ace = 0.40 × max = 60_000_000¢.
    const run = await createRun(userId, {
      currentMarkerIndex: 23, bankrollCents: 200_000_000, status: 'POINT_ACTIVE', phase: 'POINT_ACTIVE',
      currentPoint: 6, bets: PASS_ONLY(25_000_000), crewSlots: [ACE, null, null, null, null],
    });
    // 1+2 = 3 → blank; Ace fires on the 1 — into transit, nothing paid now.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 1, 2);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(200_000_000);
    expect(r['signalTransit']).toEqual({ additives: 60_000_000, hype: 0, multipliers: [] });
    const signal = (body['roll'] as Record<string, unknown>)['signal'] as Record<string, unknown>;
    expect(signal['sent']).toEqual({ additives: 60_000_000, hype: 0, multipliers: [] });
    expect(signal['landed']).toEqual({ additives: 0, hype: 0, multipliers: [] });
  });

  it('Emissary (FB-039): what was in transit lands — cash and Hype', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 23, bankrollCents: 200_000_000, status: 'POINT_ACTIVE', phase: 'POINT_ACTIVE',
      currentPoint: 6, bets: PASS_ONLY(25_000_000), crewSlots: [null, null, null, null, null],
      signalTransit: { additives: 60_000_000, hype: 0.5, multipliers: [] },
    });
    // 2+3 = 5 → blank. Lands: 60_000_000 × Hype (1.0 + 0.5 landing now = 1.5).
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 2, 3);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(290_000_000);
    expect(r['hype']).toBeCloseTo(1.5, 4);
    expect(r['signalTransit']).toEqual({ additives: 0, hype: 0, multipliers: [] });
  });

  it('Emissary (FB-039): a Seven-Out drops the signal and blacks the crew out for 6 rolls', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 23, bankrollCents: 200_000_000, status: 'POINT_ACTIVE', phase: 'POINT_ACTIVE',
      currentPoint: 6, bets: PASS_ONLY(25_000_000), crewSlots: [ACE, null, null, null, null],
      signalTransit: { additives: 60_000_000, hype: 0, multipliers: [] },
    });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(200_000_000);   // nothing landed
    expect(r['signalTransit']).toBeNull();
    expect(r['signalDarkRolls']).toBe(6);
    const signal = (body['roll'] as Record<string, unknown>)['signal'] as Record<string, unknown>;
    expect(signal['dropped']).toBe(true);
    expect(signal['darkRolls']).toBe(6);
  });

  it('Emissary (FB-039): while the crew are dark they do not fire at all', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 23, bankrollCents: 200_000_000, status: 'POINT_ACTIVE', phase: 'POINT_ACTIVE',
      currentPoint: 6, bets: PASS_ONLY(25_000_000), crewSlots: [ACE, null, null, null, null],
      signalDarkRolls: 3,
    });
    // 1+2 — Ace would fire on the 1, but there's no signal.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 1, 2);
    expect(status, JSON.stringify(body)).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['cascadeEvents']).toEqual([]);
    const signal = roll['signal'] as Record<string, unknown>;
    expect(signal['wasDark']).toBe(true);
    expect(signal['darkRolls']).toBe(2);
    expect(signal['sent']).toEqual({ additives: 0, hype: 0, multipliers: [] });
    // Ace's cooldown didn't move while dark.
    const slots = (body['run'] as Record<string, unknown>)['crewSlots'] as ({ crewId: number; cooldownState: number } | null)[];
    expect(slots[0]).toEqual({ crewId: 17, cooldownState: 0 });
  });

  it('Emissary (FB-039): contact returns after the last dark roll', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 23, bankrollCents: 200_000_000, status: 'POINT_ACTIVE', phase: 'POINT_ACTIVE',
      currentPoint: 6, bets: PASS_ONLY(25_000_000), crewSlots: [ACE, null, null, null, null],
      signalDarkRolls: 1,
    });
    const first = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 2, 3);
    expect(((first.body['roll'] as Record<string, unknown>)['signal'] as Record<string, unknown>)['darkRolls']).toBe(0);
    // Next roll: Ace fires again (into transit).
    const second = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 1, 2);
    expect(second.status, JSON.stringify(second.body)).toBe(200);
    const signal = (second.body['roll'] as Record<string, unknown>)['signal'] as Record<string, unknown>;
    expect(signal['wasDark']).toBe(false);
    expect((signal['sent'] as Record<string, unknown>)['additives']).toBe(60_000_000);
  });

  it('Emissary (FB-039): the roll that clears the marker pays the cash in transit', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 23, bankrollCents: 1_450_000_000, status: 'POINT_ACTIVE', phase: 'POINT_ACTIVE',
      currentPoint: 6, bets: PASS_ONLY(25_000_000), crewSlots: [SHARK, null, null, null, null],
    });
    // 4+2 = 6 → POINT_HIT clears the marker; Shark's 97_500_000 sent this roll is paid with the clear.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(25_000_000), 4, 2);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('TRANSITION');
    // (1_503_749_900, not …750_000: settleTurn loses $1 to float rounding on 25M × 1.15 — KI-079.)
    expect(r['bankrollCents']).toBe(1_601_249_900);
    expect(r['signalTransit']).toBeNull();
    expect(r['signalDarkRolls']).toBe(0);
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

// ---------------------------------------------------------------------------
// EXTORTION_FEE — The Foreman (marker 2): "The Cut" and "The Payoff" (FB-032)
//
// The Foreman still skims 20% of the profit on every winning roll (the Cut),
// but his room clears ONLY when the running Cut reaches the Payoff (2_500¢).
// Bankroll never clears it. Marker 2: target 20_000¢ (still drives bet limits),
// min bet 500¢, max bet 2_000¢.
//
// A natural on a 1_000¢ pass line: the +0.10 hype tick applies before payout,
// so profit = 1_100¢ and the Cut = Math.round(1_100 × 0.20 / 100) × 100 = 200¢.
// ---------------------------------------------------------------------------

describe('EXTORTION_FEE — The Foreman (marker 2): the Cut and the Payoff', () => {
  const FOREMAN = 2;
  const PAYOFF  = 2_500;

  async function rollAtForeman(
    setup: Parameters<typeof createRun>[1],
    bet: number, d1: number, d2: number,
  ) {
    const run = await createRun(userId, { currentMarkerIndex: FOREMAN, ...setup });
    const res = await rollWithDice(app, run.id, PASS_ONLY(bet), d1, d2);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return {
      run:  res.body['run'] as Record<string, unknown>,
      roll: res.body['roll'] as Record<string, unknown>,
    };
  }

  it('a win adds his 20% skim to the Cut', async () => {
    const { run, roll } = await rollAtForeman({ bankrollCents: 10_000 }, 1_000, 3, 4); // natural
    expect(run['bossProgressCents']).toBe(200);
    expect(roll['bossCut']).toEqual({ amount: 200, total: 200, payoff: PAYOFF, paidOff: false });
    expect(run['currentMarkerIndex']).toBe(FOREMAN);
  });

  it('a losing roll adds nothing', async () => {
    const { run, roll } = await rollAtForeman({ bankrollCents: 10_000, bossProgressCents: 1_000 }, 1_000, 1, 1); // craps
    expect(run['bossProgressCents']).toBe(1_000);
    expect((roll['bossCut'] as Record<string, unknown>)['amount']).toBe(0);
  });

  it('a bankroll at/above the $200 target does NOT clear his room', async () => {
    const { run } = await rollAtForeman({ bankrollCents: 30_000 }, 1_000, 3, 4); // natural, rich
    expect(run['status']).toBe('IDLE_TABLE');
    expect(run['currentMarkerIndex']).toBe(FOREMAN);
  });

  it('crossing the Payoff clears the room even with a low bankroll, and resets the Cut', async () => {
    const { run, roll } = await rollAtForeman({ bankrollCents: 3_000, bossProgressCents: 2_400 }, 1_000, 3, 4);
    expect((roll['bossCut'] as Record<string, unknown>)['paidOff']).toBe(true);
    expect(run['status']).toBe('TRANSITION');
    expect(run['currentMarkerIndex']).toBe(FOREMAN + 1);
    expect(run['bossProgressCents']).toBe(0);
  });

  it('a Cut already at the Payoff clears on the next roll request (pre-roll check)', async () => {
    const run = await createRun(userId, { currentMarkerIndex: FOREMAN, bankrollCents: 3_000, bossProgressCents: PAYOFF });
    const res = await rollWithDice(app, run.id, PASS_ONLY(0), 3, 4);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const r = res.body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('TRANSITION');
    expect(r['currentMarkerIndex']).toBe(FOREMAN + 1);
    expect(r['bossProgressCents']).toBe(0);
  });

  it('losing the last shooter short of the Payoff is game over, however big the bankroll', async () => {
    const { run } = await rollAtForeman({
      bankrollCents: 30_000,
      bossProgressCents: 1_000,
      status: 'POINT_ACTIVE', phase: 'POINT_ACTIVE', currentPoint: 8,
      bets: PASS_ONLY(1_000),
      shooters: 1,
    }, 1_000, 3, 4); // seven-out
    expect(run['status']).toBe('GAME_OVER');
  });

  it('leaving the pub resets the Cut', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: FOREMAN, status: 'TRANSITION', bankrollCents: 5_000, bossProgressCents: 1_800,
    });
    const res = await app.inject({
      method:  'POST',
      url:     `/api/v1/runs/${run.id}/recruit`,
      headers: { 'content-type': 'application/json', 'x-test-user-id': TEST_CLERK_ID },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode, res.body).toBe(200);
    const after = await rollWithDice(app, run.id, PASS_ONLY(1_000), 1, 1); // craps: no cut
    expect((after.body['run'] as Record<string, unknown>)['bossProgressCents']).toBe(0);
  });

  it('normal markers ignore the Cut and still clear on bankroll', async () => {
    const run = await createRun(userId, { currentMarkerIndex: 1, bankrollCents: 9_500 }); // target 10_000
    const res = await rollWithDice(app, run.id, PASS_ONLY(1_000), 3, 4);
    const r = res.body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('TRANSITION');
    expect((res.body['roll'] as Record<string, unknown>)['bossCut']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// THE COVENANT — "The Order Protects" (FB-036, Hierophant comp, perk id 5)
//
// Once per marker, the first Seven-Out doesn't cost a shooter (bets are still
// lost, Hype still resets). runs.covenant_spent_marker records where it was used.
// Marker 15 (Floor 6, Atlantis): target 15_000_000¢ → min bet 250_000¢.
// ---------------------------------------------------------------------------

describe('THE COVENANT — The Order Protects (FB-036)', () => {
  const COVENANT = 5;
  const sevenOutRun = (overrides: Record<string, unknown> = {}) => createRun(userId, {
    currentMarkerIndex: 15,
    bankrollCents:      10_000_000,
    status:             'POINT_ACTIVE',
    phase:              'POINT_ACTIVE',
    currentPoint:       6,
    shooters:           3,
    hype:               2.0,
    bets:               PASS_ONLY(250_000),
    compPerkIds:        [COVENANT],
    ...overrides,
  });

  it('the first Seven-Out at a marker keeps the shooter (bets lost, Hype resets)', async () => {
    const run = await sevenOutRun();
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(250_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['shooters']).toBe(3);
    expect(r['covenantSpentMarker']).toBe(15);
    expect(r['phase']).toBe('COME_OUT');
    expect(r['hype']).toBe(1.0);
    expect(r['bankrollCents']).toBe(10_000_000);   // the Pass Line stake is gone (it was already off the bankroll)
    expect((body['roll'] as Record<string, unknown>)['covenantSaved']).toBe(true);
  });

  it('the second Seven-Out at the same marker costs a shooter', async () => {
    const run = await sevenOutRun({ covenantSpentMarker: 15 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(250_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['shooters']).toBe(2);
    expect((body['roll'] as Record<string, unknown>)['covenantSaved']).toBeUndefined();
  });

  it('a new marker brings it back', async () => {
    const run = await sevenOutRun({ currentMarkerIndex: 16, covenantSpentMarker: 15 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(250_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['shooters']).toBe(3);
    expect((body['run'] as Record<string, unknown>)['covenantSpentMarker']).toBe(16);
  });

  it('saves the last shooter — the run goes on', async () => {
    const run = await sevenOutRun({ shooters: 1 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(250_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['shooters']).toBe(1);
    expect(r['status']).not.toBe('GAME_OVER');
  });

  // KI-084: Lefty only saves a shooter by re-rolling OUT of the 7.
  const LEFTY = { crewId: 1, cooldownState: 0 };

  it('Lefty re-rolls another 7 and there is no Covenant — the shooter is lost', async () => {
    vi.mocked(rollDice).mockReturnValueOnce([3, 4]);
    const run = await sevenOutRun({ compPerkIds: [], crewSlots: [LEFTY, null, null, null, null] });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(250_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['roll'] as Record<string, unknown>)['rollResult']).toBe('SEVEN_OUT');
    expect((body['run'] as Record<string, unknown>)['shooters']).toBe(2);
  });

  it('Lefty re-rolls another 7 — The Covenant catches it', async () => {
    vi.mocked(rollDice).mockReturnValueOnce([3, 4]);
    const run = await sevenOutRun({ crewSlots: [LEFTY, null, null, null, null] });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(250_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['shooters']).toBe(3);
    expect((body['run'] as Record<string, unknown>)['covenantSpentMarker']).toBe(15);
    expect((body['roll'] as Record<string, unknown>)['covenantSaved']).toBe(true);
  });

  it('Lefty re-rolls out of the 7 — no Seven-Out, and The Covenant is kept for later', async () => {
    // rollDice is pinned to [2, 3] (a blank) for this file.
    const run = await sevenOutRun({ crewSlots: [LEFTY, null, null, null, null] });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(250_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['roll'] as Record<string, unknown>)['rollResult']).not.toBe('SEVEN_OUT');
    expect((body['run'] as Record<string, unknown>)['shooters']).toBe(3);
    expect((body['run'] as Record<string, unknown>)['covenantSpentMarker']).toBeNull();
  });

  it('does nothing without the comp', async () => {
    const run = await sevenOutRun({ compPerkIds: [] });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(250_000), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['shooters']).toBe(2);
    expect((body['run'] as Record<string, unknown>)['covenantSpentMarker']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TIDAL_SURGE — The Sovereign's tide rhythm (FB-037), marker 17
//
// Target 50_000_000¢ → max bet 5_000_000¢, min bet 833_500¢. bossPointHits is
// the tide position: 0 LOW (Dead Calm) · 1 EBB (Undertow) · 2 HIGH (High Tide)
// · 3 FLOW (Undertow). It advances when a come-out cycle resolves.
// ---------------------------------------------------------------------------

describe('TIDAL_SURGE — The Sovereign: Dead Calm · Undertow · High Tide (FB-037)', () => {
  const PASS = 833_500;
  const WITH_ODDS = (pass: number, odds: number): Bets => ({ ...PASS_ONLY(pass), odds });
  const tideRun = (bossPointHits: number, overrides: Record<string, unknown> = {}) => createRun(userId, {
    currentMarkerIndex: 17,
    bankrollCents:      20_000_000,
    status:             'POINT_ACTIVE',
    phase:              'POINT_ACTIVE',
    currentPoint:       6,
    shooters:           5,
    bossPointHits,
    bets:               PASS_ONLY(PASS),
    ...overrides,
  });

  it('Dead Calm (LOW): adding odds is rejected', async () => {
    const run = await tideRun(0);
    const { status, body } = await rollWithDice(app, run.id, WITH_ODDS(PASS, 1_000_000), 2, 3);
    expect(status).toBe(422);
    expect(String(body['error'])).toMatch(/DEAD CALM/);
  });

  it('odds are fine at the other stages', async () => {
    const run = await tideRun(1);
    const { status, body } = await rollWithDice(app, run.id, WITH_ODDS(PASS, 1_000_000), 2, 3);
    expect(status, JSON.stringify(body)).toBe(200);
  });

  it('the Undertow (EBB): a Seven-Out drags 35% of the bankroll and costs one shooter', async () => {
    const run = await tideRun(1);
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(13_000_000);   // 20_000_000 − 35%
    expect(r['shooters']).toBe(4);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['tide']).toEqual({ stage: 1, nextStage: 2, undertowCents: 7_000_000 });
    const receipt = roll['receipt'] as { lines: { text: string }[] };
    expect(receipt.lines.some((l) => l.text === 'The Sovereign: $70000.00 undertow')).toBe(true);
  });

  it('High Tide (HIGH): a Seven-Out drowns two shooters — no undertow', async () => {
    const run = await tideRun(2);
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['shooters']).toBe(3);
    expect(r['bankrollCents']).toBe(20_000_000);
    expect((body['roll'] as Record<string, unknown>)['tide']).toEqual({ stage: 2, nextStage: 3, waveShooters: 2 });
  });

  it('High Tide on your last two shooters ends the run', async () => {
    const run = await tideRun(2, { shooters: 2 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['shooters']).toBe(0);
    expect(r['status']).toBe('GAME_OVER');
  });

  it('The Covenant turns the whole wave back', async () => {
    const run = await tideRun(2, { compPerkIds: [5] });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect((body['run'] as Record<string, unknown>)['shooters']).toBe(5);
    expect(roll['covenantSaved']).toBe(true);
    expect(roll['tide']).toEqual({ stage: 2, nextStage: 3, waveShooters: 0 });
  });

  it('Lefty re-rolling out of the 7 means no wave at all', async () => {
    // rollDice is pinned to [2, 3] (a blank) for this file.
    const run = await tideRun(2, { crewSlots: [{ crewId: 1, cooldownState: 0 }, null, null, null, null] });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['shooters']).toBe(5);
    expect(((body['roll'] as Record<string, unknown>)['tide'] as Record<string, unknown>)['waveShooters']).toBeUndefined();
  });

  it('a blank holds the stage; a point set holds it too', async () => {
    const run = await tideRun(1);
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 2, 3);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['roll'] as Record<string, unknown>)['tide']).toEqual({ stage: 1, nextStage: 1 });
  });
});

// ---------------------------------------------------------------------------
// ORBITAL_DECAY — The Commander's orbital bleed (FB-038), marker 20
//
// Target 300_000_000¢ → max bet 30_000_000¢, min bet 5_000_000¢. After every
// roll that isn't a Seven-Out, Hype above 1.0× loses 20% of its height; a
// Seven-Out resets to 1.0× (no Keepsake in his fight).
// ---------------------------------------------------------------------------

describe('ORBITAL_DECAY — The Commander: the orbital bleed (FB-038)', () => {
  const PASS = 5_000_000;
  const orbitRun = (hype: number, overrides: Record<string, unknown> = {}) => createRun(userId, {
    currentMarkerIndex: 20,
    bankrollCents:      100_000_000,
    status:             'POINT_ACTIVE',
    phase:              'POINT_ACTIVE',
    currentPoint:       6,
    hype,
    bets:               PASS_ONLY(PASS),
    ...overrides,
  });

  it('a blank at 2.0× bleeds 20% of the height above 1.0× → 1.80×', async () => {
    const run = await orbitRun(2.0);
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 2, 3);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['hype']).toBeCloseTo(1.8, 4);
    expect((body['roll'] as Record<string, unknown>)['orbit']).toEqual({ bleed: 0.2, hype: 1.8 });
  });

  it('at 1.0× there is nothing to bleed', async () => {
    const run = await orbitRun(1.0);
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 2, 3);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['hype']).toBe(1.0);
    expect((body['roll'] as Record<string, unknown>)['orbit']).toEqual({ bleed: 0, hype: 1.0 });
  });

  it('a point hit pays at full Hype, then the orbit bleeds what is carried forward', async () => {
    const run = await orbitRun(2.0);
    // 4+2 = 6 → POINT_HIT; Hype ticks 2.0 → 2.15, then bleeds to 1 + 1.15 × 0.8 = 1.92.
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 4, 2);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['hype']).toBeCloseTo(1.92, 4);
    // Paid at 2.15×: 5_000_000 stake + floor(5_000_000 × 2.15).
    expect((body['roll'] as Record<string, unknown>)['bankrollDelta']).toBe(5_000_000 + 10_750_000);
  });

  it('a Seven-Out resets to 1.0× — The Keepsake does not apply up here', async () => {
    const run = await orbitRun(3.0, { compPerkIds: [2] });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(PASS), 3, 4);
    expect(status, JSON.stringify(body)).toBe(200);
    expect((body['run'] as Record<string, unknown>)['hype']).toBe(1.0);
    expect(((body['roll'] as Record<string, unknown>)['orbit'] as Record<string, unknown>)['bleed']).toBe(0);
  });
});
