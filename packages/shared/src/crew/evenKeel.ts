// =============================================================================
// CREW: THE EVEN KEEL
// packages/shared/src/crew/evenKeel.ts
//
// Category:    TABLE
// Ability:     +$80 additive whenever both dice show even faces (2, 4, or 6).
// Cooldown:    none
//
// Trigger: ctx.dice[0] % 2 === 0 && ctx.dice[1] % 2 === 0
// Frequency: 9/36 = 25% of all rolls.
// Complements The Odd Couple: Hype on odd rolls, cash on even ones.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_BOOST = 8_000;  // $80.00

export const evenKeel: CrewMember = {
  id:               23,
  name:             'The Even Keel',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         9_000,  // $90.00
  visualId:         'even_keel',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.dice[0] % 2 !== 0 || ctx.dice[1] % 2 !== 0) {
      return { context: ctx, newCooldown: 0 };
    }

    return {
      context: { ...ctx, additives: ctx.additives + ADDITIVE_BOOST },
      newCooldown: 0,
    };
  },
};
