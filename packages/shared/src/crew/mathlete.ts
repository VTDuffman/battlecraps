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

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const mathlete: CrewMember = {
  id:               4,
  name:             'The Mathlete',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         12_000,  // $120.00
  visualId:         'mathlete',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Activates when: a hardway bet would have LOST due to a soft roll (not seven-out).
    // Condition: negative hardways payout AND the roll is NOT a seven-out.
    if (ctx.baseHardwaysPayout >= 0 || ctx.rollResult === 'SEVEN_OUT') {
      return { context: ctx, newCooldown: 0 };
    }

    // Ability fires: protect the hardway bet from being cleared.
    // Set baseHardwaysPayout to 0 (saved, not lost) and raise the flag.
    return {
      context: {
        ...ctx,
        baseHardwaysPayout: 0,
        flags: { ...ctx.flags, hardwayProtected: true },
      },
      newCooldown: 0,
    };
  },
};
