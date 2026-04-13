// =============================================================================
// CREW: "ACE" McGEE
// packages/shared/src/crew/aceMcgee.ts
//
// Category:    DICE
// Ability:     +$50 additive whenever a 1 appears on either die.
// Cooldown:    none
//
// Trigger: ctx.dice[0] === 1 || ctx.dice[1] === 1
// Frequency: 11/36 ≈ 31% of all rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_BOOST = 5_000;  // $50.00

export const aceMcgee: CrewMember = {
  id:               17,
  name:             '"Ace" McGee',
  abilityCategory:  'DICE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         6_000,  // $60.00
  visualId:         'ace_mcgee',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.dice[0] !== 1 && ctx.dice[1] !== 1) {
      return { context: ctx, newCooldown: 0 };
    }

    return {
      context: { ...ctx, additives: ctx.additives + ADDITIVE_BOOST },
      newCooldown: 0,
    };
  },
};
