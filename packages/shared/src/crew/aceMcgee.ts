// =============================================================================
// CREW: "ACE" McGEE
// packages/shared/src/crew/aceMcgee.ts
//
// Category:    DICE
// Ability:     Dynamic additive (0.75× max-bet) whenever a 1 appears on either die.
// Cooldown:    none
//
// Trigger: ctx.dice[0] === 1 || ctx.dice[1] === 1
// Frequency: 11/36 ≈ 31% of all rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 0.75;  // 0.75× the current marker's max bet

export const aceMcgee: CrewMember = {
  id:               17,
  name:             '"Ace" McGee',
  abilityCategory:  'DICE',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'ace_mcgee',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.dice[0] !== 1 && ctx.dice[1] !== 1) {
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
