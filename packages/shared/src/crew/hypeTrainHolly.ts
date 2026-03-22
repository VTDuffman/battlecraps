// =============================================================================
// CREW: "HYPE-TRAIN" HOLLY
// packages/shared/src/crew/hypeTrainHolly.ts
//
// Category:    HYPE
// Ability:     +0.3× Hype on every Point Hit.
//              When the shooter wins, the whole table gets more excited.
//              Hype accumulates across a run — every point hit builds the crowd.
// Cooldown:    none
//
// Examples:
//   Hype 1.0 → Holly fires on Point Hit → Hype 1.3
//   Hype 1.3 → Holly fires on Point Hit → Hype 1.6
//   Hype 1.6 → Holly fires on Point Hit → Hype 1.9
//
// Rounding to 4 decimal places prevents IEEE-754 float accumulation from
// corrupting the final Math.floor() in settleTurn().
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST = 0.3;

export const hypeTrainHolly: CrewMember = {
  id:               11,
  name:             '"Hype-Train" Holly',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         10_000,
  visualId:         'hype_train_holly',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Only activates on a POINT_HIT — when the shooter makes their point.
    if (ctx.rollResult !== 'POINT_HIT') {
      return { context: ctx, newCooldown: 0 };
    }

    // Round to 4 decimal places to prevent float accumulation errors.
    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
