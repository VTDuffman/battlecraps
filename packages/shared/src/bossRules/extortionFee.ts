// =============================================================================
// BATTLECRAPS — BOSS RULE: EXTORTION_FEE
// packages/shared/src/bossRules/extortionFee.ts
//
// The Foreman's rule: a flat taxPct (20%) is deducted from the profit portion
// of every winning payout. Losing rolls (payout <= stake returned) are untaxed.
// Tax rounds down (player-unfavorable), as specified in floors.md.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const extortionFeeHooks: BossRuleHooks = {
  modifyPayout(payoutCents, baseStakeReturned, params, _state) {
    if (params.rule !== 'EXTORTION_FEE') return payoutCents;
    const profit = payoutCents - baseStakeReturned;
    if (profit <= 0) return payoutCents;
    const tax = Math.floor(profit * params.taxPct);
    return payoutCents - tax;
  },
};
