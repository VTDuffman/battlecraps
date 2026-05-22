// =============================================================================
// CREW: THE BOOKKEEPER
// packages/shared/src/crew/bookkeeper.ts
//
// Category:    WILDCARD
// Ability:     Dynamic additive (0.50× max-bet) on every 3rd roll of the shooter.
// Cooldown:    none
//
// Trigger: ctx.shooterRollCount % 3 === 0
// shooterRollCount is incremented BEFORE the cascade in resolveRoll(), so
// the cascade always sees the current roll's position (1-based).
// Fires on rolls 3, 6, 9, 12, … of each shooter. Counter resets per shooter.
// Scheduled frequency: 33% (every third roll).
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 0.25;  // 0.25× the current marker's max bet

export const bookkeeper: CrewMember = {
  id:               28,
  name:             'The Bookkeeper',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'bookkeeper',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.shooterRollCount % 3 !== 0) {
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
