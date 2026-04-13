// =============================================================================
// CREW: THE CLOSE CALL
// packages/shared/src/crew/closeCall.ts
//
// Category:    DICE
// Ability:     +$100 additive whenever the dice show consecutive face values.
// Cooldown:    none
//
// Trigger: Math.abs(ctx.dice[0] - ctx.dice[1]) === 1
// Covers: [1,2], [2,3], [3,4], [4,5], [5,6] in either order.
// Frequency: 10/36 ≈ 28% of all rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_BOOST = 10_000;  // $100.00

export const closeCall: CrewMember = {
  id:               18,
  name:             'The Close Call',
  abilityCategory:  'DICE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         11_000,  // $110.00
  visualId:         'close_call',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (Math.abs(ctx.dice[0] - ctx.dice[1]) !== 1) {
      return { context: ctx, newCooldown: 0 };
    }

    return {
      context: { ...ctx, additives: ctx.additives + ADDITIVE_BOOST },
      newCooldown: 0,
    };
  },
};
