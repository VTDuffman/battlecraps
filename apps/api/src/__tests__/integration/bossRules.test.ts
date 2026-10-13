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
// Formula: bossMinBet = Math.ceil(targetCents * rawPct / 100) * 100
//   bossPointHits=0: rawPct=0.05 → ceil(100_000*0.05/100)*100 = ceil(50)*100 = 5000¢
//   bossPointHits=1: rawPct=0.07 → ceil(100_000*0.07/100)*100
//     100_000 * 0.07 = 7000.0000000006661 (float) → ceil(70.00000000000066) = 71 → 7100¢
// ---------------------------------------------------------------------------

describe('RISING_MIN_BETS — Sarge (marker 5)', () => {
  // Each test sets the run up AT marker index 5 with a bankroll well above
  // 5000¢ minimum but far enough below the 100_000¢ target to avoid auto-clear.

  it('at bossPointHits=0: accepts 5000¢ bet and rejects 4900¢', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 5,
      bankrollCents:      20_000, // well below 100_000 target
      bossPointHits:      0,
    });

    // 5000¢ = the minimum at 0 hits → should be accepted
    const okResult = await rollWithDice(app, run.id, PASS_ONLY(5000), 3, 4); // natural
    expect(okResult.status).toBe(200);
  });

  it('at bossPointHits=0: rejects 4900¢ (below boss min of 5000¢)', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 5,
      bankrollCents:      20_000,
      bossPointHits:      0,
    });

    const result = await rollWithDice(app, run.id, PASS_ONLY(4900), 3, 4);
    expect(result.status).toBe(422);
  });

  it('at bossPointHits=1: boss min is 7100¢ (not 7000¢) due to float precision', async () => {
    // 100_000 * 0.07 = 7000.000…0666 in IEEE-754 → ceil(70.000…0066) = 71 → 7100¢
    const run = await createRun(userId, {
      currentMarkerIndex: 5,
      bankrollCents:      50_000,
      bossPointHits:      1,
    });

    // 7000¢ is below the 7100¢ boss minimum → rejected
    const bad = await rollWithDice(app, run.id, PASS_ONLY(7000), 3, 4);
    expect(bad.status).toBe(422);

    // Need a fresh run after the rejection consumed no state
    const run2 = await createRun(userId, {
      currentMarkerIndex: 5,
      bankrollCents:      50_000,
      bossPointHits:      1,
    });
    const good = await rollWithDice(app, run2.id, PASS_ONLY(7100), 3, 4);
    expect(good.status).toBe(200);
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
    // passLine=25_000¢, NATURAL: raw profit=25_000¢
    // bonus = Math.round(25_000 * 0.15 / 100) * 100 = 3_800¢
    // payout = 25_000 (stake) + 25_000 (profit) + 3_800 (bonus) = 53_800¢
    // newBankroll = 300_000 − 25_000 (betDelta) + 53_800 = 328_800¢
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
    expect(r['bankrollCents']).toBe(328_800);
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
