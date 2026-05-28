import { describe, it, expect, vi } from 'vitest';
import { resolveCascade } from '../cascade.js';
import type { CrewMember, TurnContext } from '../types.js';
import type { BossRuleHooks, BossRuleState } from '../bossRules/index.js';
import type { BossRuleParams } from '../config.js';
import { makeCtx, makeBets, neverCalledRng, fixedDice } from './helpers.js';

// ---------------------------------------------------------------------------
// Minimal stub crew factory — lets us assert execute() was/wasn't called
// ---------------------------------------------------------------------------

function makeCrew(
  id: number,
  overrides: Partial<CrewMember> = {},
): CrewMember {
  return {
    id,
    name:             `Crew_${id}`,
    abilityCategory:  'HYPE',
    cooldownType:     'none',
    cooldownState:    0,
    visualId:         `crew_${id}`,
    rarity:           'Starter',
    execute: (ctx: TurnContext) => ({ context: ctx, newCooldown: 0 }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Core immutability — inputs must not be mutated
// ---------------------------------------------------------------------------

describe('resolveCascade — immutability', () => {
  it('does not mutate the original crewSlots array', () => {
    const slots: (CrewMember | null)[] = [makeCrew(1), null, makeCrew(2)];
    const frozen = Object.freeze([...slots]);
    const ctx = makeCtx({ rollResult: 'NATURAL' });

    resolveCascade(slots, ctx, neverCalledRng);

    expect(slots[0]!.cooldownState).toBe(0);
    expect(slots[2]!.cooldownState).toBe(0);
    void frozen; // just confirms freeze didn't throw
  });

  it('does not mutate initialCtx', () => {
    const ctx = makeCtx({ hype: 1.5, multipliers: [1.2] });
    const originalHype = ctx.hype;
    const originalMultLen = ctx.multipliers.length;

    const crew = makeCrew(1, {
      execute: (c: TurnContext) => ({
        context: { ...c, hype: c.hype + 0.1 },
        newCooldown: 0,
      }),
    });

    resolveCascade([crew], ctx, neverCalledRng);

    expect(ctx.hype).toBe(originalHype);
    expect(ctx.multipliers).toHaveLength(originalMultLen);
  });

  it('updatedCrewSlots is a new array, not a reference to crewSlots', () => {
    const slots: (CrewMember | null)[] = [makeCrew(1), null];
    const ctx = makeCtx();
    const { updatedCrewSlots } = resolveCascade(slots, ctx, neverCalledRng);
    expect(updatedCrewSlots).not.toBe(slots);
  });
});

// ---------------------------------------------------------------------------
// Slot ordering — crew fire in slot-index order (0→4)
// ---------------------------------------------------------------------------

describe('resolveCascade — slot ordering', () => {
  it('fires crew in slot order left to right', () => {
    const order: number[] = [];
    const makeOrderedCrew = (id: number) =>
      makeCrew(id, {
        execute: (ctx: TurnContext) => {
          order.push(id);
          return { context: ctx, newCooldown: 0 };
        },
      });

    const slots = [makeOrderedCrew(1), makeOrderedCrew(2), makeOrderedCrew(3)];
    resolveCascade(slots, makeCtx(), neverCalledRng);

    expect(order).toEqual([1, 2, 3]);
  });

  it('each crew sees the context modified by all preceding crew', () => {
    const seen: number[] = [];

    const slot0 = makeCrew(1, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, hype: ctx.hype + 0.5 },
        newCooldown: 0,
      }),
    });
    const slot1 = makeCrew(2, {
      execute: (ctx: TurnContext) => {
        seen.push(ctx.hype * 100); // capture as integer
        return { context: ctx, newCooldown: 0 };
      },
    });

    resolveCascade([slot0, slot1], makeCtx({ hype: 1.0 }), neverCalledRng);
    // slot1 should see hype = 1.5 (boosted by slot0)
    expect(seen[0]).toBe(150);
  });

  it('skips null slots', () => {
    const executed: number[] = [];
    const crew = makeCrew(1, {
      execute: (ctx: TurnContext) => {
        executed.push(1);
        return { context: ctx, newCooldown: 0 };
      },
    });

    resolveCascade([null, crew, null], makeCtx(), neverCalledRng);
    expect(executed).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// finalContext — reflects all crew modifications
// ---------------------------------------------------------------------------

describe('resolveCascade — finalContext', () => {
  it('returns unmodified context when all slots are null', () => {
    const ctx = makeCtx({ hype: 1.5 });
    const { finalContext } = resolveCascade([null, null, null], ctx, neverCalledRng);
    expect(finalContext.hype).toBe(1.5);
  });

  it('returns unmodified context when crew slots array is empty', () => {
    const ctx = makeCtx({ hype: 2.0 });
    const { finalContext } = resolveCascade([], ctx, neverCalledRng);
    expect(finalContext).toEqual(ctx);
  });

  it('accumulates hype from two boosting crew', () => {
    const booster = makeCrew(1, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, hype: ctx.hype + 0.2 },
        newCooldown: 0,
      }),
    });

    const { finalContext } = resolveCascade([booster, booster], makeCtx({ hype: 1.0 }), neverCalledRng);
    expect(finalContext.hype).toBeCloseTo(1.4, 4);
  });

  it('accumulates multipliers from two stacking crew', () => {
    const pusher = makeCrew(1, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, multipliers: [...ctx.multipliers, 1.2] },
        newCooldown: 0,
      }),
    });

    const { finalContext } = resolveCascade([pusher, pusher], makeCtx(), neverCalledRng);
    expect(finalContext.multipliers).toEqual([1.2, 1.2]);
  });
});

