// =============================================================================
// CREW: THE FLOOR WALKER
// packages/shared/src/crew/floorWalker.ts
//
// Category:    TABLE
// Ability:     The FIRST Seven Out of a shooter's life does not clear (lose)
//              the Pass Line bet. The bet is refunded instead of forfeited.
// Cooldown:    per_shooter — used once, then locked until the next shooter.
//
// The Floor Walker doesn't stop the seven-out from happening (the shooter
// still loses a life, the point resets, and Hype resets). He only saves
// the Pass Line bet amount from being taken by the house.
//
// Note: He does NOT protect the Odds bet — those are lost normally.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const floorWalker: CrewMember = {
  id:               5,
  name:             'The Floor Walker',
  abilityCategory:  'TABLE',
  cooldownType:     'per_shooter',
  cooldownState:    0,
  baseCost:         15_000,  // $150.00
  visualId:         'floor_walker',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Only activates on a Seven Out when there is a Pass Line bet to protect.
    // In the deduct-on-placement model, losses return 0 (not negative) because
    // the stake was already deducted at bet placement. We detect a loss by
    // checking that a pass line bet exists — on SEVEN_OUT it is always lost.
    if (ctx.rollResult !== 'SEVEN_OUT' || ctx.bets.passLine === 0) {
      return { context: ctx, newCooldown: 0 };
    }

    // Ability fires: refund the Pass Line stake by adding it to stakeReturned.
    // The pass line bet was already deducted from the bankroll at placement,
    // so returning the stake via baseStakeReturned gives the player their
    // money back without it being amplified by hype/multipliers.
    return {
      context: {
        ...ctx,
        baseStakeReturned: ctx.baseStakeReturned + ctx.bets.passLine,
        flags: { ...ctx.flags, passLineProtected: true },
      },
      // per_shooter cooldown: 1 = spent for rest of shooter.
      // Server resets to 0 when GameState.shooters decrements (new shooter starts).
      newCooldown: 1,
    };
  },
};
