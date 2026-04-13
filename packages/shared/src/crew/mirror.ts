// =============================================================================
// CREW: THE MIRROR
// packages/shared/src/crew/mirror.ts
//
// Category:    PAYOUT
// Ability:     +0.2 Hype on any roll totalling 7, regardless of phase.
// Cooldown:    none
//
// Fires on both NATURAL (come-out 7) and SEVEN_OUT (point-phase 7).
// Seven Outs still lose, but the shooter carries Hype into the next turn.
// Frequency: 6/36 ≈ 17% of all rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST = 0.2;

export const mirror: CrewMember = {
  id:               27,
  name:             'The Mirror',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         8_500,  // $85.00
  visualId:         'mirror',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.diceTotal !== 7) {
      return { context: ctx, newCooldown: 0 };
    }

    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
