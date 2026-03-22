// =============================================================================
// CREW: THE REGULAR
// packages/shared/src/crew/regular.ts
//
// Category:    PAYOUT
// Ability:     On a Natural (7 or 11 on the come-out), grants a free Odds-style
//              bonus equal to the player's current Pass Line bet.
// Cooldown:    none
//
// Design note: Odds bets are normally only available behind an established Point.
// The Regular sidesteps that restriction by mimicking an Odds payout on the
// come-out win — rewarding the player for a Natural as if they had already
// placed Odds. The bonus is added to `additives`, so it is amplified by Hype
// and crew multipliers just like a real Odds win would be.
//
// Niche vs. other PAYOUT crew:
//   - The Shark fires on POINT_HIT (+$100 flat)
//   - The Regular fires on NATURAL (scales with Pass Line bet size)
// Together they cover both win conditions without overlapping.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const regular: CrewMember = {
  id:               6,
  name:             'The Regular',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         10_000,  // $100.00
  visualId:         'regular',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // Only fires on a Natural (7 or 11 on the come-out).
    if (ctx.rollResult !== 'NATURAL') {
      return { context: ctx, newCooldown: 0 };
    }

    // No pass line bet to mirror — nothing to do.
    if (ctx.bets.passLine === 0) {
      return { context: ctx, newCooldown: 0 };
    }

    // Add the Pass Line bet amount as a flat bonus to additives.
    // This is amplified by Hype and multipliers in settleTurn().
    return {
      context: { ...ctx, additives: ctx.additives + ctx.bets.passLine },
      newCooldown: 0,
    };
  },
};
