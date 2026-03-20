// =============================================================================
// CREW: THE MECHANIC
// packages/shared/src/crew/mechanic.ts
//
// Category:    DICE
// Ability:     Sets the lower-valued die to 6. Re-evaluates the outcome.
//              4-roll per_roll cooldown after each use.
// Cooldown:    per_roll (4 rolls)
//
// The Mechanic is a powerful but risky Dice crew. Setting a die to 6 often
// moves the total toward a high number — useful for hitting high-value points
// (8, 9, 10) or creating hardways — but can accidentally trigger a SEVEN_OUT
// if the other die is 1 (1 + 6 = 7).
//
// This is intentional game design: The Mechanic is high-ceiling, high-risk.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';
import { calculateBasePayouts, classifyDiceOutcome } from '../crapsEngine.js';

export const mechanic: CrewMember = {
  id:               3,
  name:             'The Mechanic',
  abilityCategory:  'DICE',
  cooldownType:     'per_roll',
  cooldownState:    0,
  baseCost:         25_000,  // $250.00
  visualId:         'mechanic',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // The Mechanic fires on every roll when not on cooldown.
    // Find the lower-valued die index. If equal, use index 1 (arbitrary but consistent).
    const lowerIndex = ctx.dice[0] <= ctx.dice[1] ? 0 : 1;
    const lowerValue = ctx.dice[lowerIndex];

    // If the lower die is already 6, nothing to do.
    if (lowerValue === 6) {
      return { context: ctx, newCooldown: 0 };
    }

    // Set the lower die to 6 and rebuild dice.
    const newDice: [number, number] = lowerIndex === 0
      ? [6, ctx.dice[1]]
      : [ctx.dice[0], 6];

    const newTotal    = newDice[0] + newDice[1];
    const newIsHardway = newDice[0] === newDice[1] && [4, 6, 8, 10].includes(newTotal);

    const phase         = ctx.activePoint !== null ? 'POINT_ACTIVE' : 'COME_OUT';
    const newRollResult = classifyDiceOutcome(newDice, phase, ctx.activePoint);
    const newPayouts    = calculateBasePayouts(newDice, newRollResult, ctx.activePoint, ctx.bets);

    return {
      context: {
        ...ctx,
        dice:               newDice,
        diceTotal:          newTotal,
        isHardway:          newIsHardway,
        rollResult:         newRollResult,
        basePassLinePayout: newPayouts.passLine,
        baseOddsPayout:     newPayouts.odds,
        baseHardwaysPayout: newPayouts.hardways,
      },
      // 4-roll cooldown: the cascade will decrement this by 1 each roll.
      newCooldown: 4,
    };
  },
};
