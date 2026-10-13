// =============================================================================
// CREW: THE GRINDER
// packages/shared/src/crew/grinder.ts
//
// Category:    TABLE
// Ability:     Dynamic additive (0.28× max-bet) on every NO_RESOLUTION.
// Cooldown:    none
//
// Trigger: ctx.rollResult === 'NO_RESOLUTION'
// Point-phase only. A come-out craps-out blocked by Poseidon's Favor is also
// reported as NO_RESOLUTION (with no active point), so that case is excluded.
// Frequency: ~65–70% of point-phase rolls.
// Turns the most common "nothing happened" roll into steady income.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 0.15;  // 0.15× the current marker's max bet

export const grinder: CrewMember = {
  id:               25,
  name:             'The Grinder',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'grinder',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'NO_RESOLUTION' || ctx.activePoint === null) {
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
