// =============================================================================
// CREW: THE SHARK
// packages/shared/src/crew/shark.ts
//
// Category:    PAYOUT
// Ability:     +$100 (10000 cents) flat bonus on any Point Hit.
// Cooldown:    none
//
// The Shark is the premier PAYOUT crew for the grind game. Every Point Hit —
// regardless of bet size — earns a flat $100 bonus that's subsequently
// amplified by Hype and multipliers. At Hype 2.0x + Whale 1.2x, The Shark's
// bonus alone becomes $240 per Point Hit.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const BONUS_CENTS = 10_000; // +$100.00

export const shark: CrewMember = {
  id:               8,
  name:             'The Shark',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         18_000,  // $180.00
  visualId:         'shark',
  rarity:           'Rare',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'POINT_HIT') {
      return { context: ctx, newCooldown: 0 };
    }

    return {
      context: { ...ctx, additives: ctx.additives + BONUS_CENTS },
      newCooldown: 0,
    };
  },
};
