// =============================================================================
// CREW: THE HANDICAPPER — Unit Tests  (KI-041 verification)
// src/__tests__/crew/handicapper.test.ts
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { handicapper } from '../../crew/handicapper.js';
import { makeCtx, neverCalledRng } from '../helpers.js';
import type { CrewMember } from '../../types.js';

let fresh: CrewMember;
beforeEach(() => {
  fresh = { ...handicapper, cooldownState: 0 };
});

// ---------------------------------------------------------------------------
// Guard conditions — should NOT fire
// ---------------------------------------------------------------------------

describe('Handicapper — activation guard', () => {
  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', activePoint: null });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
    expect(result.newCooldown).toBe(0);
  });

  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', activePoint: null });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on NO_RESOLUTION', () => {
    const ctx = makeCtx({ rollResult: 'NO_RESOLUTION', activePoint: 6 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on POINT_HIT', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', activePoint: 8 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on CRAPS_OUT', () => {
    const ctx = makeCtx({ rollResult: 'CRAPS_OUT', activePoint: null });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  // Regression: on POINT_SET the run is still in COME_OUT, so the real engine
  // leaves activePoint null. The Handicapper must read the point from the dice.
  it('fires on POINT_SET with activePoint null, as in real play', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [1, 3], diceTotal: 4, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.45, 4);
  });
});

// ---------------------------------------------------------------------------
// Hype bonuses by point difficulty
// ---------------------------------------------------------------------------

describe('Handicapper — hype bonuses on POINT_SET', () => {
  it('adds +0.45 hype for point 4', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [1, 3], diceTotal: 4, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.45, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('adds +0.45 hype for point 10', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [4, 6], diceTotal: 10, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.45, 4);
  });

  it('adds +0.3 hype for point 5', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [2, 3], diceTotal: 5, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.3, 4);
  });

  it('adds +0.3 hype for point 9', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [4, 5], diceTotal: 9, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.3, 4);
  });

  it('adds +0.15 hype for point 6', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [2, 4], diceTotal: 6, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.15, 4);
  });

  it('adds +0.15 hype for point 8', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [3, 5], diceTotal: 8, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.15, 4);
  });

  it('stacks onto existing hype above 1.0', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [1, 3], diceTotal: 4, hype: 2.5 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(2.95, 4);
  });

  it('does not mutate other context fields', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null, dice: [2, 4], diceTotal: 6, hype: 1.0, additives: 500 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(500);
    expect(result.context.rollResult).toBe('POINT_SET');
    expect(result.context.activePoint).toBeNull();
    expect(result.context.dice).toEqual([2, 4]);
  });
});
