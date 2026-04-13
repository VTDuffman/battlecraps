// =============================================================================
// CREW: THE GRINDER
// packages/shared/src/crew/grinder.ts
//
// Category:    TABLE
// Ability:     +$30 additive on every NO_RESOLUTION (blank point-phase roll).
// Cooldown:    none
//
// Trigger: ctx.rollResult === 'NO_RESOLUTION'
// NO_RESOLUTION cannot occur on come-out — this is point-phase only.
// Frequency: ~65–70% of point-phase rolls.
// Turns the most common "nothing happened" roll into steady income.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_BOOST = 3_000;  // $30.00

export const grinder: CrewMember = {
  id:               25,
  name:             'The Grinder',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         13_000,  // $130.00
  visualId:         'grinder',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'NO_RESOLUTION') {
      return { context: ctx, newCooldown: 0 };
    }

    return {
      context: { ...ctx, additives: ctx.additives + ADDITIVE_BOOST },
      newCooldown: 0,
    };
  },
};
