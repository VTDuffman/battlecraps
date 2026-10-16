// =============================================================================
// CREW: THE HANDICAPPER
// packages/shared/src/crew/handicapper.ts
//
// Category:    HYPE
// Ability:     Adds Hype on POINT_SET — scaled to the difficulty of the point.
//              Points 4 or 10  → +0.45 Hype
//              Points 5 or 9   → +0.3 Hype
//              Points 6 or 8   → +0.15 Hype
// Cooldown:    none
//
// On POINT_SET the run is still in COME_OUT, so resolveRoll() leaves
// ctx.activePoint null — the new point is the dice total. (Reading activePoint
// here meant the Handicapper never fired in real play.)
// Frequency: 24/36 ≈ 67% of come-out rolls.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const handicapper: CrewMember = {
  id:               26,
  name:             'The Handicapper',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  visualId:         'handicapper',
  rarity:           'Starter',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    if (ctx.rollResult !== 'POINT_SET') {
      return { context: ctx, newCooldown: 0 };
    }

    // The point being set is this roll's total (4, 5, 6, 8, 9 or 10).
    const point = ctx.diceTotal;

    let hypeDelta: number;
    if (point === 4 || point === 10) {
      hypeDelta = 0.45;  // FB-041 ×1.5 (was 0.3)
    } else if (point === 5 || point === 9) {
      hypeDelta = 0.3;   // FB-041 ×1.5 (was 0.2)
    } else {
      // Points 6 or 8
      hypeDelta = 0.15;  // FB-041 ×1.5 (was 0.1)
    }

    const newHype = Math.round((ctx.hype + hypeDelta) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
