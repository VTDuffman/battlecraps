// =============================================================================
// INTEGRATION — The Vig comp on the roll receipt
//
// The Vig (Floor 1 comp, perk id 4) pays crew cash 20% more, applied after the
// cascade. The crew lines show each bonus as earned, so the Vig's share gets
// its own receipt line — the money lines must add up to the roll's Net.
//
// "Ace" McGee (ID 17) adds 0.40× the crew-cash base (FB-041: max bet × the floor's scale) whenever a 1 shows. Every roll here
// is a 1+2 blank in the point phase, so the only money is crew cash.
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
import type { Bets, RollReceipt } from '@battlecraps/shared';

const THE_VIG = 4;
const ACE     = { crewId: 17, cooldownState: 0 };

const PASS_ONLY = (amt: number): Bets => ({
  passLine: amt,
  odds:     0,
  hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
});

/** Sum of the receipt's money lines: win lines add, loss lines subtract. */
const sumMoneyLines = (receipt: RollReceipt): number =>
  receipt.lines.reduce((sum, l) => {
    const m = /\$(\d+)\.(\d{2})/.exec(l.text);
    if (!m || (l.kind !== 'win' && l.kind !== 'loss')) return sum;
    const cents = Number(m[1]) * 100 + Number(m[2]);
    return l.kind === 'win' ? sum + cents : sum - cents;
  }, 0);

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

async function blankWithAce(setup: Parameters<typeof createRun>[1], bet: number) {
  const run = await createRun(userId, {
    status:       'POINT_ACTIVE',
    phase:        'POINT_ACTIVE',
    currentPoint: 6,
    bets:         PASS_ONLY(bet),
    crewSlots:    [ACE, null, null, null, null],
    compPerkIds:  [THE_VIG],
    ...setup,
  });
  // 1+2 = 3 → blank in the point phase; Ace fires on the 1.
  const { status, body } = await rollWithDice(app, run.id, PASS_ONLY(bet), 1, 2);
  expect(status, JSON.stringify(body)).toBe(200);
  const roll = body['roll'] as Record<string, unknown>;
  return {
    run:     body['run'] as Record<string, unknown>,
    roll,
    receipt: roll['receipt'] as RollReceipt,
  };
}

describe('The Vig — receipt line', () => {
  it('itemizes the +20% so the crew-cash lines add up to Net', async () => {
    // Marker 5: target 100_000¢ → max bet 10_000¢ → Ace = 4_000¢; Vig → 4_800¢.
    const { run, receipt } = await blankWithAce({ currentMarkerIndex: 5, bankrollCents: 50_000 }, 2_000);

    expect(receipt.lines).toContainEqual({ kind: 'win', text: '"Ace" McGee: $40.00' });
    expect(receipt.lines).toContainEqual({ kind: 'win', text: 'The Vig: $8.00 (+20% crew cash)' });
    expect(receipt.netDelta).toBe(4_800);
    expect(sumMoneyLines(receipt)).toBe(receipt.netDelta);
    expect(run['bankrollCents']).toBe(54_800);
  });

  it('adds no line without The Vig', async () => {
    const { receipt } = await blankWithAce({ currentMarkerIndex: 5, bankrollCents: 50_000, compPerkIds: [] }, 2_000);

    expect(receipt.lines.some((l) => l.text.startsWith('The Vig'))).toBe(false);
    expect(receipt.netDelta).toBe(4_000);
    expect(sumMoneyLines(receipt)).toBe(receipt.netDelta);
  });

  it('Hierophant: the Vig share goes to the offering and does not inflate Net', async () => {
    // Marker 14: max bet 1_000_000¢ × 0.8 (FB-041, Floor 5) → Ace = 320_000¢; Vig → 384_000¢, all held.
    const { run, receipt } = await blankWithAce({
      currentMarkerIndex: 14, bankrollCents: 2_000_000, pendingAdditiveCents: 100_000,
    }, 166_500);

    expect(receipt.lines).toContainEqual({ kind: 'info', text: 'The Vig: $640.00 (+20% crew cash) → the offering' });
    expect(receipt.netDelta).toBe(0);
    expect(sumMoneyLines(receipt)).toBe(0);
    expect(run['pendingAdditiveCents']).toBe(484_000);
  });

  it('Emissary: the Vig share goes into transit with the crew cash', async () => {
    // Marker 23: max bet 150_000_000¢ × 0.5 (FB-041, Floor 8) → Ace = 30_000_000¢; Vig → 36_000_000¢ in transit.
    const { run, receipt } = await blankWithAce({ currentMarkerIndex: 23, bankrollCents: 200_000_000 }, 25_000_000);

    expect(receipt.lines).toContainEqual({ kind: 'info', text: 'The Vig: $60000.00 (+20% crew cash) → in transit' });
    expect(receipt.netDelta).toBe(0);
    expect(sumMoneyLines(receipt)).toBe(0);
    expect(run['signalTransit']).toEqual({ additives: 36_000_000, hype: 0, multipliers: [] });
  });

  it('Architect: crew cash is no longer cut (load-bearing retired, FB-040) — the lines add up', async () => {
    // Marker 26: max bet 600_000_000¢ × 0.45 (FB-041, Floor 9) = 270_000_000¢ → Ace = 108_000_000¢;
    // Vig → 129_600_000¢, paid in full. Sarge's room is in force (a blank just ticks his clock).
    const { receipt } = await blankWithAce({
      currentMarkerIndex: 26, bankrollCents: 500_000_000, unlockedSlots: 5, bossPointHits: 0,
      convergenceRooms: [5, 2, 8, 11, 14, 17, 20, 23], convergenceState: { clock: 0, charm: 0, rating: 2, tide: 0 },
    }, 100_000_000);

    expect(receipt.lines).toContainEqual({ kind: 'win', text: 'The Vig: $216000.00 (+20% crew cash)' });
    expect(receipt.lines.some((l) => l.text.includes('load-bearing'))).toBe(false);
    expect(receipt.netDelta).toBe(129_600_000);
    expect(sumMoneyLines(receipt)).toBe(receipt.netDelta);
  });
});
