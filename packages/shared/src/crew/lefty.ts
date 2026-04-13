// =============================================================================
// CREW: "LEFTY" McGUFFIN
// packages/shared/src/crew/lefty.ts
//
// Category:    DICE
// Ability:     Re-roll a Seven Out (1x per Shooter)
// Cooldown:    per_shooter — once used, spent until the next shooter begins.
//
// Lefty is the player's safety net. When a SEVEN_OUT occurs, Lefty intercepts
// and physically substitutes new dice, then re-evaluates the outcome. If the
// new roll escapes the 7, the shooter lives. If not... well, Lefty tried.
//
// The "sevenOutBlocked" flag is set in either case to let the client know that
// an intervention occurred (used to trigger a specific animation sequence).
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';
import { calculateBasePayouts, classifyDiceOutcome } from '../crapsEngine.js';

/**
 * "Lefty" McGuffin
 *
 * On a SEVEN_OUT, Lefty rolls new dice and re-evaluates the craps outcome.
 * The re-roll can produce any result — the cascade then continues with the
 * updated TurnContext. If the re-roll is ALSO a 7, the seven-out stands.
 *
 * COOLDOWN SEMANTICS (per_shooter):
 *   - newCooldown returns 1 when the ability fires.
 *   - The cascade does NOT auto-decrement per_shooter cooldowns.
 *   - The server MUST reset this to 0 when a new shooter begins
 *     (after a SEVEN_OUT is settled and GameState.shooters is decremented).
 *
 * UNIT TEST HINTS:
 *   // Should fire and change outcome:
 *   const ctx = makeCtx({ rollResult: 'SEVEN_OUT', cooldownState: 0 });
 *   const result = lefty.execute(ctx, () => [4, 4]); // re-roll hits Hard 8
 *   assert(result.context.rollResult === 'POINT_HIT');
 *   assert(result.context.flags.sevenOutBlocked === true);
 *   assert(result.newCooldown === 1);
 *
 *   // Should NOT fire on cooldown:
 *   const result = leftyOnCooldown.execute(ctx, () => [4, 4]);
 *   assert(result.context === ctx); // context unchanged
 *
 *   // Should NOT fire on non-seven-out:
 *   const ctx2 = makeCtx({ rollResult: 'NO_RESOLUTION' });
 *   const result2 = lefty.execute(ctx2, () => [4, 4]);
 *   assert(result2.context === ctx2); // context unchanged
 */
export const lefty: CrewMember = {
  id:               1,
  name:             '"Lefty" McGuffin',
  abilityCategory:  'DICE',
  cooldownType:     'per_shooter',
  cooldownState:    0,
  baseCost:         15_000,   // $150.00
  visualId:         'lefty',
  rarity:           'Epic',

  execute(ctx: TurnContext, rollDice: RollDiceFn): ExecuteResult {
    // ── Activation Guard ────────────────────────────────────────────────────
    // Lefty only cares about seven-outs. All other results pass through silently.
    if (ctx.rollResult !== 'SEVEN_OUT') {
      return { context: ctx, newCooldown: 0 };
    }

    // Guard: the cascade checks cooldownState before calling execute(), but
    // this internal check protects direct unit-test calls from bypassing that.
    if (this.cooldownState > 0) {
      return { context: ctx, newCooldown: this.cooldownState };
    }

    // ── Ability Fires ────────────────────────────────────────────────────────
    // Generate a fresh pair of dice to replace the seven.
    const newDice = rollDice();
    const newTotal = newDice[0] + newDice[1];
    const newIsHardway =
      newDice[0] === newDice[1] && [4, 6, 8, 10].includes(newTotal);

    // Re-classify the outcome using the same active point.
    // Lefty's re-roll is always in POINT_ACTIVE phase (you can't seven-out
    // during come-out — that's just CRAPS_OUT, which Lefty doesn't affect).
    const newRollResult = classifyDiceOutcome(
      newDice,
      'POINT_ACTIVE',
      ctx.activePoint,
    );

    // Recalculate all three base payouts for the new dice and result.
    // ctx.bets is the frozen reference to the original bet amounts — no change there.
    const newPayouts = calculateBasePayouts(
      newDice,
      newRollResult,
      ctx.activePoint,
      ctx.bets,
    );

    // Produce the updated context. We spread ctx to preserve all cascade
    // modifiers accumulated by crew who fired BEFORE Lefty in the slot order
    // (additives, multipliers, hype boosts) — those carry forward unchanged.
    const newContext: TurnContext = {
      ...ctx,
      dice:                newDice,
      diceTotal:           newTotal,
      isHardway:           newIsHardway,
      rollResult:          newRollResult,
      basePassLinePayout:  newPayouts.passLine,
      baseOddsPayout:      newPayouts.odds,
      baseHardwaysPayout:  newPayouts.hardways,
      baseStakeReturned:   newPayouts.stakeReturned,
      resolvedBets:        newPayouts.resolvedBets,
      flags: {
        ...ctx.flags,
        // Signal the client that a Lefty intervention occurred.
        // The animation layer uses this to show Lefty's "Gotcha!" bark
        // regardless of whether the re-roll succeeded.
        sevenOutBlocked: true,
      },
    };

    // Ability consumed. Cooldown = 1 locks Lefty for the rest of this shooter.
    // The cascade will NOT decrement this (per_shooter type).
    // The server resets it to 0 when GameState.shooters decrements.
    return { context: newContext, newCooldown: 1 };
  },
};
