// =============================================================================
// CREW: THE GRINDER
// packages/shared/src/crew/grinder.ts
//
// Category:    TABLE
// Ability:     Dynamic additive (0.75× max-bet) on every NO_RESOLUTION.
// Cooldown:    none
//
// Trigger: ctx.rollResult === 'NO_RESOLUTION'
// NO_RESOLUTION cannot occur on come-out — this is point-phase only.
// Frequency: ~65–70% of point-phase rolls.
// Turns the most common "nothing happened" roll into steady income.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 0.75;  // 0.75× the current marker's max bet

export const grinder: CrewMember = {
  id:               25,
  name:             'The Grinder',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'grinder',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'NO_RESOLUTION') {
      return { context: ctx, newCooldown: 0 };
    }

    const maxBet = Math.floor(ctx.markerTargetCents * 0.10);
    const additive = Math.round(ADDITIVE_MULT * maxBet / 100) * 100;

    return {
      context: { ...ctx, additives: ctx.additives + additive },
      newCooldown: 0,
    };
  },
};
