// =============================================================================
// CREW: THE HANDICAPPER
// packages/shared/src/crew/handicapper.ts
//
// Category:    PAYOUT
// Ability:     Adds Hype on POINT_SET — scaled to the difficulty of the point.
//              Points 4 or 10  → +0.3 Hype
//              Points 5 or 9   → +0.2 Hype
//              Points 6 or 8   → +0.1 Hype
// Cooldown:    none
//
// ctx.activePoint is set by resolveRoll() before the cascade fires on POINT_SET,
// so it always reflects the newly established point.
// Frequency: 24/36 ≈ 67% of come-out rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const handicapper: CrewMember = {
  id:               26,
  name:             'The Handicapper',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         10_000,  // $100.00
  visualId:         'handicapper',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'POINT_SET' || ctx.activePoint === null) {
      return { context: ctx, newCooldown: 0 };
    }

    let hypeDelta: number;
    if (ctx.activePoint === 4 || ctx.activePoint === 10) {
      hypeDelta = 0.3;
    } else if (ctx.activePoint === 5 || ctx.activePoint === 9) {
      hypeDelta = 0.2;
    } else {
      // Points 6 or 8
      hypeDelta = 0.1;
    }

    const newHype = Math.round((ctx.hype + hypeDelta) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
