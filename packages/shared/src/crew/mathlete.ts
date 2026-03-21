// =============================================================================
// CREW: THE MATHLETE
// packages/shared/src/crew/mathlete.ts
//
// Category:    TABLE
// Ability:     Hardways stay up on "Soft" rolls. When a non-paired roll of a
//              hardway number would normally wipe a hardway bet, The Mathlete
//              negates that loss and protects the bet.
// Cooldown:    none
//
// Example: Hard 6 bet active. Dice show [2,4]=6 (soft 6).
//          Without Mathlete: Hard 6 bet is LOST.
//          With Mathlete: Hard 6 bet is PROTECTED (baseHardwaysPayout set to 0).
//
// Does NOT fire on SEVEN_OUT — seven-out clears everything, even for The Mathlete.
// Does NOT fire on hardway WINS — only activates to prevent losses.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext, HardwayBets } from '../types.js';

/** The four hardway numbers and their corresponding bet field keys. */
const HARDWAY_BET_KEY: Readonly<Record<number, keyof HardwayBets>> = {
  4: 'hard4', 6: 'hard6', 8: 'hard8', 10: 'hard10',
};

const HARDWAY_NUMBERS = new Set([4, 6, 8, 10]);

export const mathlete: CrewMember = {
  id:               4,
  name:             'The Mathlete',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         12_000,  // $120.00
  visualId:         'mathlete',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Activates when: a soft roll of a hardway number would clear an active
    // hardway bet. In the deduct-on-placement model, losses return 0 (not
    // negative), so we detect the loss by checking the dice directly:
    //   1. Not a seven-out (those clear everything, Mathlete can't help)
    //   2. Dice total is a hardway number (4/6/8/10)
    //   3. Dice are NOT paired (it's a "soft" / "easy" roll)
    //   4. There's an active bet on that hardway number
    if (ctx.rollResult === 'SEVEN_OUT') {
      return { context: ctx, newCooldown: 0 };
    }

    if (!HARDWAY_NUMBERS.has(ctx.diceTotal) || ctx.isHardway) {
      return { context: ctx, newCooldown: 0 };
    }

    const betKey = HARDWAY_BET_KEY[ctx.diceTotal];
    if (betKey === undefined || ctx.bets.hardways[betKey] === 0) {
      return { context: ctx, newCooldown: 0 };
    }

    // Ability fires: protect the hardway bet from being cleared.
    // The engine already zeroed this bet in resolvedBets (via calcResolvedBets),
    // so we must restore it to keep the bet alive on the table.
    const restoredHardways = { ...ctx.resolvedBets.hardways, [betKey]: ctx.bets.hardways[betKey] };

    return {
      context: {
        ...ctx,
        resolvedBets: { ...ctx.resolvedBets, hardways: restoredHardways },
        flags: { ...ctx.flags, hardwayProtected: true },
      },
      newCooldown: 0,
    };
  },
};
