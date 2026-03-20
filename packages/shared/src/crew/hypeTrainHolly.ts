// =============================================================================
// CREW: "HYPE-TRAIN" HOLLY
// packages/shared/src/crew/hypeTrainHolly.ts
//
// Category:    HYPE
// Ability:     1.5× Hype on a "Yo-leven" (specifically an 11 on the Come Out).
// Cooldown:    none
//
// Holly is more selective but far more powerful than The Nervous Intern.
// She only fires on the Yo-leven (total=11), but multiplies Hype by 1.5
// instead of adding a flat amount. This means she compounds with previously
// accumulated Hype rather than just adding to it:
//
//   Hype 1.4 → Holly fires → Hype 1.4 × 1.5 = 2.1
//   Hype 2.0 → Holly fires → Hype 2.0 × 1.5 = 3.0  (but see Lucky Charm cap)
//
// Rounding to 4 decimal places prevents IEEE-754 float accumulation from
// corrupting the final Math.floor() in settleTurn(). e.g., 1.2 × 1.5 would
// otherwise produce 1.7999... instead of 1.8.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_MULTIPLIER = 1.5;

export const hypeTrainHolly: CrewMember = {
  id:               11,
  name:             '"Hype-Train" Holly',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         14_000,  // $140.00
  visualId:         'hype_train_holly',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Only activates on a Yo-leven: a NATURAL roll where both dice total 11.
    // [5,6] or [6,5] — the only two ways to roll 11.
    if (ctx.rollResult !== 'NATURAL' || ctx.diceTotal !== 11) {
      return { context: ctx, newCooldown: 0 };
    }

    // Round to 4 decimal places to prevent float accumulation errors.
    // e.g., 1.2 × 1.5 = 1.7999... in IEEE-754 → rounds to 1.8
    const newHype = Math.round(ctx.hype * HYPE_MULTIPLIER * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
