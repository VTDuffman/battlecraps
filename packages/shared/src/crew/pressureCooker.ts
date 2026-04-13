// =============================================================================
// CREW: THE PRESSURE COOKER
// packages/shared/src/crew/pressureCooker.ts
//
// Category:    WILDCARD
// Ability:     +0.5 Hype AND +$100 additive after 5 consecutive blank
//              point-phase rolls.
// Cooldown:    none
//
// Trigger: ctx.rollResult === 'NO_RESOLUTION' && ctx.pointPhaseBlankStreak === 4
//
// ctx.pointPhaseBlankStreak is the persisted count BEFORE this roll.
// A value of 4 means four prior consecutive NO_RESOLUTION rolls — this roll
// is the fifth, which triggers the release.
//
// computeNextState() resets pointPhaseBlankStreak to 0 after the crew fires
// (detects streak >= 4 after a NO_RESOLUTION). On any other roll result the
// streak also resets to 0.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST    = 0.5;
const ADDITIVE_BOOST = 10_000;  // $100.00

export const pressureCooker: CrewMember = {
  id:               29,
  name:             'The Pressure Cooker',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         12_000,  // $120.00
  visualId:         'pressure_cooker',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'NO_RESOLUTION' || ctx.pointPhaseBlankStreak !== 4) {
      return { context: ctx, newCooldown: 0 };
    }

    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype, additives: ctx.additives + ADDITIVE_BOOST },
      newCooldown: 0,
    };
  },
};
