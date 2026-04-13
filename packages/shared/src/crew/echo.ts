// =============================================================================
// CREW: THE ECHO
// packages/shared/src/crew/echo.ts
//
// Category:    HYPE
// Ability:     +0.4 Hype when the dice repeat the same total as the last roll.
// Cooldown:    none
//
// Trigger: ctx.previousRollTotal !== null && ctx.diceTotal === ctx.previousRollTotal
// Does not fire on the shooter's first roll (previousRollTotal === null).
// Frequency: ~17% of rolls after the first of a shooter.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST = 0.4;

export const echo: CrewMember = {
  id:               20,
  name:             'The Echo',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         8_500,  // $85.00
  visualId:         'echo',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.previousRollTotal === null || ctx.diceTotal !== ctx.previousRollTotal) {
      return { context: ctx, newCooldown: 0 };
    }

    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
