// =============================================================================
// CREW: THE REGULAR
// packages/shared/src/crew/regular.ts
//
// Category:    TABLE
// Ability:     On a Point Hit, any Hardway bet that was hit "soft" (and would
//              therefore be cleared as a loss) is instead refunded/reset.
// Cooldown:    none
//
// Craps detail: A point can be hit by either the "hard" version (paired dice)
// or the "soft" version (same total, non-paired). For example, if point=6:
//   [3,3] = Hard 6 → POINT_HIT + Hard 6 BET WINS
//   [2,4] = Soft 6 → POINT_HIT + Hard 6 BET LOSES
//
// The Regular only triggers in the second scenario: point hit via soft dice,
// which would normally clear the active hardway bet as a loss.
//
// Works in concert with The Mathlete (who protects on soft rolls in general).
// The Regular's value is specifically tied to the POINT_HIT moment, which
// also often coincides with other crew (Big Spender, Shark) firing.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const regular: CrewMember = {
  id:               6,
  name:             'The Regular',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         10_000,  // $100.00
  visualId:         'regular',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Activates when: POINT_HIT AND a hardway bet was lost (soft roll of the point).
    if (ctx.rollResult !== 'POINT_HIT' || ctx.baseHardwaysPayout >= 0) {
      return { context: ctx, newCooldown: 0 };
    }

    // Ability fires: negate the hardway loss on this point hit.
    // The bet isn't "won" — it's saved (refunded). No additive, no multiplier.
    return {
      context: {
        ...ctx,
        baseHardwaysPayout: 0,
      },
      newCooldown: 0,
    };
  },
};
