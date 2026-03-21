// =============================================================================
// CREW: THE REGULAR
// packages/shared/src/crew/regular.ts
//
// Category:    TABLE
// Ability:     Hardway insurance — protects hardway bets in two scenarios:
//              1. On a soft Point Hit (same as before): refund the hardway bet
//              2. On a SEVEN_OUT: refund ALL active hardway bets
// Cooldown:    none
//
// Craps detail: A point can be hit by either the "hard" version (paired dice)
// or the "soft" version (same total, non-paired). For example, if point=6:
//   [3,3] = Hard 6 → POINT_HIT + Hard 6 BET WINS
//   [2,4] = Soft 6 → POINT_HIT + Hard 6 BET LOSES
//
// The Regular triggers in the second scenario (soft point hit) and ALSO
// saves all hardway bets on a seven-out — a unique niche that The Mathlete
// does NOT cover (Mathlete explicitly skips SEVEN_OUT).
//
// This makes The Regular a hardway insurance specialist: Mathlete protects
// mid-run, Regular protects at the catastrophic seven-out moment.
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
    // ── Trigger 1: SEVEN_OUT → refund ALL active hardway bets ──────────
    // On a seven-out, all hardways are wiped. The Regular saves them by
    // refunding every active hardway stake. This is the Regular's unique
    // niche — The Mathlete explicitly does NOT cover seven-outs.
    if (ctx.rollResult === 'SEVEN_OUT') {
      const keys = Object.keys(HARDWAY_BET_KEY) as unknown as number[];
      let totalRefund = 0;
      const restoredHardways = { ...ctx.resolvedBets.hardways };

      for (const num of keys) {
        const betKey = HARDWAY_BET_KEY[num]!;
        const betAmount = ctx.bets.hardways[betKey];
        if (betAmount > 0) {
          totalRefund += betAmount;
          restoredHardways[betKey] = betAmount;
        }
      }

      if (totalRefund === 0) {
        return { context: ctx, newCooldown: 0 };
      }

      return {
        context: {
          ...ctx,
          baseStakeReturned: ctx.baseStakeReturned + totalRefund,
          resolvedBets: { ...ctx.resolvedBets, hardways: restoredHardways },
        },
        newCooldown: 0,
      };
    }

    // ── Trigger 2: Soft Point Hit → refund the matching hardway bet ────
    // Activates when: POINT_HIT via soft dice AND there's a hardway bet on
    // that number that would be lost.
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
