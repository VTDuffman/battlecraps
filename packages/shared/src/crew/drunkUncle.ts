// =============================================================================
// CREW: THE DRUNK UNCLE
// packages/shared/src/crew/drunkUncle.ts
//
// Category:    HYPE
// Ability:     Random +0.1 to +0.5 Hype added on every activation.
// Cooldown:    per_roll (2-roll cooldown — fires every 3rd roll)
//
// The Drunk Uncle fires unconditionally when off cooldown — wins, losses,
// no-resolutions, all of it. He's chaotic and unreliable. When he fires,
// he calls into rollDice() to generate a "bonus roll" that maps to a Hype bonus:
//
//   Bonus = 0.1 + ((d1 + d2 - 2) / 10) × 0.4
//     [1,1] → 0.10  (unlucky uncle)
//     [3,3] → 0.26  (average uncle)
//     [6,6] → 0.50  (legendary uncle)
//
// SERVER IMPLEMENTATION NOTE:
//   The Drunk Uncle causes the server to call its RNG one extra time per
//   roll (beyond the main game dice). This extra call must be logged in
//   the RNG audit trail alongside the main dice for full reproducibility.
//
// On a SEVEN_OUT, his hype boost is immediately wiped by the server's
// post-roll hype reset (GameState.hype → 1.0) — but that's very on-brand.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const drunkUncle: CrewMember = {
  id:               12,
  name:             'The Drunk Uncle',
  abilityCategory:  'HYPE',
  cooldownType:     'per_roll',
  cooldownState:    0,
  baseCost:         6_000,  // $60.00 — cheap, unreliable, loveable
  visualId:         'drunk_uncle',

  execute(ctx: TurnContext, rollDice: RollDiceFn): ExecuteResult {
    // Roll the bonus dice (server-side RNG, separate from main game dice).
    const [d1, d2] = rollDice();

    // Map the 2d6 total (range 2–12) to a Hype bonus in [0.1, 0.5].
    // Formula: 0.1 + ((total - 2) / 10) × 0.4
    const rawBonus = 0.1 + ((d1 + d2 - 2) / 10) * 0.4;

    // Round to 2 decimal places to keep the hype value clean and prevent
    // floating-point accumulation across many rolls.
    const bonus = Math.round(rawBonus * 100) / 100;

    // Round the resulting hype to 4 decimal places (consistent with other HYPE crew).
    const newHype = Math.round((ctx.hype + bonus) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 2,  // 2-roll cooldown — fires every 3rd roll
    };
  },
};
