// =============================================================================
// CREW: THE DOORMAN
// packages/shared/src/crew/doorman.ts
//
// Category:    TABLE
// Ability:     +$40 additive on every come-out roll regardless of outcome.
// Cooldown:    none
//
// Trigger: NATURAL || CRAPS_OUT || POINT_SET
// The Doorman is the only crew that fires on POINT_SET come-outs.
// Makes every come-out — good or bad — earn something.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

const ADDITIVE_BOOST = 4_000;  // $40.00

export const doorman: CrewMember = {
  id:               24,
  name:             'The Doorman',
  abilityCategory:  'TABLE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         8_000,  // $80.00
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

    return {
      context: { ...ctx, additives: ctx.additives + ADDITIVE_BOOST },
      newCooldown: 0,
    };
  },
};
