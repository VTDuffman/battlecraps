// =============================================================================
// BATTLECRAPS — BOSS RULE: DISABLE_CREW (Mme. Le Prix)
// packages/shared/src/bossRules/disableCrew.ts
//
// Returning [] from modifyCascadeOrder causes resolveCascade() to skip the
// entire crew loop — no abilities fire, no barks emit, no cooldowns tick.
// Crew portraits remain visible on the UI; they are silenced, not removed.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const disableCrewHooks: BossRuleHooks = {
  modifyCascadeOrder(_slotCount, _params) {
    return [];
  },
};
