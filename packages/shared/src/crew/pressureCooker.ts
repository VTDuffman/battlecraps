// =============================================================================
// CREW: THE PRESSURE COOKER
// packages/shared/src/crew/pressureCooker.ts
//
// Category:    WILDCARD
// Ability:     +0.5 Hype AND dynamic additive (0.75× max-bet) after 5 consecutive
//              blank point-phase rolls.
// Cooldown:    none
//
// Trigger: ctx.rollResult === 'NO_RESOLUTION' && ctx.pointPhaseBlankStreak === 4
//
// ctx.pointPhaseBlankStreak is the persisted count BEFORE this roll.
// A value of 4 means four prior consecutive NO_RESOLUTION rolls — this roll
// is the fifth, which triggers the release.
//
// computeNextState() (rolls.ts) resets pointPhaseBlankStreak to 0 on the roll
// the crew fires (streak >= 4 on a NO_RESOLUTION), so it fires again on the
// 10th, 15th… blank. Any other roll result also resets the streak to 0.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const HYPE_BOOST    = 0.5;
const ADDITIVE_MULT = 0.75;  // 0.75× the current marker's max bet

export const pressureCooker: CrewMember = {
  id:               29,
  name:             'The Pressure Cooker',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'pressure_cooker',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'NO_RESOLUTION' || ctx.pointPhaseBlankStreak !== 4) {
      return { context: ctx, newCooldown: 0 };
    }

    const newHype = Math.round((ctx.hype + HYPE_BOOST) * 10_000) / 10_000;
    const maxBet = ctx.crewCashBaseCents;  // FB-041: table max × the floor's crew-cash scale
    const additive = Math.round(ADDITIVE_MULT * maxBet / 100) * 100;

    return {
      context: { ...ctx, hype: newHype, additives: ctx.additives + additive },
      newCooldown: 0,
    };
  },
};
