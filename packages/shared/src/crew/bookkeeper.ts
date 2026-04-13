// =============================================================================
// CREW: THE BOOKKEEPER
// packages/shared/src/crew/bookkeeper.ts
//
// Category:    WILDCARD
// Ability:     +$60 additive on every 3rd roll of the current shooter.
// Cooldown:    none
//
// Trigger: ctx.shooterRollCount % 3 === 0
// shooterRollCount is incremented BEFORE the cascade in resolveRoll(), so
// the cascade always sees the current roll's position (1-based).
// Fires on rolls 3, 6, 9, 12, … of each shooter. Counter resets per shooter.
// Scheduled frequency: 33% (every third roll).
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_BOOST = 6_000;  // $60.00

export const bookkeeper: CrewMember = {
  id:               28,
  name:             'The Bookkeeper',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         10_000,  // $100.00
  visualId:         'bookkeeper',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.shooterRollCount % 3 !== 0) {
      return { context: ctx, newCooldown: 0 };
    }

    return {
      context: { ...ctx, additives: ctx.additives + ADDITIVE_BOOST },
      newCooldown: 0,
    };
  },
};
