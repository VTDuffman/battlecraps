// =============================================================================
// CASCADE — Integration Tests
// src/__tests__/cascade.integration.test.ts
//
// Tests the full resolveCascade() → settleTurn() pipeline with real crew
// instances. Verifies event ordering, delta correctness, cooldown management,
// and the Mimic / Lucky Charm wildcard special cases.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { resolveCascade } from '../cascade.js';
import { settleTurn } from '../crapsEngine.js';
import { nervousIntern } from '../crew/nervousIntern.js';
import { whale } from '../crew/whale.js';
import { hypeTrainHolly } from '../crew/hypeTrainHolly.js';
import { lefty } from '../crew/lefty.js';
import { mechanic } from '../crew/mechanic.js';
import { mimic } from '../crew/mimic.js';
import { luckyCharm } from '../crew/luckyCharm.js';
import { makeCtx, makeBets, fixedDice, neverCalledRng } from './helpers.js';
import type { CrewMember } from '../types.js';

// ---------------------------------------------------------------------------
// Helper: produce a fresh crew instance per test (avoid shared state)
// ---------------------------------------------------------------------------
function fresh<T extends CrewMember>(c: T): T {
  return { ...c, cooldownState: 0 };
}

// ---------------------------------------------------------------------------
// Basic cascade: Nervous Intern → Whale on a Yo-leven NATURAL
// ---------------------------------------------------------------------------

describe('cascade: Nervous Intern + Whale on a Yo-leven', () => {
  const bets  = makeBets({ passLine: 20_000 }); // $200 pass line
  const ctx   = makeCtx({
    rollResult:         'NATURAL',
    activePoint:        null,
    dice:               [5, 6],
    diceTotal:          11,
    isHardway:          false,
    bets,
    basePassLinePayout: 20_000,
    hype:               1.0,
  });
  const crew: (CrewMember | null)[] = [fresh(nervousIntern), null, fresh(whale), null, null];

  it('Nervous Intern fires first and boosts hype to 1.2', () => {
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    // Intern fires (+0.2), then Whale fires (1.2× multiplier added)
    expect(finalContext.hype).toBe(1.2);
  });

  it('Whale fires second and adds 1.2× to multipliers', () => {
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.multipliers).toEqual([1.2]);
  });

  it('emits exactly 2 events, in slot order', () => {
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(events).toHaveLength(2);
    expect(events[0]?.slotIndex).toBe(0); // Nervous Intern at slot 0
    expect(events[1]?.slotIndex).toBe(2); // Whale at slot 2 (slot 1 is null)
  });

  it('event 0 delta contains updated hype', () => {
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(events[0]?.contextDelta.hype).toBe(1.2);
  });

  it('event 1 delta contains updated multipliers array', () => {
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(events[1]?.contextDelta.multipliers).toEqual([1.2]);
  });

  it('settleTurn produces correct integer payout: floor(20000 × 1.2 × 1.2) = 28800', () => {
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(settleTurn(finalContext)).toBe(28_800);
  });
});

// ---------------------------------------------------------------------------
// Hype stacking: Nervous Intern + Holly on a Yo-leven
// ---------------------------------------------------------------------------

describe('cascade: Nervous Intern + Holly — hype stacking on Yo-leven', () => {
  const ctx = makeCtx({
    rollResult:         'NATURAL',
    dice:               [5, 6],
    diceTotal:          11,
    activePoint:        null,
    bets:               makeBets({ passLine: 20_000 }),
    basePassLinePayout: 20_000,
    hype:               1.0,
  });
  const crew: (CrewMember | null)[] = [fresh(nervousIntern), fresh(hypeTrainHolly), fresh(whale), null, null];

  it('Nervous Intern fires (+0.2) → Holly fires (×1.5): hype = 1.0 → 1.2 → 1.8', () => {
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    // 1.0 + 0.2 = 1.2; 1.2 × 1.5 = 1.8 (rounded to 4dp in Holly)
    expect(finalContext.hype).toBe(1.8);
  });

  it('emits 3 events (all three crew fire)', () => {
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(events).toHaveLength(3);
  });

  it('settleTurn: floor(20000 × 1.8 × 1.2) = 43200 (verifies float fix)', () => {
    // Critical test: without the rounding fix in settleTurn,
    // 1.8 × 1.2 = 2.1599... and floor(20000 × 2.1599) = 43199 (wrong).
    // With the fix: 43200 (correct).
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(settleTurn(finalContext)).toBe(43_200);
  });
});

// ---------------------------------------------------------------------------
// Cooldown management: The Mechanic (per_roll)
// ---------------------------------------------------------------------------

