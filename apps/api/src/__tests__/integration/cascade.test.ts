// =============================================================================
// INTEGRATION — crew ability cascade through the full stack
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

// Crew IDs
const BIG_SPENDER_ID  = 7;
const SHARK_ID        = 8;
const OLD_PRO_ID      = 14;
const LUCKY_CHARM_ID  = 15;

const slot = (crewId: number) => ({ crewId, cooldownState: 0 });

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
// Big Spender — additive fires on hardway win
// ---------------------------------------------------------------------------

describe('Big Spender (ID 7)', () => {
  it('adds 800¢ additive (1.5× maxBet at marker 0) when a hardway bet wins', async () => {
    // Marker 0: target=5000¢, maxBet=500¢ → additive = round(1.5*500/100)*100 = 800¢
    // Setup: POINT_ACTIVE on 6 with passLine 500 and hard6 500
    // bankroll pre-deducted: 3000 - 500 (pass) - 500 (hard6) = 2000
    const run = await createRun(userId, {
      bankrollCents: 2000,
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  6,
      bets: {
        passLine: 500,
        odds:     0,
        hardways: { hard4: 0, hard6: 500, hard8: 0, hard10: 0 },
      },
      crewSlots: [slot(BIG_SPENDER_ID), null, null, null, null],
    });

    // Roll 3+3 = hard 6 → POINT_HIT + hardway win
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 500, hard8: 0, hard10: 0 } },
      3, 3,
    );

    expect(status).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('POINT_HIT');

    // hype seeded +0.15 for POINT_HIT (streak=0) → 1.15
    // Without Big Spender: amplifiedProfit = floor(5000*1.15/100)*100 = floor(57.5)*100 = 5700
    //   payout = 1000 (stakes) + 5700 = 6700 → bankroll = 8700
    // With Big Spender: additives=800 → floor(5800*1.15/100)*100 = floor(66.7)*100 = 6600
    //   payout = 1000 + 6600 = 7600 → bankroll = 2000 + 7600 = 9600
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(9600);
  });

  it('does NOT fire on a natural (no hardway bet wins)', async () => {
    const run = await createRun(userId, {
      bankrollCents: 3000,
      crewSlots:     [slot(BIG_SPENDER_ID), null, null, null, null],
    });

    // Natural 7 — no hardway wins
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    // Without Big Spender firing: bankroll = 3000 - 500 + (500+500) = 3500
    expect(r['bankrollCents']).toBe(3500);
  });
});

// ---------------------------------------------------------------------------
// Shark — additive fires on any POINT_HIT
// ---------------------------------------------------------------------------

describe('Shark (ID 8)', () => {
  it('adds 600¢ additive (1.25× maxBet at marker 0) on POINT_HIT', async () => {
    // Marker 0: maxBet=500¢ → additive = round(1.25*500/100)*100 = Math.round(6.25)*100 = 600¢
    // Setup: POINT_ACTIVE on 6, passLine 500 only
    // bankroll pre-deducted: 3000 - 500 = 2500
    const run = await createRun(userId, {
      bankrollCents: 2500,
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  6,
      bets: { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      crewSlots: [slot(SHARK_ID), null, null, null, null],
    });

    // Roll 4+2 = soft 6 (POINT_HIT, not hardway)
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      4, 2,
    );

    expect(status).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('POINT_HIT');

    // hype seeded +0.15 for POINT_HIT (streak=0) → 1.15
    // Without Shark: floor(500*1.15/100)*100 = floor(5.75)*100 = 500, payout = 1000, bankroll = 3500
    // With Shark: additives=600 → floor(1100*1.15/100)*100 = floor(12.65)*100 = 1200
    //   payout = 500 (stake) + 1200 = 1700, bankroll = 2500+1700 = 4200
    const r = body['run'] as Record<string, unknown>;
    expect(r['bankrollCents']).toBe(4200);
  });
});

// ---------------------------------------------------------------------------
// Old Pro — raises table max from 10% to 15% of marker target
// ---------------------------------------------------------------------------

describe('Old Pro (ID 14)', () => {
  it('allows a 600¢ pass-line bet at marker 0 (maxBet raises from 500 to 750)', async () => {
    // Without Old Pro: maxBet = floor(5000*0.10) = 500; 600 > 500 → 422
    // With Old Pro:    maxBet = floor(5000*0.15) = 750; 600 ≤ 750 → OK
    const run = await createRun(userId, {
      bankrollCents: 3000,
      crewSlots:     [slot(OLD_PRO_ID), null, null, null, null],
    });

    const { status } = await rollWithDice(
      app, run.id,
      { passLine: 600, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4, // natural — just need the roll to succeed
    );

    expect(status).toBe(200);
  });

  it('rejects a 600¢ pass-line bet at marker 0 WITHOUT Old Pro (maxBet is 500)', async () => {
    const run = await createRun(userId, { bankrollCents: 3000 });

    const { status } = await rollWithDice(
      app, run.id,
      { passLine: 600, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// Lucky Charm — +1.0 hype on SEVEN_OUT, next shooter starts at 2.0×
// ---------------------------------------------------------------------------

describe('Lucky Charm (ID 15)', () => {
  it('next shooter starts at 2.0× hype after a seven-out when Lucky Charm is on rail', async () => {
    const run = await createRun(userId, {
      bankrollCents: 2500,
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  8,
      bets: { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      crewSlots: [slot(LUCKY_CHARM_ID), null, null, null, null],
      hype: 1.0,
    });

    // Roll 3+4=7 → SEVEN_OUT
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(200);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('SEVEN_OUT');

    // Lucky Charm fires → hype in cascade = 1.0 + 1.0 = 2.0
    // cascadeHypeDelta = 2.0 - 1.0 = 1.0
    // nextHype = max(1.0, 1.0 + 1.0) = 2.0
    const r = body['run'] as Record<string, unknown>;
    expect(r['hype']).toBeCloseTo(2.0, 4);
  });

  it('hype resets to 1.0 on SEVEN_OUT without Lucky Charm', async () => {
    const run = await createRun(userId, {
      bankrollCents: 2500,
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  8,
      bets: { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      hype: 1.8,
    });

    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['hype']).toBeCloseTo(1.0, 4);
  });
});
