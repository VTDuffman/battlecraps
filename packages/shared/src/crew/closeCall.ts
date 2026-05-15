// =============================================================================
// CREW: THE CLOSE CALL
// packages/shared/src/crew/closeCall.ts
//
// Category:    DICE
// Ability:     Dynamic additive (1.25× max-bet) whenever dice show consecutive values.
// Cooldown:    none
//
// Trigger: Math.abs(ctx.dice[0] - ctx.dice[1]) === 1
// Covers: [1,2], [2,3], [3,4], [4,5], [5,6] in either order.
// Frequency: 10/36 ≈ 28% of all rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 1.25;  // 1.25× the current marker's max bet

export const closeCall: CrewMember = {
  id:               18,
  name:             'The Close Call',
  abilityCategory:  'DICE',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'close_call',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (Math.abs(ctx.dice[0] - ctx.dice[1]) !== 1) {
      return { context: ctx, newCooldown: 0 };
    }

    const maxBet = Math.floor(ctx.markerTargetCents * 0.10);
    const additive = Math.round(ADDITIVE_MULT * maxBet / 100) * 100;

    return {
      context: { ...ctx, additives: ctx.additives + additive },
      newCooldown: 0,
    };
  },
};
