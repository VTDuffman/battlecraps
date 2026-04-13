// =============================================================================
// CREW: THE ODD COUPLE
// packages/shared/src/crew/oddCouple.ts
//
// Category:    HYPE
// Ability:     +0.2 Hype whenever both dice show odd faces (1, 3, or 5).
// Cooldown:    none
//
// Trigger: ctx.dice[0] % 2 === 1 && ctx.dice[1] % 2 === 1
// Frequency: 9/36 = 25% of all rolls.
// Pairs with The Even Keel for 50% combined roll coverage.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST = 0.2;

export const oddCouple: CrewMember = {
  id:               22,
  name:             'The Odd Couple',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         8_000,  // $80.00
  visualId:         'odd_couple',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.dice[0] % 2 !== 1 || ctx.dice[1] % 2 !== 1) {
      return { context: ctx, newCooldown: 0 };
    }

    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
