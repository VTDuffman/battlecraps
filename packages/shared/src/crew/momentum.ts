// =============================================================================
// CREW: THE MOMENTUM
// packages/shared/src/crew/momentum.ts
//
// Category:    HYPE
// Ability:     +0.2 Hype whenever this roll's total is higher than the last.
// Cooldown:    none
//
// Trigger: ctx.previousRollTotal !== null && ctx.diceTotal > ctx.previousRollTotal
// Does not fire on the shooter's first roll (previousRollTotal === null).
// Frequency: ~45% of rolls after the first of a shooter.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST = 0.2;

export const momentum: CrewMember = {
  id:               19,
  name:             'The Momentum',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         9_000,  // $90.00
  visualId:         'momentum',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.previousRollTotal === null || ctx.diceTotal <= ctx.previousRollTotal) {
      return { context: ctx, newCooldown: 0 };
    }

    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
