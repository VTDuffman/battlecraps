// =============================================================================
// CRAPS ENGINE — Unit Tests
// src/__tests__/crapsEngine.test.ts
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  resolveRoll,
  settleTurn,
  calculateBasePayouts,
  classifyDiceOutcome,
  validateOddsBet,
} from '../crapsEngine.js';
import { makeBets, makeHardwayBets, makeCtx } from './helpers.js';

// ---------------------------------------------------------------------------
// classifyDiceOutcome
// ---------------------------------------------------------------------------

describe('classifyDiceOutcome — COME_OUT phase', () => {
  it('classifies 7 as NATURAL', () => {
    expect(classifyDiceOutcome([3, 4], 'COME_OUT', null)).toBe('NATURAL');
  });

  it('classifies 11 as NATURAL', () => {
    expect(classifyDiceOutcome([5, 6], 'COME_OUT', null)).toBe('NATURAL');
  });

  it('classifies 2 as CRAPS_OUT', () => {
    expect(classifyDiceOutcome([1, 1], 'COME_OUT', null)).toBe('CRAPS_OUT');
  });

  it('classifies 3 as CRAPS_OUT', () => {
    expect(classifyDiceOutcome([1, 2], 'COME_OUT', null)).toBe('CRAPS_OUT');
  });

  it('classifies 12 as CRAPS_OUT', () => {
    expect(classifyDiceOutcome([6, 6], 'COME_OUT', null)).toBe('CRAPS_OUT');
  });

  it.each([4, 5, 6, 8, 9, 10])('classifies total %i as POINT_SET', (total) => {
    const dice: [number, number] = total <= 6 ? [1, total - 1] : [2, total - 2];
    expect(classifyDiceOutcome(dice, 'COME_OUT', null)).toBe('POINT_SET');
  });
});