// ---------------------------------------------------------------------------
// Events — only emit when context changes
// ---------------------------------------------------------------------------

describe('resolveCascade — events', () => {
  it('emits no events when no crew changes context', () => {
    const noop = makeCrew(1);
    const { events } = resolveCascade([noop], makeCtx(), neverCalledRng);
    expect(events).toHaveLength(0);
  });

  it('emits one event per slot that changes the context', () => {
    const booster = makeCrew(1, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, hype: ctx.hype + 0.2 },
        newCooldown: 0,
      }),
    });
    const noop = makeCrew(2);

    const { events } = resolveCascade([booster, noop], makeCtx(), neverCalledRng);
    expect(events).toHaveLength(1);
    expect(events[0]!.slotIndex).toBe(0);
    expect(events[0]!.crewId).toBe(1);
  });

  it('event contextDelta contains only changed fields', () => {
    const booster = makeCrew(5, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, hype: ctx.hype + 0.3 },
        newCooldown: 0,
      }),
    });

    const { events } = resolveCascade([booster], makeCtx({ hype: 1.0 }), neverCalledRng);
    expect(events[0]!.contextDelta).toHaveProperty('hype');
    expect(events[0]!.contextDelta).not.toHaveProperty('multipliers');
    expect(events[0]!.contextDelta).not.toHaveProperty('dice');
  });

  it('events are in ascending slot-index order', () => {
    const booster = makeCrew(1, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, hype: ctx.hype + 0.1 },
        newCooldown: 0,
      }),
    });

    const { events } = resolveCascade(
      [booster, null, booster, null, booster],
      makeCtx({ hype: 1.0 }),
      neverCalledRng,
    );
    expect(events.map((e) => e.slotIndex)).toEqual([0, 2, 4]);
  });
});

// ---------------------------------------------------------------------------
// Cooldown management
// ---------------------------------------------------------------------------

describe('resolveCascade — cooldown: per_roll', () => {
  it('per_roll: crew on cooldown is skipped, cooldown decremented', () => {
    const executed = vi.fn();
    const crew = makeCrew(1, {
      cooldownType:  'per_roll',
      cooldownState: 2,
      execute: (ctx: TurnContext) => { executed(); return { context: ctx, newCooldown: 0 }; },
    });

    const { updatedCrewSlots } = resolveCascade([crew], makeCtx(), neverCalledRng);
    expect(executed).not.toHaveBeenCalled();
    expect(updatedCrewSlots[0]!.cooldownState).toBe(1);
  });

  it('per_roll: cooldown decrements to 0 on last tick', () => {
    const crew = makeCrew(1, { cooldownType: 'per_roll', cooldownState: 1 });
    const { updatedCrewSlots } = resolveCascade([crew], makeCtx(), neverCalledRng);
    expect(updatedCrewSlots[0]!.cooldownState).toBe(0);
  });

  it('per_roll: crew with cooldown 0 fires normally and records newCooldown', () => {
    const executed = vi.fn();
    const crew = makeCrew(1, {
      cooldownType:  'per_roll',
      cooldownState: 0,
      execute: (ctx: TurnContext) => { executed(); return { context: ctx, newCooldown: 1 }; },
    });

    const { updatedCrewSlots } = resolveCascade([crew], makeCtx(), neverCalledRng);
    expect(executed).toHaveBeenCalledOnce();
    expect(updatedCrewSlots[0]!.cooldownState).toBe(1);
  });
});

