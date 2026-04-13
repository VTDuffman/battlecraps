// =============================================================================
// CREW: THE WHALE
// packages/shared/src/crew/whale.ts
//
// Category:    PAYOUT
// Ability:     1.2x multiplier on all winning payouts
// Cooldown:    none — applies to every winning roll, automatically.
//
// The Whale is the archetypical high-roller. His 1.2x payout multiplier
// is "always on" — he fires silently on every roll where the player wins
// anything, stacking multiplicatively with Hype and other crew multipliers.
//
// MULTIPLIER SYSTEM REMINDER:
//   ctx.multipliers is an array of floats. settleTurn() computes their product
//   and multiplies it with ctx.hype to form the final payout multiplier:
//
//     FinalMult = ctx.hype × product(ctx.multipliers)
//     FinalDelta = floor((GrossWins + Additives) × FinalMult) + GrossLosses
//
//   The Whale pushes 1.2 onto the array. If another PAYOUT crew (e.g., a
//   hypothetical 1.5x crew) also fires, the array becomes [1.2, 1.5] and
//   the combined multiplier is 1.2 × 1.5 = 1.8x ON TOP OF Hype. This is
//   the "one more roll" loop working as designed.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

/** The Whale's flat payout multiplier, applied to any winning roll. */
const PAYOUT_MULTIPLIER = 1.2;

/**
 * The Whale
 *
 * On any roll where the player has at least one positive payout component,
 * The Whale pushes a 1.2x multiplier onto ctx.multipliers. settleTurn()
 * applies all multipliers multiplicatively after Hype.
 *
 * The Whale does NOT fire on pure-loss rolls (SEVEN_OUT, CRAPS_OUT with only
 * a pass-line bet, etc.). This is by design — multiplying zero wins by 1.2x
 * is still zero, so we skip it cleanly and avoid cluttering the event log
 * with meaningless triggers. The client would otherwise flash The Whale's
 * portrait on a devastating loss, which would feel wrong.
 *
 * UNIT TEST HINTS:
 *   // Should fire and add multiplier on a winning roll:
 *   const ctx = makeCtx({ basePassLinePayout: 1000, hype: 1.5 });
 *   const result = whale.execute(ctx, neverCalledRng);
 *   assert(result.context.multipliers).toEqual([1.2]);
 *   // settleTurn would compute: floor(1000 × 1.5 × 1.2) = floor(1800) = 1800
 *
 *   // Should NOT fire on a pure loss (no event emitted, no portrait flash):
 *   const ctx2 = makeCtx({ basePassLinePayout: -1000, hype: 1.5 });
 *   const result2 = whale.execute(ctx2, neverCalledRng);
 *   assert(result2.context.multipliers).toEqual([]); // unchanged
 *
 *   // Should stack with a previous multiplier in the array:
 *   const ctx3 = makeCtx({ basePassLinePayout: 1000, multipliers: [1.5] });
 *   const result3 = whale.execute(ctx3, neverCalledRng);
 *   assert(result3.context.multipliers).toEqual([1.5, 1.2]);
 *   // Combined: 1.5 × 1.2 = 1.8x
 */
export const whale: CrewMember = {
  id:               9,
  name:             'The Whale',
  abilityCategory:  'PAYOUT',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         30_000,   // $300.00 — premium late-game crew
  visualId:         'whale',
  rarity:           'Legendary',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // ── Activation Guard ────────────────────────────────────────────────────
    // The Whale only fires when there is at least one positive payout component.
    // We check all three base payouts. Note: a crew member earlier in the cascade
    // (e.g., Lefty) may have already flipped SEVEN_OUT → NO_RESOLUTION, which
    // could change a loss roll into a zero-resolution roll. The Whale correctly
    // reads the updated payouts from the modified ctx.
    const hasWin =
      ctx.basePassLinePayout > 0 ||
      ctx.baseOddsPayout     > 0 ||
      ctx.baseHardwaysPayout > 0;

    if (!hasWin) {
      return { context: ctx, newCooldown: 0 };
    }

    // ── Ability Fires ────────────────────────────────────────────────────────
    // Push 1.2x onto the multipliers array. We must spread the existing array
    // to avoid mutating ctx.multipliers (which would break immutability).
    const newContext: TurnContext = {
      ...ctx,
      multipliers: [...ctx.multipliers, PAYOUT_MULTIPLIER],
    };

    // No cooldown — The Whale is always watching, always ready to amplify.
    return { context: newContext, newCooldown: 0 };
  },
};