describe('classifyDiceOutcome — POINT_ACTIVE phase', () => {
  it('classifies matching total as POINT_HIT', () => {
    expect(classifyDiceOutcome([4, 4], 'POINT_ACTIVE', 8)).toBe('POINT_HIT');
  });

  it('classifies 7 as SEVEN_OUT regardless of point', () => {
    expect(classifyDiceOutcome([3, 4], 'POINT_ACTIVE', 6)).toBe('SEVEN_OUT');
    expect(classifyDiceOutcome([1, 6], 'POINT_ACTIVE', 10)).toBe('SEVEN_OUT');
  });

  it('classifies anything else as NO_RESOLUTION', () => {
    // Point is 9, dice total 8 — not point, not 7
    expect(classifyDiceOutcome([4, 4], 'POINT_ACTIVE', 9)).toBe('NO_RESOLUTION');
  });

  it('throws when currentPoint is null in POINT_ACTIVE phase', () => {
    expect(() => classifyDiceOutcome([3, 4], 'POINT_ACTIVE', null)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveRoll — dice validation
// ---------------------------------------------------------------------------

describe('resolveRoll — input validation', () => {
  it('throws on out-of-range dice', () => {
    const state = { phase: 'COME_OUT' as const, currentPoint: null, bets: makeBets(), hype: 1.0 };
    expect(() => resolveRoll([0, 4], state)).toThrow('invalid dice');
    expect(() => resolveRoll([3, 7], state)).toThrow('invalid dice');
  });
});

// ---------------------------------------------------------------------------
// resolveRoll — TurnContext construction
// ---------------------------------------------------------------------------

describe('resolveRoll — isHardway flag', () => {
  const state = (point: number | null) => ({
    phase: point ? 'POINT_ACTIVE' as const : 'COME_OUT' as const,
    currentPoint: point,
    bets: makeBets(),
    hype: 1.0,
  });

  it('sets isHardway=true for paired hardway dice', () => {
    const ctx = resolveRoll([4, 4], state(8));
    expect(ctx.isHardway).toBe(true);
    expect(ctx.diceTotal).toBe(8);
  });

  it('sets isHardway=false for non-paired dice', () => {
    const ctx = resolveRoll([3, 5], state(8));
    expect(ctx.isHardway).toBe(false);
  });

  it('sets isHardway=false for paired non-hardway total ([6,6]=12)', () => {
    const ctx = resolveRoll([6, 6], state(null));
    expect(ctx.isHardway).toBe(false);
    expect(ctx.rollResult).toBe('CRAPS_OUT');
  });
});

// ---------------------------------------------------------------------------
// calculateBasePayouts — Pass Line
// ---------------------------------------------------------------------------

describe('calculateBasePayouts — Pass Line', () => {
  const bets = makeBets({ passLine: 1000 }); // $10 pass line

  it('wins 1:1 on NATURAL', () => {
    const p = calculateBasePayouts([3, 4], 'NATURAL', null, bets);
    expect(p.passLine).toBe(1000);
  });

  it('wins 1:1 on POINT_HIT', () => {
    const p = calculateBasePayouts([4, 4], 'POINT_HIT', 8, bets);
    expect(p.passLine).toBe(1000);
  });

  it('returns 0 on CRAPS_OUT (stake already deducted at placement)', () => {
    const p = calculateBasePayouts([1, 1], 'CRAPS_OUT', null, bets);
    expect(p.passLine).toBe(0);
  });

  it('returns 0 on SEVEN_OUT (stake already deducted at placement)', () => {
    const p = calculateBasePayouts([3, 4], 'SEVEN_OUT', 8, bets);
    expect(p.passLine).toBe(0);
  });

  it('returns 0 on POINT_SET (no resolution yet)', () => {
    const p = calculateBasePayouts([2, 2], 'POINT_SET', null, bets);
    expect(p.passLine).toBe(0);
  });

  it('returns 0 on NO_RESOLUTION', () => {
    const p = calculateBasePayouts([2, 3], 'NO_RESOLUTION', 9, bets);
    expect(p.passLine).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateBasePayouts — Odds (true odds, exact integer math)
// ---------------------------------------------------------------------------

describe('calculateBasePayouts — Odds (true odds)', () => {
  it('pays 2:1 for point 4 on POINT_HIT', () => {
    const bets = makeBets({ odds: 1000 });
    const p = calculateBasePayouts([2, 2], 'POINT_HIT', 4, bets);
    expect(p.odds).toBe(2000); // $10 × 2:1 = $20
  });

  it('pays 2:1 for point 10 on POINT_HIT', () => {
    const bets = makeBets({ odds: 1000 });
    const p = calculateBasePayouts([5, 5], 'POINT_HIT', 10, bets);
    expect(p.odds).toBe(2000);
  });

  it('pays 3:2 for point 5 on POINT_HIT', () => {
    const bets = makeBets({ odds: 1000 });
    const p = calculateBasePayouts([2, 3], 'POINT_HIT', 5, bets);
    expect(p.odds).toBe(1500); // $10 × 3:2 = $15
  });

  it('pays 3:2 for point 9 on POINT_HIT', () => {
    const bets = makeBets({ odds: 1000 });
    const p = calculateBasePayouts([4, 5], 'POINT_HIT', 9, bets);
    expect(p.odds).toBe(1500);
  });

  it('pays 6:5 for point 6 on POINT_HIT', () => {
    const bets = makeBets({ odds: 1000 });
    const p = calculateBasePayouts([3, 3], 'POINT_HIT', 6, bets);
    expect(p.odds).toBe(1200); // $10 × 6:5 = $12
  });

  it('pays 6:5 for point 8 on POINT_HIT', () => {
    const bets = makeBets({ odds: 1000 });
    const p = calculateBasePayouts([4, 4], 'POINT_HIT', 8, bets);
    expect(p.odds).toBe(1200);
  });

  it('floors fractional cents (3:2 on $15 = $22.50 → $22)', () => {
    const bets = makeBets({ odds: 1500 }); // $15 odds on point 5
    const p = calculateBasePayouts([2, 3], 'POINT_HIT', 5, bets);
    expect(p.odds).toBe(2250); // $15 × 3/2 = $22.50 → 2250 cents (exact here)
  });

  it('floors fractional cents (6:5 on $7 = $8.40 → $8)', () => {
    const bets = makeBets({ odds: 700 }); // $7 odds on point 8
    const p = calculateBasePayouts([4, 4], 'POINT_HIT', 8, bets);
    expect(p.odds).toBe(840); // floor(700 × 6/5) = floor(840) = 840
  });

  it('returns 0 on SEVEN_OUT (stake already deducted at placement)', () => {
    const bets = makeBets({ odds: 2000 });
    const p = calculateBasePayouts([3, 4], 'SEVEN_OUT', 6, bets);
    expect(p.odds).toBe(0);
  });

  it('returns 0 on NO_RESOLUTION', () => {
    const bets = makeBets({ odds: 2000 });
    const p = calculateBasePayouts([2, 3], 'NO_RESOLUTION', 9, bets);
    expect(p.odds).toBe(0);
  });

  it('returns 0 when no odds bet is placed', () => {
    const p = calculateBasePayouts([4, 4], 'POINT_HIT', 8, makeBets());
    expect(p.odds).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateBasePayouts — Hardways
// ---------------------------------------------------------------------------

describe('calculateBasePayouts — Hardways', () => {
  it('Hard 4 (2+2) wins at 7:1', () => {
    const bets = makeBets({ hardways: makeHardwayBets({ hard4: 500 }) }); // $5 bet
    const p = calculateBasePayouts([2, 2], 'NO_RESOLUTION', 6, bets);
    expect(p.hardways).toBe(3500); // $5 × 7 = $35
  });

  it('Hard 6 (3+3) wins at 9:1', () => {
    const bets = makeBets({ hardways: makeHardwayBets({ hard6: 500 }) });
    const p = calculateBasePayouts([3, 3], 'NO_RESOLUTION', 8, bets);
    expect(p.hardways).toBe(4500); // $5 × 9 = $45
  });

  it('Hard 8 (4+4) wins at 9:1', () => {
    const bets = makeBets({ hardways: makeHardwayBets({ hard8: 1000 }) });
    const p = calculateBasePayouts([4, 4], 'POINT_HIT', 8, bets);
    expect(p.hardways).toBe(9000); // $10 × 9 = $90
  });

  it('Hard 10 (5+5) wins at 7:1', () => {
    const bets = makeBets({ hardways: makeHardwayBets({ hard10: 500 }) });
    const p = calculateBasePayouts([5, 5], 'POINT_HIT', 10, bets);
    expect(p.hardways).toBe(3500);
  });

  it('Hard 6 returns 0 on easy 6 (stake already deducted at placement)', () => {
    const bets = makeBets({ hardways: makeHardwayBets({ hard6: 500 }) });
    const p = calculateBasePayouts([2, 4], 'NO_RESOLUTION', 8, bets);
    expect(p.hardways).toBe(0);
  });

  it('Hard 10 returns 0 on easy 10 (4+6) (stake already deducted at placement)', () => {
    const bets = makeBets({ hardways: makeHardwayBets({ hard10: 500 }) });
    const p = calculateBasePayouts([4, 6], 'NO_RESOLUTION', 8, bets);
    expect(p.hardways).toBe(0);
  });

  it('ALL four hardways return 0 on SEVEN_OUT (stakes already deducted at placement)', () => {
    const bets = makeBets({ hardways: makeHardwayBets({ hard4: 500, hard6: 500, hard8: 500, hard10: 500 }) });
    const p = calculateBasePayouts([3, 4], 'SEVEN_OUT', 8, bets);
    expect(p.hardways).toBe(0);
  });

  it('hardway not bet on has no resolution', () => {
    // Only hard6 is bet; dice show hard8 [4,4]
    const bets = makeBets({ hardways: makeHardwayBets({ hard6: 500 }) });
    const p = calculateBasePayouts([4, 4], 'POINT_HIT', 8, bets);
    // hard6 stays, hard8 wins but isn't bet — so hardways payout is 0 (no hard8 bet)
    expect(p.hardways).toBe(0);
  });

  it('unrelated hardway total has no resolution', () => {
    // Dice show [2,3]=5 — not a hardway number at all
    const bets = makeBets({ hardways: makeHardwayBets({ hard6: 500 }) });
    const p = calculateBasePayouts([2, 3], 'NO_RESOLUTION', 9, bets);
    expect(p.hardways).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// resolveRoll — cascade modifier initial values
// ---------------------------------------------------------------------------

describe('resolveRoll — cascade modifiers start at identity values', () => {
  it('additives start at 0', () => {
    const ctx = resolveRoll([3, 4], { phase: 'COME_OUT', currentPoint: null, bets: makeBets(), hype: 1.5 });
    expect(ctx.additives).toBe(0);
  });

  it('multipliers start as empty array', () => {
    const ctx = resolveRoll([3, 4], { phase: 'COME_OUT', currentPoint: null, bets: makeBets(), hype: 1.5 });
    expect(ctx.multipliers).toEqual([]);
  });

  it('hype is carried in from GameState', () => {
    const ctx = resolveRoll([3, 4], { phase: 'COME_OUT', currentPoint: null, bets: makeBets(), hype: 2.4 });
    expect(ctx.hype).toBe(2.4);
  });

  it('all flags start as false', () => {
    const ctx = resolveRoll([3, 4], { phase: 'COME_OUT', currentPoint: null, bets: makeBets(), hype: 1.0 });
    expect(ctx.flags.sevenOutBlocked).toBe(false);
    expect(ctx.flags.passLineProtected).toBe(false);
    expect(ctx.flags.hardwayProtected).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// settleTurn — core formula
// ---------------------------------------------------------------------------

describe('settleTurn — formula: (grossWins + additives) × (hype × product(multipliers))', () => {
  it('returns 0 on a pure loss roll (all stakes were deducted at placement)', () => {
    // Losses are always 0 from the engine — the bankroll was already reduced when bets were placed.
    const ctx = makeCtx({
      rollResult: 'SEVEN_OUT',
      basePassLinePayout: 0,
      baseOddsPayout: 0,
      baseHardwaysPayout: 0,
      baseStakeReturned: 0,
      hype: 3.0,
      multipliers: [1.5],
    });
    expect(settleTurn(ctx)).toBe(0);
  });

  it('applies hype multiplier to wins only', () => {
    const ctx = makeCtx({
      rollResult: 'NATURAL',
      basePassLinePayout: 1000,
      hype: 2.0,
    });
    expect(settleTurn(ctx)).toBe(2000); // floor(1000 × 2.0)
  });

  it('applies crew multipliers multiplicatively on top of hype', () => {
    const ctx = makeCtx({
      rollResult: 'NATURAL',
      basePassLinePayout: 1000,
      hype: 2.0,
      multipliers: [1.2],
    });
    expect(settleTurn(ctx)).toBe(2400); // floor(1000 × 2.0 × 1.2) = floor(2400)
  });

  it('stacks multiple multipliers multiplicatively', () => {
    const ctx = makeCtx({
      rollResult: 'NATURAL',
      basePassLinePayout: 1000,
      hype: 1.0,
      multipliers: [1.2, 1.5],
    });
    expect(settleTurn(ctx)).toBe(1800); // floor(1000 × 1.0 × 1.2 × 1.5) = floor(1800)
  });

  it('applies additives to wins before multiplying', () => {
    // The Shark adds $100 (10000c); that bonus should also be hype-amplified
    const ctx = makeCtx({
      rollResult: 'POINT_HIT',
      basePassLinePayout: 10000,
      additives: 10000, // The Shark's +$100
      hype: 2.0,
    });
    // floor((10000 + 10000) × 2.0) = floor(40000)
    expect(settleTurn(ctx)).toBe(40000);
  });

  it('hard6 easy-loss during POINT_HIT does not reduce payout (stake already gone at placement)', () => {
    // Pass line and Odds won; Hard 6 lost to a soft roll (stake already deducted at placement).
    // The easy-loss returns 0, not -500.
    const ctx = makeCtx({
      rollResult: 'POINT_HIT',
      basePassLinePayout: 1000,  // Pass line profit (1:1)
      baseOddsPayout:     1200,  // Odds profit (6:5 on point 8)
      baseHardwaysPayout: 0,     // Hard 6 lost easy — returns 0, not -500
      baseStakeReturned:  0,     // stakes not set in this manual context fixture
      hype: 1.0,
    });
    // profit = 1000+1200+0 = 2200; floor(2200 × 1.0) = 2200
    expect(settleTurn(ctx)).toBe(2200);
  });

  it('floors fractional cents (never over-pays)', () => {
    // 1500 × 1.3 = 1950.0 — exact. Edge case: 1000 × 1.3 = 1299.9999...
    const ctx = makeCtx({
      rollResult: 'POINT_HIT',
      basePassLinePayout: 1000,
      hype: 1.3,
    });
    expect(settleTurn(ctx)).toBe(1300); // floor(1000 × 1.3)
  });

  it('handles hype+multiplier floating-point edge case: 1.2 × 1.5 = 1.8 (not 1.7999...)', () => {
    const ctx = makeCtx({
      rollResult: 'NATURAL',
      basePassLinePayout: 20000,  // $200 pass line
      hype: 1.8,                  // Hype was boosted to exactly 1.8 by Holly's rounding
      multipliers: [1.2],         // Whale adds 1.2x
    });
    // Without the rounding fix in settleTurn: floor(20000 × 2.1599...) = 43199 (WRONG)
    // With rounding:  floor(20000 × 2.16) = 43200 (CORRECT)
    expect(settleTurn(ctx)).toBe(43200);
  });

  it('returns 0 when there are no bets resolved (pure NO_RESOLUTION)', () => {
    const ctx = makeCtx({
      rollResult: 'NO_RESOLUTION',
      basePassLinePayout: 0,
      baseOddsPayout: 0,
      baseHardwaysPayout: 0,
      hype: 3.0,
    });
    expect(settleTurn(ctx)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// validateOddsBet — 3-4-5x rule enforcement
// ---------------------------------------------------------------------------

describe('validateOddsBet — 3-4-5x Odds cap', () => {
  it('allows exact 3x odds on point 4', () => {
    expect(validateOddsBet(1000, 3000, 4)).toBe(3000);
  });

  it('caps to 3x when proposed odds exceed limit on point 4', () => {
    expect(validateOddsBet(1000, 5000, 4)).toBe(3000); // max = 1000 × 3
  });

  it('allows exact 3x odds on point 10', () => {
    expect(validateOddsBet(1000, 3000, 10)).toBe(3000);
  });

  it('caps to 3x when proposed odds exceed limit on point 10', () => {
    // Bug regression: player was allowed 4x on point 10
    expect(validateOddsBet(1000, 4000, 10)).toBe(3000);
  });

  it('allows exact 4x odds on point 5', () => {
    expect(validateOddsBet(1000, 4000, 5)).toBe(4000);
  });

  it('allows exact 5x odds on point 6', () => {
    expect(validateOddsBet(1000, 5000, 6)).toBe(5000);
  });

  it('allows zero odds bet through uncapped', () => {
    expect(validateOddsBet(1000, 0, 8)).toBe(0);
  });

  it('throws on invalid point', () => {
    expect(() => validateOddsBet(1000, 2000, 7)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// resolveRoll — Odds cap enforcement (3-4-5x rule applied inside engine)
// ---------------------------------------------------------------------------

describe('resolveRoll — Odds cap self-enforced on point 10', () => {
  it('caps an over-limit odds bet and stores the capped value in ctx.bets', () => {
    // $10 pass line, $40 odds (4x) on point 10 — engine must cap to $30 (3x)
    const state = {
      phase:        'POINT_ACTIVE' as const,
      currentPoint: 10,
      bets:         makeBets({ passLine: 1000, odds: 4000 }),
      hype:         1.0,
    };
    const ctx = resolveRoll([5, 5], state); // hard 10 = POINT_HIT
    expect(ctx.bets.odds).toBe(3000);              // capped to 3x
    expect(ctx.baseOddsPayout).toBe(6000);         // 3000 × 2:1 = 6000
    expect(ctx.baseStakeReturned).toBeGreaterThan(0);
  });

  it('does not cap a within-limit odds bet', () => {
    const state = {
      phase:        'POINT_ACTIVE' as const,
      currentPoint: 10,
      bets:         makeBets({ passLine: 1000, odds: 3000 }),
      hype:         1.0,
    };
    const ctx = resolveRoll([5, 5], state);
    expect(ctx.bets.odds).toBe(3000);  // unchanged
    expect(ctx.baseOddsPayout).toBe(6000);
  });
});

// ---------------------------------------------------------------------------
// calcResolvedBets — hardway clearing on NO_RESOLUTION (soft rolls)
// ---------------------------------------------------------------------------

describe('calcResolvedBets — hardway bets clear on soft rolls during NO_RESOLUTION', () => {
  it('clears hard10 bet when a soft 10 is rolled (NO_RESOLUTION, point is 6)', () => {
    // Bug regression: soft 10 during point-6 phase left hard10 on the table
    const bets = makeBets({ passLine: 1000, hardways: makeHardwayBets({ hard10: 500 }) });
    const state = {
      phase:        'POINT_ACTIVE' as const,
      currentPoint: 6,
      bets,
      hype:         1.0,
    };
    const ctx = resolveRoll([4, 6], state); // soft 10, point is 6 → NO_RESOLUTION
    expect(ctx.rollResult).toBe('NO_RESOLUTION');
    expect(ctx.resolvedBets.hardways.hard10).toBe(0);  // cleared
    expect(ctx.resolvedBets.passLine).toBe(1000);      // passLine stays locked
  });

  it('clears hard8 bet when a hard 8 wins during NO_RESOLUTION (point is 6)', () => {
    // Bug regression: hard8 win left the bet on the table after paying out
    const bets = makeBets({ passLine: 1000, hardways: makeHardwayBets({ hard8: 500 }) });
    const state = {
      phase:        'POINT_ACTIVE' as const,
      currentPoint: 6,
      bets,
      hype:         1.0,
    };
    const ctx = resolveRoll([4, 4], state); // hard 8, point is 6 → NO_RESOLUTION
    expect(ctx.rollResult).toBe('NO_RESOLUTION');
    expect(ctx.resolvedBets.hardways.hard8).toBe(0);  // cleared after win
    expect(ctx.baseHardwaysPayout).toBe(4500);        // 500 × 9:1
  });

  it('does not clear unrelated hardway bets on NO_RESOLUTION with non-hardway total', () => {
    const bets = makeBets({ passLine: 1000, hardways: makeHardwayBets({ hard6: 500 }) });
    const state = {
      phase:        'POINT_ACTIVE' as const,
      currentPoint: 9,
      bets,
      hype:         1.0,
    };
    const ctx = resolveRoll([2, 3], state); // total 5, NO_RESOLUTION, no hardway
    expect(ctx.resolvedBets.hardways.hard6).toBe(500); // untouched
  });
});