describe('resolveCascade — cooldown: per_shooter', () => {
  it('per_shooter: crew on cooldown is skipped, cooldown is NOT decremented', () => {
    const executed = vi.fn();
    const crew = makeCrew(1, {
      cooldownType:  'per_shooter',
      cooldownState: 1,
      execute: (ctx: TurnContext) => { executed(); return { context: ctx, newCooldown: 0 }; },
    });

    const { updatedCrewSlots } = resolveCascade([crew], makeCtx(), neverCalledRng);
    expect(executed).not.toHaveBeenCalled();
    // per_shooter: cascade never decrements — stays at 1 until server resets it
    expect(updatedCrewSlots[0]!.cooldownState).toBe(1);
  });

  it('per_shooter: crew with cooldown 0 fires and sets newCooldown', () => {
    const crew = makeCrew(1, {
      cooldownType:  'per_shooter',
      cooldownState: 0,
      execute: (ctx: TurnContext) => ({ context: { ...ctx, hype: ctx.hype + 0.5 }, newCooldown: 1 }),
    });

    const { updatedCrewSlots, finalContext } = resolveCascade([crew], makeCtx({ hype: 1.0 }), neverCalledRng);
    expect(updatedCrewSlots[0]!.cooldownState).toBe(1);
    expect(finalContext.hype).toBeCloseTo(1.5, 4);
  });
});

// ---------------------------------------------------------------------------
// Boss hooks — modifyCascadeOrder
// ---------------------------------------------------------------------------

describe('resolveCascade — DISABLE_CREW boss hook', () => {
  it('returns empty events and unmodified context when modifyCascadeOrder returns []', () => {
    const booster = makeCrew(1, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, hype: ctx.hype + 0.5 },
        newCooldown: 0,
      }),
    });

    const disableCrew: BossRuleHooks = {
      modifyCascadeOrder: () => [],
    };
    const params: BossRuleParams = { rule: 'DISABLE_CREW' };
    const state: BossRuleState = { bossPointHits: 0, markerIndex: 8, covenantActive: false };

    const ctx = makeCtx({ hype: 1.0 });
    const { finalContext, events } = resolveCascade([booster], ctx, neverCalledRng, disableCrew, params, state);
    expect(events).toHaveLength(0);
    expect(finalContext.hype).toBe(1.0);
  });
});

describe('resolveCascade — CONVERGENCE boss hook', () => {
  it('restricts cascade to first N slots when modifyCascadeOrder returns [0..N-1]', () => {
    const executed: number[] = [];
    const makeLogged = (id: number) =>
      makeCrew(id, {
        execute: (ctx: TurnContext) => {
          executed.push(id);
          return { context: { ...ctx, hype: ctx.hype + 0.1 }, newCooldown: 0 };
        },
      });

    const convergence: BossRuleHooks = {
      // Only first 3 slots active (simulating 2 seven-outs → 5-2=3 active)
      modifyCascadeOrder: () => [0, 1, 2],
    };
    const params: BossRuleParams = { rule: 'CONVERGENCE' };
    // For CONVERGENCE: bossPointHits stores seven-out count (per CLAUDE.md dual-use)
    const state: BossRuleState = { bossPointHits: 2, markerIndex: 26, covenantActive: false };

    resolveCascade(
      [makeLogged(1), makeLogged(2), makeLogged(3), makeLogged(4), makeLogged(5)],
      makeCtx({ hype: 1.0 }),
      neverCalledRng,
      convergence,
      params,
      state,
    );

    expect(executed).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// The Mimic (id=13) special-case in cascade
// ---------------------------------------------------------------------------

describe('resolveCascade — Mimic (id=13)', () => {
  it('Mimic in slot 0 is a no-op (no prior crew)', () => {
    const mimic = makeCrew(13, {
      execute: (ctx: TurnContext) => ({ context: ctx, newCooldown: 0 }),
    });

    const ctx = makeCtx({ hype: 1.0 });
    const { finalContext, events } = resolveCascade([mimic], ctx, neverCalledRng);
    expect(finalContext.hype).toBe(1.0);
    expect(events).toHaveLength(0);
  });

  it('Mimic copies the last crew that changed context', () => {
    // Slot 0: booster (+0.3 hype); Slot 1: Mimic → should also do +0.3
    const booster = makeCrew(1, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, hype: ctx.hype + 0.3 },
        newCooldown: 0,
      }),
    });
    const mimic = makeCrew(13, {
      execute: (ctx: TurnContext) => ({ context: ctx, newCooldown: 0 }),
    });

    const { finalContext } = resolveCascade([booster, mimic], makeCtx({ hype: 1.0 }), neverCalledRng);
    // 1.0 + 0.3 (booster) + 0.3 (mimic copies booster) = 1.6
    expect(finalContext.hype).toBeCloseTo(1.6, 4);
  });

  it('Mimic does not copy another Mimic (no chain)', () => {
    // Two Mimics in a row — second Mimic should not double-chain
    const booster = makeCrew(1, {
      execute: (ctx: TurnContext) => ({
        context: { ...ctx, hype: ctx.hype + 0.5 },
        newCooldown: 0,
      }),
    });
    const mimic1 = makeCrew(13, {
      execute: (ctx: TurnContext) => ({ context: ctx, newCooldown: 0 }),
    });
    const mimic2 = makeCrew(13, {
      execute: (ctx: TurnContext) => ({ context: ctx, newCooldown: 0 }),
    });

    const { finalContext } = resolveCascade(
      [booster, mimic1, mimic2],
      makeCtx({ hype: 1.0 }),
      neverCalledRng,
    );
    // booster: +0.5 → 1.5; mimic1 copies booster: +0.5 → 2.0; mimic2 copies booster (last non-mimic): +0.5 → 2.5
    // According to cascade.ts: "We track `member` (the slot occupant), not effectiveMember"
    // So lastFiredMember is always the non-Mimic booster → mimic2 also copies booster
    expect(finalContext.hype).toBeCloseTo(2.5, 4);
  });
});

