// =============================================================================
// BATTLECRAPS — BOSS RULE: FOURS_INSTANT_LOSS (The Executive)
// packages/shared/src/bossRules/foursInstantLoss.ts
//
// When the dice total equals triggerTotal (4), sets ctx.flags.instantLoss.
// The server checks this flag after cascade completes and routes directly to
// GAME_OVER regardless of bankroll or remaining shooters.
//
// Affected combinations for triggerTotal=4: [1,3] [3,1] [2,2] — 3/36 = 8.3%.
// Triggers on both come-out and point-active phases — no exceptions.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const foursInstantLossHooks: BossRuleHooks = {
  modifyOutcome(ctx, params, _state) {
    if (params.rule !== 'FOURS_INSTANT_LOSS') return ctx;
    if (ctx.diceTotal !== params.triggerTotal) return ctx;

    return {
      ...ctx,
      flags: { ...ctx.flags, instantLoss: true },
    };
  },
};
