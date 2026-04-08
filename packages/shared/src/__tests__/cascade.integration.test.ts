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

// Holly now triggers on POINT_HIT (+0.3 additive), not NATURAL.
// On a NATURAL: only Intern (+0.2) and Whale (×1.2) fire. Holly is silent.
describe('cascade: Nervous Intern + Holly + Whale on a NATURAL (Holly does NOT fire)', () => {
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

  it('Intern fires (+0.2), Holly silent on NATURAL: hype = 1.0 → 1.2', () => {
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.hype).toBe(1.2);
  });

  it('emits 2 events (Intern + Whale fire; Holly silent on NATURAL)', () => {
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(events).toHaveLength(2);
  });

  it('settleTurn: floor(20000 × 1.2 × 1.2) = 28800', () => {
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(settleTurn(finalContext)).toBe(28_800);
  });
});

// On a POINT_HIT: Holly fires (+0.3 additive). Intern is silent (POINT_HIT ≠ NATURAL).
describe('cascade: Holly + Whale on a POINT_HIT (Holly fires +0.3)', () => {
  const ctx = makeCtx({
    rollResult:         'POINT_HIT',
    dice:               [4, 4],
    diceTotal:          8,
    activePoint:        8,
    bets:               makeBets({ passLine: 20_000 }),
    basePassLinePayout: 20_000,
    hype:               1.0,
  });
  const crew: (CrewMember | null)[] = [fresh(nervousIntern), fresh(hypeTrainHolly), fresh(whale), null, null];

  it('Holly fires (+0.3), Intern silent on POINT_HIT: hype = 1.0 → 1.3', () => {
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.hype).toBe(1.3);
  });

  it('emits 2 events (Holly + Whale fire; Intern silent on POINT_HIT)', () => {
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(events).toHaveLength(2);
  });

  it('settleTurn: floor(20000 × 1.3 × 1.2) = 31200', () => {
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    // 1.3 × 1.2 = 1.56; floor(20000 × 1.56) = 31200
    expect(settleTurn(finalContext)).toBe(31_200);
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
// The Lucky Charm: additive hype floor (+1.0) when solo, hype < 2.0×
// ---------------------------------------------------------------------------

describe('cascade: The Lucky Charm', () => {
  it('raises hype to 2.0× when solo and hype is at baseline (1.0×)', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 1.0 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    expect(finalContext.hype).toBe(2.0); // 1.0 + 1.0 = 2.0
  });

  it('preserves accumulated bonuses: hype between 1.0× and 2.0× gets +1.0 not clamped to 2.0×', () => {
    // Player carried 0.3× of bonus into this roll — Lucky Charm should add +1.0,
    // giving 2.3× rather than discarding the bonus and clamping to 2.0×.
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 1.3 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    expect(finalContext.hype).toBeCloseTo(2.3, 5);
  });

  it('does NOT change hype when it is exactly 2.0×', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 2.0 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { finalContext, events } = resolveCascade(crew, ctx, neverCalledRng);

    expect(finalContext.hype).toBe(2.0);
    expect(events).toHaveLength(0); // no-op, hype already at floor
  });

  it('does NOT reduce hype if it is already above 2.0×', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 3.5 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    expect(finalContext.hype).toBe(3.5); // above floor — no-op
  });

  it('emits a cascadeEvent when hype is raised from below 2.0×', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 1.0 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { events } = resolveCascade(crew, ctx, neverCalledRng);

    expect(events).toHaveLength(1);
    expect(events[0]?.crewId).toBe(15);
    expect(events[0]?.contextDelta.hype).toBe(2.0);
  });

  it('emits a cascadeEvent with the full additive hype when carrying a bonus', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 1.3 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { events } = resolveCascade(crew, ctx, neverCalledRng);

    expect(events).toHaveLength(1);
    expect(events[0]?.contextDelta.hype).toBeCloseTo(2.3, 5);
  });

  it('does NOT emit a cascadeEvent when hype is already at or above 2.0×', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 2.5 });
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), null, null, null, null];
    const { events } = resolveCascade(crew, ctx, neverCalledRng);

    expect(events).toHaveLength(0); // no-op, hype already above floor
  });

  it('does NOT activate when other crew are present', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', basePassLinePayout: 10_000, hype: 1.0 });
    // Lucky Charm + Whale in slots — Lucky Charm is NOT solo
    const crew: (CrewMember | null)[] = [fresh(luckyCharm), fresh(whale), null, null, null];
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    // Hype should still be 1.0 (Lucky Charm didn't fire; only Whale's 1.2× applied)
    expect(finalContext.hype).toBe(1.0);
    expect(finalContext.multipliers).toEqual([1.2]); // Only Whale fired
  });
});
