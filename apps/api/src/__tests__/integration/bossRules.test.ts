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