describe('cascade: per_roll cooldown — The Mechanic', () => {
  it('fires on roll 1 and goes on a 4-roll cooldown', () => {
    const ctx  = makeCtx({ rollResult: 'NO_RESOLUTION', dice: [2, 3], diceTotal: 5, activePoint: 9 });
    const crew: (CrewMember | null)[] = [fresh(mechanic), null, null, null, null];

    const { updatedCrewSlots } = resolveCascade(crew, ctx, neverCalledRng);
    expect(updatedCrewSlots[0]?.cooldownState).toBe(4);
  });

  it('decrements per_roll cooldown each roll until 0', () => {
    const ctx  = makeCtx({ rollResult: 'NO_RESOLUTION', dice: [2, 3], diceTotal: 5, activePoint: 9 });
    const mechanicOnCooldown = { ...fresh(mechanic), cooldownState: 3 };
    const crew: (CrewMember | null)[] = [mechanicOnCooldown, null, null, null, null];

    const { updatedCrewSlots, events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(updatedCrewSlots[0]?.cooldownState).toBe(2); // decremented from 3 to 2
    expect(events).toHaveLength(0); // no ability fired
  });

  it('re-fires after cooldown reaches 0', () => {
    const ctx  = makeCtx({ rollResult: 'NO_RESOLUTION', dice: [2, 3], diceTotal: 5, activePoint: 9 });
    const mechanicReady = { ...fresh(mechanic), cooldownState: 0 };
    const crew: (CrewMember | null)[] = [mechanicReady, null, null, null, null];

    const { updatedCrewSlots, events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(updatedCrewSlots[0]?.cooldownState).toBe(4); // fired again, new 4-roll cooldown
    expect(events).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Cooldown management: Lefty (per_shooter)
// ---------------------------------------------------------------------------

describe('cascade: per_shooter cooldown — Lefty', () => {
  it('fires and goes on per_shooter cooldown (1)', () => {
    const ctx  = makeCtx({ rollResult: 'SEVEN_OUT', activePoint: 8 });
    const crew: (CrewMember | null)[] = [fresh(lefty), null, null, null, null];

    const { updatedCrewSlots } = resolveCascade(crew, ctx, fixedDice(4, 4));
    expect(updatedCrewSlots[0]?.cooldownState).toBe(1);
  });

  it('does NOT decrement per_shooter cooldown between rolls (server resets it)', () => {
    const ctx         = makeCtx({ rollResult: 'NO_RESOLUTION', activePoint: 8 });
    const leftySpent  = { ...fresh(lefty), cooldownState: 1 };
    const crew: (CrewMember | null)[] = [leftySpent, null, null, null, null];

    const { updatedCrewSlots } = resolveCascade(crew, ctx, neverCalledRng);
    // Still 1 — per_shooter is NOT decremented by the cascade
    expect(updatedCrewSlots[0]?.cooldownState).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The Mimic: copies the previous crew's ability
// ---------------------------------------------------------------------------

describe('cascade: The Mimic', () => {
  it('doubles The Whale (Mimic at slot 1 copies Whale at slot 0)', () => {
    const ctx = makeCtx({
      rollResult:         'POINT_HIT',
      basePassLinePayout: 10_000,
      hype:               1.0,
    });
    // Whale at slot 0 adds 1.2×; Mimic at slot 1 also adds 1.2× (copies Whale).
    const crew: (CrewMember | null)[] = [fresh(whale), fresh(mimic), null, null, null];
    const { finalContext, events } = resolveCascade(crew, ctx, neverCalledRng);

    expect(finalContext.multipliers).toEqual([1.2, 1.2]);
    // settleTurn: floor(10000 × 1.0 × 1.2 × 1.2) = floor(14400) = 14400
    expect(settleTurn(finalContext)).toBe(14_400);
    // Both slots emit an event
    expect(events).toHaveLength(2);
    expect(events[0]?.slotIndex).toBe(0);
    expect(events[1]?.slotIndex).toBe(1);
  });

  it('does nothing when in slot 0 (no prior crew to copy)', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', basePassLinePayout: 10_000 });
    const crew: (CrewMember | null)[] = [fresh(mimic), null, null, null, null];
    const { finalContext, events } = resolveCascade(crew, ctx, neverCalledRng);

    expect(finalContext.multipliers).toEqual([]); // no-op
    expect(events).toHaveLength(0);               // no change → no event
  });
});

// ---------------------------------------------------------------------------
// The Lucky Charm: locks Hype at 2.0× when solo
// ---------------------------------------------------------------------------

describe('cascade: The Lucky Charm', () => {
  it('locks hype at 2.0× when solo crew, below floor', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 1.0 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    expect(finalContext.hype).toBe(2.0);
  });

  it('does NOT reduce hype if it is already above 2.0×', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 3.5 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    expect(finalContext.hype).toBe(3.5); // max(3.5, 2.0) = 3.5
  });

  it('does NOT activate when other crew are present', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 1.0 });
    // Lucky Charm + Whale in slots — Lucky Charm is NOT solo
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), fresh(whale), null, null, null];
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    // Hype should still be 1.0 (Lucky Charm didn't lock it; only Whale's 1.2× applied)
    expect(finalContext.hype).toBe(1.0);
    expect(finalContext.multipliers).toEqual([1.2]); // Only Whale fired
  });
});
