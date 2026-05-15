// =============================================================================
// CREW: THE DOORMAN
// packages/shared/src/crew/doorman.ts
//
// Category:    TABLE
// Ability:     Dynamic additive (0.5× max-bet) on every come-out roll.
// Cooldown:    none
//
// Trigger: NATURAL || CRAPS_OUT || POINT_SET
// The Doorman is the only crew that fires on POINT_SET come-outs.
// Makes every come-out — good or bad — earn something.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_MULT = 0.5;  // 0.5× the current marker's max bet

export const doorman: CrewMember = {
  id:               24,
  name:             'The Doorman',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'doorman',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    const isComeOut =
      ctx.rollResult === 'NATURAL' ||
      ctx.rollResult === 'CRAPS_OUT' ||
      ctx.rollResult === 'POINT_SET';

    if (!isComeOut) {
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
