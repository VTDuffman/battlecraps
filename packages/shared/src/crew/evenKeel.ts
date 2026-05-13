// =============================================================================
// CREW: THE EVEN KEEL
// packages/shared/src/crew/evenKeel.ts
//
// Category:    TABLE
// Ability:     Dynamic additive (1.0× max-bet) whenever both dice show even faces.
// Cooldown:    none
//
// Trigger: ctx.dice[0] % 2 === 0 && ctx.dice[1] % 2 === 0
// Frequency: 9/36 = 25% of all rolls.
// Complements The Odd Couple: Hype on odd rolls, cash on even ones.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 1.0;  // 1.0× the current marker's max bet

export const evenKeel: CrewMember = {
  id:               23,
  name:             'The Even Keel',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'even_keel',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.dice[0] % 2 !== 0 || ctx.dice[1] % 2 !== 0) {
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