// ---------------------------------------------------------------------------
// updatedCrewSlots — null slots preserved
// ---------------------------------------------------------------------------

describe('resolveCascade — updatedCrewSlots', () => {
  it('preserves null slots in updatedCrewSlots', () => {
    const slots: (CrewMember | null)[] = [makeCrew(1), null, makeCrew(2)];
    const { updatedCrewSlots } = resolveCascade(slots, makeCtx(), neverCalledRng);
    expect(updatedCrewSlots[1]).toBeNull();
  });

  it('length of updatedCrewSlots matches input crewSlots', () => {
    const slots: (CrewMember | null)[] = [makeCrew(1), null, null, makeCrew(4), null];
    const { updatedCrewSlots } = resolveCascade(slots, makeCtx(), neverCalledRng);
    expect(updatedCrewSlots).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// RNG forwarding — dice crew receive and can call rollDice
// ---------------------------------------------------------------------------

describe('resolveCascade — RNG forwarding', () => {
  it('passes rollDice through to crew execute()', () => {
    const rngSpy = vi.fn((): [number, number] => [2, 3]);
    const diceUser = makeCrew(1, {
      execute: (ctx: TurnContext, roll) => {
        const [d1, d2] = roll();
        return { context: { ...ctx, additives: ctx.additives + d1 + d2 }, newCooldown: 0 };
      },
    });

    const { finalContext } = resolveCascade([diceUser], makeCtx({ additives: 0 }), rngSpy);
    expect(rngSpy).toHaveBeenCalledOnce();
    expect(finalContext.additives).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Slot unlock progression (FB-025)
// ---------------------------------------------------------------------------

describe('resolveCascade — unlockedSlots boundary', () => {
  it('does NOT fire crew in slot 3 when unlockedSlots=3', () => {
    const executed: number[] = [];
    const trackingCrew = (id: number) => makeCrew(id, {
      execute: (ctx: TurnContext) => { executed.push(id); return { context: ctx, newCooldown: 0 }; },
    });
    const slots = [trackingCrew(0), trackingCrew(1), trackingCrew(2), trackingCrew(3), null];
    const ctx = makeCtx({ rollResult: 'NATURAL', unlockedSlots: 3 });
    resolveCascade(slots, ctx, neverCalledRng);
    expect(executed).toEqual([0, 1, 2]);
    expect(executed).not.toContain(3);
  });

  it('DOES fire crew in slot 3 when unlockedSlots=4', () => {
    const executed: number[] = [];
    const trackingCrew = (id: number) => makeCrew(id, {
      execute: (ctx: TurnContext) => { executed.push(id); return { context: ctx, newCooldown: 0 }; },
    });
    const slots: (ReturnType<typeof trackingCrew> | null)[] = [trackingCrew(0), null, trackingCrew(2), trackingCrew(3), null];
    const ctx = makeCtx({ rollResult: 'NATURAL', unlockedSlots: 4 });
    resolveCascade(slots, ctx, neverCalledRng);
    expect(executed).toContain(3);
  });

  it('does NOT fire crew in slot 4 when unlockedSlots=4', () => {
    const executed: number[] = [];
    const trackingCrew = (id: number) => makeCrew(id, {
      execute: (ctx: TurnContext) => { executed.push(id); return { context: ctx, newCooldown: 0 }; },
    });
    const slots: (ReturnType<typeof trackingCrew> | null)[] = [trackingCrew(0), null, null, trackingCrew(3), trackingCrew(4)];
    const ctx = makeCtx({ rollResult: 'NATURAL', unlockedSlots: 4 });
    resolveCascade(slots, ctx, neverCalledRng);
    expect(executed).not.toContain(4);
  });
});
