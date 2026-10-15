// =============================================================================
// CREW: THE SHARK
// packages/shared/src/crew/shark.ts
//
// Category:    PAYOUT
// Ability:     Dynamic additive (0.65× max-bet) on any Point Hit.
// Cooldown:    none
//
// The Shark is the premier PAYOUT crew for the grind game. Every Point Hit —
// regardless of bet size — earns a floor-scaled bonus subsequently amplified
// by Hype and multipliers.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 0.65;  // 0.65× the current marker's max bet

export const shark: CrewMember = {
  id:               8,
  name:             'The Shark',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'shark',
  rarity:           'Rare',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'POINT_HIT') {
      return { context: ctx, newCooldown: 0 };
    }

    const maxBet = ctx.crewCashBaseCents;  // FB-041: table max × the floor's crew-cash scale
    const additive = Math.round(ADDITIVE_MULT * maxBet / 100) * 100;

    return {
      context: { ...ctx, additives: ctx.additives + additive },
      newCooldown: 0,
    };
  },
};
