// =============================================================================
// INTEGRATION — core roll outcomes
// =============================================================================

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../lib/io.js', () => ({
  getIO:   vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
  initIO:  vi.fn(),
  resetIO: vi.fn(),
}));

import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { runs } from '../../db/schema.js';
import {
  buildTestApp,
  createTestUser,
  createRun,
  rollWithDice,
  resetTestDb,
  TEST_CLERK_ID,
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
// Natural (7 or 11 on come-out)
// ---------------------------------------------------------------------------

describe('Natural — 7 on come-out', () => {
  it('increases bankroll by pass-line bet, hype ticks +0.10, status stays IDLE_TABLE', async () => {
    const run = await createRun(userId, { bankrollCents: 3000 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(500), 3, 4); // 3+4=7

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('IDLE_TABLE');
    expect(r['phase']).toBe('COME_OUT');
    // bankroll: 3000 - 500 (bet placed) + 1000 (1:1 payout + stake) = 3500
    expect(r['bankrollCents']).toBe(3500);
    // hype: 1.0 + 0.10 = 1.10
    expect(r['hype']).toBeCloseTo(1.10, 4);

    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('NATURAL');
    // net delta = +500 (profit only — deduct-on-placement: stake was already out)
    expect(roll['bankrollDelta']).toBe(500);
  });
});

describe('Natural — 11 on come-out', () => {
  it('resolves the same as a 7', async () => {
    const run = await createRun(userId, { bankrollCents: 3000 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(500), 5, 6); // 5+6=11

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('IDLE_TABLE');
    expect(r['bankrollCents']).toBe(3500);
    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('NATURAL');
  });
});

// ---------------------------------------------------------------------------
// Craps-out (2, 3, 12 on come-out)
// ---------------------------------------------------------------------------

describe('Craps-out — 2 on come-out', () => {
  it('decreases bankroll by pass-line bet, hype ticks -0.05, status stays IDLE_TABLE', async () => {
    const run = await createRun(userId, { bankrollCents: 3000 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(500), 1, 1); // 1+1=2

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('IDLE_TABLE');
    // bankroll: 3000 - 500 = 2500 (bet lost)
    expect(r['bankrollCents']).toBe(2500);
    // hype floors at 1.0: 1.0 - 0.05 = 0.95 → floored at 1.0
    expect(r['hype']).toBeCloseTo(1.0, 4);

    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('CRAPS_OUT');
    expect(roll['bankrollDelta']).toBe(-500);
  });
});

// ---------------------------------------------------------------------------
// Point established
// ---------------------------------------------------------------------------

describe('Point established', () => {
  it('sets currentPoint, transitions to POINT_ACTIVE, no bankroll change', async () => {
    const run = await createRun(userId, { bankrollCents: 3000 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(500), 2, 4); // 2+4=6

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('POINT_ACTIVE');
    expect(r['phase']).toBe('POINT_ACTIVE');
    expect(r['currentPoint']).toBe(6);
    // bankroll unchanged — pass line was deducted on placement
    expect(r['bankrollCents']).toBe(2500); // 3000 - 500 betDelta

    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('POINT_SET');
    expect(roll['bankrollDelta']).toBe(-500);
  });
});

// ---------------------------------------------------------------------------
// Point hit
// ---------------------------------------------------------------------------

describe('Point hit', () => {
  it('pays odds, increments consecutive hits, hype ticks +0.25, returns to COME_OUT', async () => {
    // Set up a run in POINT_ACTIVE on 6, bankroll pre-deducted for the pass bet
    const run = await createRun(userId, {
      bankrollCents: 2500, // 3000 - 500 pass bet already deducted
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  6,
      bets:          { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
    });

    // Roll a 6 (point hit): 3+3
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 3,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('IDLE_TABLE');
    expect(r['phase']).toBe('COME_OUT');
    expect(r['currentPoint']).toBeNull();
    // pass line 1:1 profit=500, stake=500 returned. hype seeded to 1.25 before settle.
    // amplifiedProfit = floor(500 * 1.25 / 100) * 100 = floor(6.25) * 100 = 600
    // payout = 500 + 600 = 1100 → bankroll = 2500 + 1100 = 3600
    expect(r['bankrollCents']).toBe(3600);
    // hype: 1.0 + 0.25 = 1.25
    expect(r['hype']).toBeCloseTo(1.25, 4);

    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('POINT_HIT');
  });
});

// ---------------------------------------------------------------------------
// Seven-out
// ---------------------------------------------------------------------------

describe('Seven-out', () => {
  it('decrements shooters, resets hype to 1.0, stays IDLE_TABLE when shooters remain', async () => {
    const run = await createRun(userId, {
      bankrollCents: 2500,
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  8,
      bets:          { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      shooters:      5,
      hype:          1.5,
    });

    // Roll 3+4=7 (seven-out)
    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['shooters']).toBe(4);
    expect(r['hype']).toBeCloseTo(1.0, 4);
    expect(r['phase']).toBe('COME_OUT');
    expect(r['currentPoint']).toBeNull();

    const roll = body['roll'] as Record<string, unknown>;
    expect(roll['rollResult']).toBe('SEVEN_OUT');
  });

  it('triggers GAME_OVER when last shooter is lost', async () => {
    const run = await createRun(userId, {
      bankrollCents: 2500,
      status:        'POINT_ACTIVE',
      phase:         'POINT_ACTIVE',
      currentPoint:  8,
      bets:          { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      shooters:      1,
    });

    const { status, body } = await rollWithDice(
      app, run.id,
      { passLine: 500, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
      3, 4,
    );

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('GAME_OVER');
    expect(r['shooters']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Marker clear — bankroll crosses threshold on a natural
// ---------------------------------------------------------------------------

describe('Marker clear', () => {
  it('transitions to TRANSITION when bankroll crosses marker target on NATURAL', async () => {
    // Marker 0 target = 5000¢. Place the run just below.
    // bankroll 4600, pass bet 500 → post-bet = 4100 (below 5000)
    // After win: 4100 + 500*2 = 5100 ≥ 5000 → TRANSITION
    const run = await createRun(userId, { bankrollCents: 4600, currentMarkerIndex: 0 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(500), 3, 4); // natural

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('TRANSITION');
    expect(r['currentMarkerIndex']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Game over via isBelowMinBet
// ---------------------------------------------------------------------------

describe('Game over — cannot afford min bet', () => {
  it('sets status GAME_OVER when craps-out leaves bankroll below minimum', async () => {
    // Min bet at marker 0 = getMinBet(0). getMaxBet(0) = 500, minBet = max(500, round(500/6/500)*500) = 500
    // bankroll 800 - 500 bet = 300 < 500 minBet → GAME_OVER
    const run = await createRun(userId, { bankrollCents: 800 });
    const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(500), 1, 1); // craps 2

    expect(status).toBe(200);
    const r = body['run'] as Record<string, unknown>;
    expect(r['status']).toBe('GAME_OVER');
  });
});

// ---------------------------------------------------------------------------
// DB persistence — run state is actually written
// ---------------------------------------------------------------------------

describe('Persistence', () => {
  it('persists bankroll change to the database after a roll', async () => {
    const run = await createRun(userId, { bankrollCents: 3000 });
    await rollWithDice(app, run.id, PASS_ONLY(500), 3, 4); // natural

    const dbRun = await db.query.runs.findFirst({ where: eq(runs.id, run.id) });
    expect(dbRun?.bankrollCents).toBe(3500);
  });
});
