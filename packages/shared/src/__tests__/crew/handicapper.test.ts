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

  it('does not fire on POINT_SET when activePoint is null (defensive)', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: null });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });
});

// ---------------------------------------------------------------------------
// Hype bonuses by point difficulty
// ---------------------------------------------------------------------------

describe('Handicapper — hype bonuses on POINT_SET', () => {
  it('adds +0.3 hype for point 4', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 4, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.3, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('adds +0.3 hype for point 10', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 10, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.3, 4);
  });

  it('adds +0.2 hype for point 5', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 5, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.2, 4);
  });

  it('adds +0.2 hype for point 9', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 9, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.2, 4);
  });

  it('adds +0.1 hype for point 6', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 6, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.1, 4);
  });

  it('adds +0.1 hype for point 8', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 8, hype: 1.0 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.1, 4);
  });

  it('stacks onto existing hype above 1.0', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 4, hype: 2.5 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(2.8, 4);
  });

  it('does not mutate other context fields', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 6, hype: 1.0, additives: 500 });
    const result = fresh.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(500);
    expect(result.context.rollResult).toBe('POINT_SET');
    expect(result.context.activePoint).toBe(6);
  });
});
