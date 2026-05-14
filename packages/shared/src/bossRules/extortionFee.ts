// =============================================================================
// BATTLECRAPS — BOSS RULE: EXTORTION_FEE
// packages/shared/src/bossRules/extortionFee.ts
//
// The Foreman's rule: a flat taxPct (20%) is deducted from the profit portion
// of every winning payout. Losing rolls (payout <= stake returned) are untaxed.
// Tax rounds to the nearest dollar to match the project's integer-dollar convention.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const extortionFeeHooks: BossRuleHooks = {
  modifyPayout(payoutCents, baseStakeReturned, params, _state) {
    if (params.rule !== 'EXTORTION_FEE') return payoutCents;
    const profit = payoutCents - baseStakeReturned;
    if (profit <= 0) return payoutCents;
    const tax = Math.round(profit * params.taxPct / 100) * 100;
    return payoutCents - tax;
  },
};
