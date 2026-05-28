// =============================================================================
// BATTLECRAPS — BOSS RULE: FOURS_INSTANT_LOSS (The Executive)
// packages/shared/src/bossRules/foursInstantLoss.ts
//
// When the dice total equals triggerTotal (4), sets ctx.flags.executiveStrike
// and converts the roll to NO_RESOLUTION. The server then applies a tiered
// bankroll drain: −20% on the first 4, −40% on the second, GAME_OVER on the
// third (handled as an early-exit before the cascade in rolls.ts).
//
// Affected combinations for triggerTotal=4: [1,3] [3,1] [2,2] — 3/36 = 8.3%.
// Triggers on both come-out and point-active phases — no exceptions.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const foursInstantLossHooks: BossRuleHooks = {
  modifyOutcome(ctx, params, _state) {
    if (params.rule !== 'FOURS_INSTANT_LOSS') return ctx;
    if (ctx.diceTotal !== params.triggerTotal) return ctx;
    // Convert to NO_RESOLUTION so bets stay, cascade fires, but no point is set/hit.
    // executiveStrike flag triggers the strike handler in rolls.ts.
    return {
      ...ctx,
      rollResult: 'NO_RESOLUTION' as const,
      flags: { ...ctx.flags, executiveStrike: true },
    };
  },
};
