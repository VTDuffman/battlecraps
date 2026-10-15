// =============================================================================
// INTEGRATION — FB-041 crew-cash taper
// Floor-scaled crew cash uses getCrewCashBaseCents(markerIndex): the table max
// × the floor's crew-cash scale (×1.0 on Floors 1–4, ×0.8 → ×0.45 on 5–9).
// =============================================================================

import { vi, describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

vi.mock('../../lib/io.js', () => ({
  getIO:   vi.fn(() => ({ to: vi.fn(() => ({ emit: vi.fn() })) })),
  initIO:  vi.fn(),
  resetIO: vi.fn(),
}));

import type { FastifyInstance } from 'fastify';
import { getCrewCashBaseCents, getMaxBet, getMinBet, type Bets } from '@battlecraps/shared';
import {
  buildTestApp,
  createTestUser,
  createRun,
  rollWithDice,
  resetTestDb,
} from '../helpers/testSetup.js';

const DOORMAN_ID   = 24;    // +0.25× the crew-cash base on every come-out roll
const DOORMAN_MULT = 0.25;

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

/** A come-out point-set roll (2+2 = 4) with only The Doorman seated: the only payout is his crew cash. */
async function doormanPointSet(markerIndex: number) {
  const bet      = getMinBet(markerIndex);
  const bankroll = 10 * getMaxBet(markerIndex);  // well below the marker target
  const run = await createRun(userId, {
    currentMarkerIndex: markerIndex,
    bankrollCents:      bankroll,
    crewSlots:          [{ crewId: DOORMAN_ID, cooldownState: 0 }, null, null, null, null],
  });
  const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(bet), 2, 2);
  const r = body['run'] as Record<string, unknown>;
  return { status, crewCash: (r['bankrollCents'] as number) - (bankroll - bet) };
}

describe('Crew-cash taper', () => {
  it('Floor 4 (marker 9) pays full strength: 0.25 × the table max', async () => {
    const { status, crewCash } = await doormanPointSet(9);
    expect(status).toBe(200);
    expect(getCrewCashBaseCents(9)).toBe(getMaxBet(9));
    expect(crewCash).toBe(Math.round(DOORMAN_MULT * getMaxBet(9) / 100) * 100);
  });

  it('Floor 6 (marker 15) pays ×0.7: 0.25 × 0.7 × the table max', async () => {
    const { status, crewCash } = await doormanPointSet(15);
    expect(status).toBe(200);
    expect(getCrewCashBaseCents(15)).toBe(Math.floor(getMaxBet(15) * 0.7));
    expect(crewCash).toBe(Math.round(DOORMAN_MULT * getMaxBet(15) * 0.7 / 100) * 100);
  });

  it('Floor 9 (marker 24) pays ×0.45', async () => {
    const { status, crewCash } = await doormanPointSet(24);
    expect(status).toBe(200);
    expect(crewCash).toBe(Math.round(DOORMAN_MULT * Math.floor(getMaxBet(24) * 0.45) / 100) * 100);
  });
});
