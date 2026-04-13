// =============================================================================
// CREW: THE LOOKOUT
// packages/shared/src/crew/lookout.ts
//
// Category:    DICE
// Ability:     +0.15 Hype whenever a 6 appears on either die.
// Cooldown:    none
//
// Trigger: ctx.dice[0] === 6 || ctx.dice[1] === 6
// Frequency: 11/36 ≈ 31% of all rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST = 0.15;

export const lookout: CrewMember = {
  id:               16,
  name:             'The Lookout',
  abilityCategory:  'DICE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         6_500,  // $65.00
  visualId:         'lookout',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.dice[0] !== 6 && ctx.dice[1] !== 6) {
      return { context: ctx, newCooldown: 0 };
    }

    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
