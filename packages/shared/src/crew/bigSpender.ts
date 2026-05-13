// =============================================================================
// CREW: THE BIG SPENDER
// packages/shared/src/crew/bigSpender.ts
//
// Category:    PAYOUT
// Ability:     Dynamic additive (1.5× max-bet) on any roll where a Hardway bet wins.
// Cooldown:    none
//
// The Big Spender is a straightforward PAYOUT crew member. When any hardway
// bet wins, he slaps an extra bonus into the pot. Critically, this additive
// is boosted by Hype and other multipliers in settleTurn().
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 1.5;  // 1.5× the current marker's max bet

export const bigSpender: CrewMember = {
  id:               7,
  name:             'The Big Spender',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'big_spender',
  rarity:           'Uncommon',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Only activates when a hardway bet has won this roll.
    if (ctx.baseHardwaysPayout <= 0) {
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
