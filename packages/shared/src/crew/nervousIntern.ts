// =============================================================================
// CREW: THE NERVOUS INTERN
// packages/shared/src/crew/nervousIntern.ts
//
// Category:    HYPE
// Ability:     +0.2x Hype on a Natural (7 or 11 on Come Out)
// Cooldown:    none — activates every time the condition is met.
//
// The Nervous Intern is a starter HYPE crew member — cheap, reliable, and
// simple. Every time a Natural rolls on the come-out, he excitedly boosts the
// global Hype multiplier by 0.2x. Small gains that compound over time.
//
// Because Hype is a persistent multiplier (it carries forward roll-to-roll
// and resets only on SEVEN_OUT), The Nervous Intern's value grows
// exponentially when paired with frequent Natural rolls.
//
// HYPE SYSTEM REMINDER:
//   ctx.hype is modified DIRECTLY during the cascade. The modified value is
//   used in settleTurn() for THIS roll's payout AND is persisted back to
//   GameState.hype after settlement (so future rolls start with the boosted
//   multiplier). On SEVEN_OUT, the server resets GameState.hype to 1.0.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

/** The Hype additive bonus granted on each qualifying roll. */
const HYPE_BONUS = 0.2;

/**
 * The Nervous Intern
 *
 * On a NATURAL (7 or 11 on the come-out roll), adds +0.2x to the current
 * Hype multiplier. This immediately affects the payout for THIS roll and
 * persists to all future rolls until a seven-out resets Hype.
 *
 * UNIT TEST HINTS:
 *   // Should fire on NATURAL and boost hype:
 *   const ctx = makeCtx({ rollResult: 'NATURAL', hype: 1.0 });
 *   const result = nervousIntern.execute(ctx, neverCalledRng);
 *   assert(result.context.hype === 1.2);
 *   assert(result.newCooldown === 0); // no cooldown consumed
 *
 *   // Should NOT fire on non-Natural:
 *   const ctx2 = makeCtx({ rollResult: 'POINT_HIT', hype: 1.5 });
 *   const result2 = nervousIntern.execute(ctx2, neverCalledRng);
 *   assert(result2.context.hype === 1.5); // unchanged
 *
 *   // Should stack with other Hype crew in the same cascade:
 *   // (hype: 1.0 → Nervous Intern → 1.2 → Drunk Uncle adds 0.3 → 1.5)
 */
export const nervousIntern: CrewMember = {
  id:               10,
  name:             'The Nervous Intern',
  abilityCategory:  'HYPE',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         5_000,    // $50.00 — intentionally cheap starter crew
  visualId:         'nervous_intern',

  // The `_rollDice` parameter is intentionally unused — HYPE crew don't need
  // to generate new dice. The underscore prefix silences the TypeScript
  // "unused parameter" warning while keeping the signature consistent with
  // the CrewMember interface contract.
  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // ── Activation Guard ────────────────────────────────────────────────────
    // Only activates on a Natural (7 or 11 on the come-out).
    // Does NOT activate on a Point Hit, even though a 7 elsewhere is involved —
    // RollResult.NATURAL is strictly the come-out variant.
    if (ctx.rollResult !== 'NATURAL') {
      return { context: ctx, newCooldown: 0 };
    }

    // ── Ability Fires ────────────────────────────────────────────────────────
    // Boost Hype by the fixed amount. Because this modifies ctx.hype directly,
    // the boosted value is immediately available to all subsequent crew members
    // in the cascade (e.g., The Whale at slot 4 will see the higher hype when
    // computing the final multiplier stack).
    const newContext: TurnContext = {
      ...ctx,
      hype: ctx.hype + HYPE_BONUS,
    };

    // No cooldown — The Nervous Intern fires on every Natural, every time.
    return { context: newContext, newCooldown: 0 };
  },
};
