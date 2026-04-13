// =============================================================================
// CREW: THE SILVER LINING
// packages/shared/src/crew/silverLining.ts
//
// Category:    HYPE
// Ability:     +0.6 Hype on a CRAPS_OUT (come-out roll of 2, 3, or 12).
// Cooldown:    none
//
// CRAPS_OUT is the only roll result where no other crew normally fires.
// The Silver Lining turns the worst come-out outcome into a Hype bump.
// Frequency: 4/36 ≈ 11% of come-out rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST = 0.6;

export const silverLining: CrewMember = {
  id:               21,
  name:             'The Silver Lining',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         7_500,  // $75.00
  visualId:         'silver_lining',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'CRAPS_OUT') {
      return { context: ctx, newCooldown: 0 };
    }

    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
