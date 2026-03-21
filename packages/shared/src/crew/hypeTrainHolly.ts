// =============================================================================
// CREW: "HYPE-TRAIN" HOLLY
// packages/shared/src/crew/hypeTrainHolly.ts
//
// Category:    HYPE
// Ability:     Hype multiplier on any NATURAL (7 or 11 on the Come Out).
//              - Yo-leven (11): 1.5× Hype  (the big moment)
//              - Lucky 7:       1.2× Hype  (still hype-worthy)
// Cooldown:    none
//
// Holly fires on any NATURAL, making her far more consistent than before.
// She compounds with previously accumulated Hype rather than adding flat:
//
//   Hype 1.4 → Holly fires on 11 → Hype 1.4 × 1.5 = 2.1
//   Hype 1.4 → Holly fires on 7  → Hype 1.4 × 1.2 = 1.68
//   Hype 2.0 → Holly fires on 11 → Hype 2.0 × 1.5 = 3.0
//
// Rounding to 4 decimal places prevents IEEE-754 float accumulation from
// corrupting the final Math.floor() in settleTurn(). e.g., 1.2 × 1.5 would
// otherwise produce 1.7999... instead of 1.8.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_MULTIPLIER_YO  = 1.5;  // Yo-leven (11) — the big moment
const HYPE_MULTIPLIER_7   = 1.2;  // Lucky 7 — still hype-worthy

export const hypeTrainHolly: CrewMember = {
  id:               11,
  name:             '"Hype-Train" Holly',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         10_000,  // $100.00 — down from $140; broader trigger justifies lower price
  visualId:         'hype_train_holly',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Only activates on a NATURAL (7 or 11 on the come-out).
    if (ctx.rollResult !== 'NATURAL') {
      return { context: ctx, newCooldown: 0 };
    }

    // Pick multiplier: Yo-leven (11) gets the big boost, Lucky 7 gets a smaller one.
    const multiplier = ctx.diceTotal === 11 ? HYPE_MULTIPLIER_YO : HYPE_MULTIPLIER_7;

    // Round to 4 decimal places to prevent float accumulation errors.
    // e.g., 1.2 × 1.5 = 1.7999... in IEEE-754 → rounds to 1.8
    const newHype = Math.round(ctx.hype * multiplier * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
