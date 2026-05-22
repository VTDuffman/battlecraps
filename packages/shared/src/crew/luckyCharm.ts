// =============================================================================
// CREW: THE LUCKY CHARM
// packages/shared/src/crew/luckyCharm.ts
//
// Category:    HYPE
// Ability:     On the FIRST SEVEN_OUT per shooter, fires a +1.0 Hype boost
//              before the reset.
// Cooldown:    per_shooter (fires once; resets when a new shooter takes the table)
//
// The hype reset on SEVEN_OUT normally drives hype back to 1.0×. Lucky Charm
// fires DURING the cascade (before computeNextState) and injects +1.0 Hype.
// The server's cascadeHypeDelta mechanism captures this delta and carries it
// forward, so the next shooter starts with a Hype advantage.
//
// Fires only once per shooter — cooldownState is set to 1 after firing and
// cleared by the server's per_shooter reset on new-shooter transitions.
//
// With Sea Legs (comp): seaLegsBaseline = 1.0 + (run.hype - 1.0) / 2.
// Lucky Charm cascadeHypeDelta stacks on top — so at 2.0× pre-seven-out:
//   seaLegsBaseline = 1.5, cascadeHypeDelta = 1.0 → nextHype = 2.5×.
//
// DISTINCTNESS:
//   - Lefty:     Prevents the seven-out from happening (re-rolls the dice).
//   - Sea Legs:  Comp perk — retains 50% of accumulated Hype above 1.0.
//   - Lucky Charm: Injects a flat +1.0 Hype boost; once per shooter.
//
// UNIT TEST HINTS:
//   // Should fire on first seven-out (cooldownState = 0):
//   const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.4 });
//   const charm = { ...luckyCharm, cooldownState: 0 };
//   const result = charm.execute(ctx, noRoll);
//   assert(result.context.hype === 2.4);
//   assert(result.newCooldown === 1);
//
//   // Should NOT fire on second seven-out this shooter (cooldownState = 1):
//   const charm2 = { ...luckyCharm, cooldownState: 1 };
//   const result2 = charm2.execute(ctx, noRoll);
//   assert(result2.context === ctx); // unchanged
//   assert(result2.newCooldown === 1);
//
//   // Should NOT fire on non-seven-out:
//   const ctx3 = makeCtx({ rollResult: 'POINT_HIT', hype: 1.4 });
//   const result3 = luckyCharm.execute(ctx3, noRoll);
//   assert(result3.context === ctx3); // unchanged
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const luckyCharm: CrewMember = {
  id:               15,
  name:             'The Lucky Charm',
  abilityCategory:  'HYPE',
  cooldownType:     'per_shooter',
  cooldownState:    0,
  visualId:         'lucky_charm',
  rarity:           'Rare',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'SEVEN_OUT') {
      return { context: ctx, newCooldown: 0 };
    }

    // Guard: cascade.ts checks cooldownState before calling execute(), but
    // this internal check protects direct unit-test calls from bypassing that.
    if (this.cooldownState > 0) {
      return { context: ctx, newCooldown: this.cooldownState };
    }

    // Inject +1.0 Hype before the server reset. cascadeHypeDelta captures this
    // so the next shooter starts with a Hype advantage.
    return {
      context: { ...ctx, hype: ctx.hype + 1.0 },
      newCooldown: 1,
    };
  },
};

/** The crew ID used by resolveCascade() to identify and special-case The Lucky Charm. */
export const LUCKY_CHARM_ID = 15;
