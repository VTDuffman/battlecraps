// =============================================================================
// CREW: THE BIG SPENDER
// packages/shared/src/crew/bigSpender.ts
//
// Category:    PAYOUT
// Ability:     +$100 (10000 cents) flat bonus added to the payout on any
//              roll where a Hardway bet wins.
// Cooldown:    none
//
// The Big Spender is a straightforward PAYOUT crew member. When any hardway
// bet wins, he slaps an extra $100 into the pot. Critically, this additive
// is boosted by Hype and other multipliers in settleTurn() — so with Hype
// at 2.0x and The Whale active, that $100 effectively becomes $240.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const BONUS_CENTS = 10_000; // +$100.00

export const bigSpender: CrewMember = {
  id:               7,
  name:             'The Big Spender',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         8_000,  // $80.00
  visualId:         'big_spender',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Only activates when a hardway bet has won this roll.
    if (ctx.baseHardwaysPayout <= 0) {
      return { context: ctx, newCooldown: 0 };
    }

    return {
      context: { ...ctx, additives: ctx.additives + BONUS_CENTS },
      newCooldown: 0,
    };
  },
};
