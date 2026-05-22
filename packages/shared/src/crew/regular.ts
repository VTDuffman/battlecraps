// =============================================================================
// CREW: THE REGULAR
// packages/shared/src/crew/regular.ts
//
// Category:    PAYOUT
// Ability:     On a Natural (7 or 11 on the come-out), adds a floor-scaled
//              bonus (0.75× current max bet) to the payout pool.
// Cooldown:    none
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 0.75;

export const regular: CrewMember = {
  id:               6,
  name:             'The Regular',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'regular',
  rarity:           'Uncommon',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'NATURAL') {
      return { context: ctx, newCooldown: 0 };
    }

    const maxBet   = Math.floor(ctx.markerTargetCents * 0.10);
    const additive = Math.round(ADDITIVE_MULT * maxBet / 100) * 100;
    return {
      context: { ...ctx, additives: ctx.additives + additive },
      newCooldown: 0,
    };
  },
};
