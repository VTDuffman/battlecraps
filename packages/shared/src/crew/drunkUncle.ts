// =============================================================================
// CREW: THE DRUNK UNCLE
// packages/shared/src/crew/drunkUncle.ts
//
// Category:    HYPE
// Ability:     33% chance each roll to fire. When he fires, it's either
//              +0.5 Hype (good uncle) or −0.1 Hype (bad uncle). No cooldown.
//
// Activation uses d1 of a bonus dice roll:
//   d1 = 1 or 2  → fires (≈33%)
//   d1 = 3–6     → nothing happens
//
// Direction uses d2 of the same roll:
//   d2 odd  (1, 3, 5) → +0.5 Hype
//   d2 even (2, 4, 6) → −0.1 Hype
//
// SERVER IMPLEMENTATION NOTE:
//   The Drunk Uncle causes the server to call its RNG one extra time per
//   roll (beyond the main game dice). This extra call must be logged in
//   the RNG audit trail alongside the main dice for full reproducibility.
//
// On a SEVEN_OUT, any hype boost is wiped by the server's post-roll hype
// reset (GameState.hype → 1.0) — but that's very on-brand.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const drunkUncle: CrewMember = {
  id:               12,
  name:             'The Drunk Uncle',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         6_000,  // $60.00 — cheap, unreliable, loveable
  visualId:         'drunk_uncle',

  execute(ctx: TurnContext, rollDice: RollDiceFn): ExecuteResult {
    // Roll the bonus dice (server-side RNG, separate from main game dice).
    const [d1, d2] = rollDice();

    // 33% activation: d1 of 1 or 2 fires, 3–6 does nothing.
    if (d1 > 2) {
      return { context: ctx, newCooldown: 0 };
    }

    // Direction: d2 odd → +0.5 Hype, d2 even → −0.1 Hype.
    const delta = (d2 % 2 === 1) ? 0.5 : -0.1;

    // Round to 4 decimal places (consistent with other HYPE crew).
    const newHype = Math.round((ctx.hype + delta) * 10_000) / 10_000;

    return {
      context: { ...ctx, hype: newHype },
      newCooldown: 0,
    };
  },
};
