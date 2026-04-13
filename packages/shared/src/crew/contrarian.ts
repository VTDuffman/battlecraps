// =============================================================================
// CREW: THE CONTRARIAN
// packages/shared/src/crew/contrarian.ts
//
// Category:    WILDCARD
// Ability:     +$75 additive whenever this roll's total is lower than the last.
// Cooldown:    none
//
// Trigger: ctx.previousRollTotal !== null && ctx.diceTotal < ctx.previousRollTotal
// Does not fire on the shooter's first roll (previousRollTotal === null).
// Frequency: ~40% of rolls after the first of a shooter.
//
// Together with The Momentum (fires on ascent) and The Echo (fires on repeat),
// the trio covers nearly every roll of a shooter with distinct rewards.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_BOOST = 7_500;  // $75.00

export const contrarian: CrewMember = {
  id:               30,
  name:             'The Contrarian',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         8_500,  // $85.00
  visualId:         'contrarian',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.previousRollTotal === null || ctx.diceTotal >= ctx.previousRollTotal) {
      return { context: ctx, newCooldown: 0 };
    }

    return {
      context: { ...ctx, additives: ctx.additives + ADDITIVE_BOOST },
      newCooldown: 0,
    };
  },
};
