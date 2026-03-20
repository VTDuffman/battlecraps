// =============================================================================
// CREW: "LEFTY" McGUFFIN — Unit Tests
// src/__tests__/crew/lefty.test.ts
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { lefty } from '../../crew/lefty.js';
import { makeCtx, makeBets, makeHardwayBets, fixedDice, neverCalledRng } from '../helpers.js';
import type { CrewMember } from '../../types.js';

// ---------------------------------------------------------------------------
// Helper: create a fresh Lefty instance (cooldownState=0) for each test
// ---------------------------------------------------------------------------
let freshLefty: CrewMember;
beforeEach(() => {
  freshLefty = { ...lefty, cooldownState: 0 };
});

// ---------------------------------------------------------------------------
// Activation conditions
// ---------------------------------------------------------------------------

describe('Lefty — activation guard', () => {
  it('does NOT fire on NATURAL (only seven-outs)', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', activePoint: null });
    const result = freshLefty.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx); // same reference = no change
    expect(result.newCooldown).toBe(0);
  });

  it('does NOT fire on NO_RESOLUTION', () => {
    const ctx = makeCtx({ rollResult: 'NO_RESOLUTION', activePoint: 8 });
    const result = freshLefty.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does NOT fire on POINT_HIT', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', activePoint: 8 });
    const result = freshLefty.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does NOT fire on POINT_SET', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null });
    const result = freshLefty.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does NOT fire on CRAPS_OUT', () => {
    const ctx = makeCtx({ rollResult: 'CRAPS_OUT', activePoint: null });
    const result = freshLefty.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does NOT fire when cooldownState > 0 (already used this shooter)', () => {
    const spentLefty = { ...lefty, cooldownState: 1 };
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', activePoint: 8 });
    const result = spentLefty.execute(ctx, fixedDice(4, 4));
    expect(result.context).toBe(ctx); // no change
    expect(result.newCooldown).toBe(1); // cooldown returned unchanged
  });
});

// ---------------------------------------------------------------------------
// Successful re-roll: Seven Out → Point Hit
// ---------------------------------------------------------------------------

describe('Lefty — fires on SEVEN_OUT and changes outcome', () => {
  it('substitutes new dice and re-evaluates to POINT_HIT', () => {
    // Original seven-out on point 8. Lefty re-rolls [4,4] = Hard 8 = POINT_HIT.
    const bets = makeBets({ passLine: 1000, odds: 1000 });
    const ctx = makeCtx({
      rollResult:          'SEVEN_OUT',
      activePoint:         8,
      bets,
      basePassLinePayout:  -1000,
      baseOddsPayout:      -1000,
      baseHardwaysPayout:  0,
    });

    const result = freshLefty.execute(ctx, fixedDice(4, 4));

    expect(result.context.dice).toEqual([4, 4]);
    expect(result.context.diceTotal).toBe(8);
    expect(result.context.isHardway).toBe(true);
    expect(result.context.rollResult).toBe('POINT_HIT');

    // Payouts should now be wins, not losses
    expect(result.context.basePassLinePayout).toBe(1000);
    expect(result.context.baseOddsPayout).toBe(1200); // 6:5 on point 8, $10 odds
  });

  it('sets sevenOutBlocked flag to true', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', activePoint: 8 });
    const result = freshLefty.execute(ctx, fixedDice(4, 4));
    expect(result.context.flags.sevenOutBlocked).toBe(true);
  });

  it('consumes cooldown (returns newCooldown=1)', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', activePoint: 8 });
    const result = freshLefty.execute(ctx, fixedDice(4, 4));
    expect(result.newCooldown).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Failed re-roll: Lefty fires but new dice are ALSO a 7
// ---------------------------------------------------------------------------

describe('Lefty — fires but re-roll is still a seven', () => {
  it('sets sevenOutBlocked=true even when re-roll is also SEVEN_OUT', () => {
    // New dice [3,4] = total 7 = still SEVEN_OUT
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', activePoint: 6 });
    const result = freshLefty.execute(ctx, fixedDice(3, 4));

    expect(result.context.flags.sevenOutBlocked).toBe(true);
    expect(result.context.rollResult).toBe('SEVEN_OUT'); // still a seven-out
    expect(result.newCooldown).toBe(1); // cooldown still consumed (Lefty tried)
  });

  it('re-calculates payouts for the new (still seven-out) dice', () => {
    const bets = makeBets({ passLine: 1000 });
    const ctx = makeCtx({
      rollResult:         'SEVEN_OUT',
      activePoint:        6,
      bets,
      basePassLinePayout: 0,  // losses are 0 in the deduct-on-placement model
    });
    const result = freshLefty.execute(ctx, fixedDice(3, 4));
    // Still a seven-out — pass line stake already gone at placement, payout is 0
    expect(result.context.basePassLinePayout).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Immutability: cascade modifiers accumulated before Lefty are preserved
// ---------------------------------------------------------------------------

describe('Lefty — immutability and cascade preservation', () => {
  it('preserves additives accumulated by earlier crew in the cascade', () => {
    // Imagine Big Spender (slot 0) already fired and added 5000 to additives.
    // Lefty is at slot 1. His re-roll must not wipe Big Spender's work.
    const ctx = makeCtx({
      rollResult:  'SEVEN_OUT',
      activePoint: 8,
      additives:   5000, // BigSpender already fired
      multipliers: [1.5], // SomeOtherCrew already fired
      hype:        2.0,   // Built up from previous rolls
    });
    const result = freshLefty.execute(ctx, fixedDice(4, 4));
    expect(result.context.additives).toBe(5000);
    expect(result.context.multipliers).toEqual([1.5]);
    expect(result.context.hype).toBe(2.0);
  });

  it('preserves existing flags set by earlier crew', () => {
    const ctx = makeCtx({
      rollResult: 'SEVEN_OUT',
      activePoint: 8,
      flags: {
        sevenOutBlocked:   false,
        passLineProtected: true,  // Floor Walker already fired
        hardwayProtected:  false,
      },
    });
    const result = freshLefty.execute(ctx, fixedDice(4, 4));
    expect(result.context.flags.passLineProtected).toBe(true); // preserved
    expect(result.context.flags.sevenOutBlocked).toBe(true);   // Lefty adds this
  });

  it('does not mutate the input context', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', activePoint: 8 });
    const originalDice = ctx.dice;
    const originalResult = ctx.rollResult;

    freshLefty.execute(ctx, fixedDice(4, 4));

    // Input ctx should be unchanged
    expect(ctx.dice).toBe(originalDice);
    expect(ctx.rollResult).toBe(originalResult);
  });
});

// ---------------------------------------------------------------------------
// Hardway recalculation on re-roll
// ---------------------------------------------------------------------------

describe('Lefty — recalculates hardway payouts after re-roll', () => {
  it('recalculates a Hard 8 win on re-roll when hard8 is bet', () => {
    const bets = makeBets({ hardways: makeHardwayBets({ hard8: 1000 }) });
    const ctx = makeCtx({
      rollResult:         'SEVEN_OUT',
      activePoint:        8,
      bets,
      baseHardwaysPayout: -1000, // Hard 8 lost on original seven-out
    });

    // Re-roll gives [4,4] = Hard 8, POINT_HIT — hard8 now wins at 9:1
    const result = freshLefty.execute(ctx, fixedDice(4, 4));
    expect(result.context.baseHardwaysPayout).toBe(9000); // $10 × 9 = $90
  });
});
