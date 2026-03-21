// =============================================================================
// CREW: THE REGULAR
// packages/shared/src/crew/regular.ts
//
// Category:    TABLE
// Ability:     On a Point Hit, any Hardway bet that was hit "soft" (and would
//              therefore be cleared as a loss) is instead refunded/reset.
// Cooldown:    none
//
// Craps detail: A point can be hit by either the "hard" version (paired dice)
// or the "soft" version (same total, non-paired). For example, if point=6:
//   [3,3] = Hard 6 → POINT_HIT + Hard 6 BET WINS
//   [2,4] = Soft 6 → POINT_HIT + Hard 6 BET LOSES
//
// The Regular only triggers in the second scenario: point hit via soft dice,
// which would normally clear the active hardway bet as a loss.
//
// Works in concert with The Mathlete (who protects on soft rolls in general).
// The Regular's value is specifically tied to the POINT_HIT moment, which
// also often coincides with other crew (Big Spender, Shark) firing.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext, HardwayBets } from '../types.js';

/** The four hardway numbers and their corresponding bet field keys. */
const HARDWAY_BET_KEY: Readonly<Record<number, keyof HardwayBets>> = {
  4: 'hard4', 6: 'hard6', 8: 'hard8', 10: 'hard10',
};

const HARDWAY_NUMBERS = new Set([4, 6, 8, 10]);

export const regular: CrewMember = {
  id:               6,
  name:             'The Regular',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         10_000,  // $100.00
  visualId:         'regular',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Activates when: POINT_HIT via soft dice AND there's a hardway bet on
    // that number that would be lost. In the deduct-on-placement model,
    // losses return 0, so we detect the loss by checking the dice directly:
    //   1. Roll result is POINT_HIT
    //   2. Dice total is a hardway number (4/6/8/10)
    //   3. Dice are NOT paired (soft hit — the hardway bet loses)
    //   4. There's an active bet on that hardway number
    if (ctx.rollResult !== 'POINT_HIT') {
      return { context: ctx, newCooldown: 0 };
    }

    if (!HARDWAY_NUMBERS.has(ctx.diceTotal) || ctx.isHardway) {
      return { context: ctx, newCooldown: 0 };
    }

    const betKey = HARDWAY_BET_KEY[ctx.diceTotal];
    if (betKey === undefined || ctx.bets.hardways[betKey] === 0) {
      return { context: ctx, newCooldown: 0 };
    }

    // Ability fires: refund the hardway stake. The bet was already deducted
    // at placement, so we add it to baseStakeReturned to give the money back
    // without hype/multiplier amplification (it's a refund, not a win).
    // Also restore the bet in resolvedBets since the engine pre-cleared it.
    const refundAmount = ctx.bets.hardways[betKey];
    const restoredHardways = { ...ctx.resolvedBets.hardways, [betKey]: ctx.bets.hardways[betKey] };

    return {
      context: {
        ...ctx,
        baseStakeReturned: ctx.baseStakeReturned + refundAmount,
        resolvedBets: { ...ctx.resolvedBets, hardways: restoredHardways },
      },
      newCooldown: 0,
    };
  },
};
