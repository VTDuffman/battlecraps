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
} from '../helpers/testSetup.js';
import type { Bets } from '@battlecraps/shared';

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
// FOURS_INSTANT_LOSS (The Executive — marker index 11, $12,500)
// ---------------------------------------------------------------------------

describe('FOURS_INSTANT_LOSS — The Executive (marker 11)', () => {
  it('rolling a 4 on come-out triggers GAME_OVER regardless of bankroll', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      500_000, // healthy bankroll — still instant loss
      bets:               { passLine: 0, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
    });

    // Roll 1+3 = 4 → instant loss (passLine 25_000 satisfies minBet=21_000 at marker 11)
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      1, 3,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('GAME_OVER');

    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('POINT_SET'); // raw outcome before the instant-loss override
    expect(roll['diceTotal']).toBe(4);
  });

  it('rolling a 2+2 (hard 4) also triggers GAME_OVER', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      500_000,
    });

    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      2, 2,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('GAME_OVER');
  });

  it('does NOT trigger on non-4 totals', async () => {
    const run = await createRun(userId, {
      currentMarkerIndex: 11,
      bankrollCents:      500_000,
    });

    // Roll 3+4=7 — natural, should not trigger instant loss
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 25_000, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).not.toBe('GAME_OVER');
  });
});
