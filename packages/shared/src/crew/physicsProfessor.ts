// =============================================================================
// CREW: THE PHYSICS PROFESSOR
// packages/shared/src/crew/physicsProfessor.ts
//
// Category:    DICE
// Ability:     On any paired dice roll, nudges both dice by ±1 toward the
//              active point. Turns near-misses into Point Hits.
// Cooldown:    none
//
// Example: Point=8, dice=[3,3]=6 → shifts to [4,4]=8 → POINT_HIT!
// Example: Point=4, dice=[3,3]=6 → shifts to [2,2]=4 → POINT_HIT!
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';
import { calculateBasePayouts, classifyDiceOutcome } from '../crapsEngine.js';

export const physicsProfessor: CrewMember = {
  id:               2,
  name:             'The Physics Prof',
  abilityCategory:  'DICE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         20_000,  // $200.00
  visualId:         'physics_prof',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Only activates on paired dice (both dice showing the same face).
    // isHardway covers 4/6/8/10 pairs; we also handle [1,1] and [6,6].
    if (ctx.dice[0] !== ctx.dice[1]) {
      return { context: ctx, newCooldown: 0 };
    }

    const currentValue = ctx.dice[0];

    // Determine optimal shift direction: try to land on the active point.
    let shift: 1 | -1;
    const targetTotal = ctx.activePoint;

    if (targetTotal !== null && ctx.diceTotal + 2 === targetTotal && currentValue < 6) {
      // Shifting +1 to both dice (+2 to total) would hit the point exactly.
      shift = 1;
    } else if (targetTotal !== null && ctx.diceTotal - 2 === targetTotal && currentValue > 1) {
      // Shifting -1 to both dice (-2 to total) would hit the point exactly.
      shift = -1;
    } else if (currentValue >= 6) {
      // Can't go higher — must shift down.
      shift = -1;
    } else {
      // Default: shift up (increases hardway diversity, nudges toward higher-value points).
      shift = 1;
    }

    const newValue = currentValue + shift;

    // Safety: if resulting die is out of range (shouldn't happen with the guards above),
    // abort without changing anything.
    if (newValue < 1 || newValue > 6) {
      return { context: ctx, newCooldown: 0 };
    }

    const newDice: [number, number] = [newValue, newValue];
    const newTotal    = newValue * 2;
    const newIsHardway = [4, 6, 8, 10].includes(newTotal); // Both dice are equal, so it's always a pair

    // Determine phase for re-classification: Prof can fire in COME_OUT or POINT_ACTIVE.
    const phase = ctx.activePoint !== null ? 'POINT_ACTIVE' : 'COME_OUT';
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
        baseStakeReturned:  newPayouts.stakeReturned,
        resolvedBets:       newPayouts.resolvedBets,
      },
      newCooldown: 0,
    };
  },
};
