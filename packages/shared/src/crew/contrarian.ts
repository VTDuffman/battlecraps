// =============================================================================
// CREW: THE CONTRARIAN
// packages/shared/src/crew/contrarian.ts
//
// Category:    WILDCARD
// Ability:     Dynamic additive (0.45× max-bet) whenever this roll total < last.
// Cooldown:    none
//
// Trigger: ctx.previousRollTotal !== null && ctx.diceTotal < ctx.previousRollTotal
// Does not fire on the shooter's first roll (previousRollTotal === null).
// Frequency: ~40% of rolls after the first of a shooter.
//
// Together with The Momentum (fires on ascent) and The Echo (fires on repeat),
// the trio covers nearly every roll of a shooter with distinct rewards.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 0.25;  // 0.25× the current marker's max bet

export const contrarian: CrewMember = {
  id:               30,
  name:             'The Contrarian',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'contrarian',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.previousRollTotal === null || ctx.diceTotal >= ctx.previousRollTotal) {
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
