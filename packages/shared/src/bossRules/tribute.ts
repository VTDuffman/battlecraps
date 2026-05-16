// =============================================================================
// BATTLECRAPS — TRIBUTE BOSS RULE HOOKS
// packages/shared/src/bossRules/tribute.ts
//
// The Hierophant (Floor 5 boss): seizes a percentage of the player's bankroll
// on every seven-out, on top of the lost bets. THE_COVENANT comp halves the drain.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const tributeHooks: BossRuleHooks = {
  modifySevenOut(bankrollAfterLoss, params, state) {
    if (params.rule !== 'TRIBUTE') return bankrollAfterLoss;
    const effectivePct = state.covenantActive ? params.tributePct * 0.5 : params.tributePct;
    const tribute = Math.floor(bankrollAfterLoss * effectivePct / 100) * 100;
    return bankrollAfterLoss - tribute;
  },
};
