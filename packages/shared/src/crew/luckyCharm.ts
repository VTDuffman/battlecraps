// =============================================================================
// CREW: THE LUCKY CHARM
// packages/shared/src/crew/luckyCharm.ts
//
// Category:    HYPE
// Ability:     On any SEVEN_OUT, fires a +1.0 Hype boost before the reset.
// Cooldown:    none
//
// The hype reset on SEVEN_OUT normally drives hype back to 1.0×. Lucky Charm
// fires DURING the cascade (before computeNextState) and injects +1.0 Hype.
// The server's cascadeHypeDelta mechanism captures this delta and carries it
// forward, so the next shooter starts at 1.0 + 1.0 = 2.0× Hype minimum.
//
// With Sea Legs (comp): seaLegsBaseline = 1.0 + (run.hype - 1.0) / 2.
// Lucky Charm cascadeHypeDelta stacks on top — so at 2.0× pre-seven-out:
//   seaLegsBaseline = 1.5, cascadeHypeDelta = 1.0 → nextHype = 2.5×.
//
// DISTINCTNESS:
//   - Lefty:     Prevents the seven-out from happening (re-rolls the dice).
//   - Sea Legs:  Comp perk — retains 50% of accumulated Hype above 1.0.
//   - Lucky Charm: Injects a flat +1.0 Hype boost; next shooter always at ≥2.0×.
//
// UNIT TEST HINTS:
//   // Should fire and boost Hype:
//   const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.4 });
//   const result = luckyCharm.execute(ctx, noRoll);
//   assert(result.context.hype === 2.4);
//   assert(result.newCooldown === 0);
//
//   // Should NOT fire on non-seven-out:
//   const ctx2 = makeCtx({ rollResult: 'POINT_HIT', hype: 1.4 });
//   const result2 = luckyCharm.execute(ctx2, noRoll);
//   assert(result2.context === ctx2); // unchanged
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const luckyCharm: CrewMember = {
  id:               15,
  name:             'The Lucky Charm',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'lucky_charm',
  rarity:           'Rare',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'SEVEN_OUT') {
      return { context: ctx, newCooldown: 0 };
    }
    // Inject +1.0 Hype before the server reset. cascadeHypeDelta captures this
    // so the next shooter starts at 2.0× (1.0 reset floor + 1.0 Lucky Charm delta).
    return {
      context: { ...ctx, hype: ctx.hype + 1.0 },
      newCooldown: 0,
    };
  },
};

/** The crew ID used by resolveCascade() to identify and special-case The Lucky Charm. */
export const LUCKY_CHARM_ID = 15;
