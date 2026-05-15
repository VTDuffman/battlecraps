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
  visualId:         'physics_prof',
  rarity:           'Rare',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // No effect during come-out — no active point to nudge toward.
    if (ctx.activePoint === null) {
      return { context: ctx, newCooldown: 0 };
    }

    // No effect when the roll already hits the point — don't alter a winner.
    if (ctx.diceTotal === ctx.activePoint) {
      return { context: ctx, newCooldown: 0 };
    }

    // Only activates on paired dice (both dice showing the same face).
    // isHardway covers 4/6/8/10 pairs; we also handle [1,1] and [6,6].
    if (ctx.dice[0] !== ctx.dice[1]) {
      return { context: ctx, newCooldown: 0 };
    }

    const currentValue = ctx.dice[0];

    // Distance-based shift: step one increment in whichever direction closes
    // the gap between the nudged total and the active point.
    const distUp   = currentValue === 6 ? Infinity : Math.abs((currentValue + 1) * 2 - ctx.activePoint);
    const distDown = currentValue === 1 ? Infinity : Math.abs((currentValue - 1) * 2 - ctx.activePoint);
    const shift: 1 | -1 = distUp < distDown ? 1 : -1;

    const newValue = currentValue + shift;

    // Safety: if resulting die is out of range (shouldn't happen with the guards above),
    // abort without changing anything.
    if (newValue < 1 || newValue > 6) {
      return { context: ctx, newCooldown: 0 };
    }

    const newDice: [number, number] = [newValue, newValue];
    const newTotal    = newValue * 2;
    const newIsHardway = [4, 6, 8, 10].includes(newTotal); // Both dice are equal, so it's always a pair

    const newRollResult = classifyDiceOutcome(newDice, 'POINT_ACTIVE', ctx.activePoint);
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
        flags: { ...ctx.flags, nudgedFrom: ctx.dice },
      },
      newCooldown: 0,
    };
  },
};
