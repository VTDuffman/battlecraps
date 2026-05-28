// =============================================================================
// BATTLECRAPS — TRIBUTE BOSS RULE HOOKS
// packages/shared/src/bossRules/tribute.ts
//
// The Hierophant (F5) — escrow seizure on seven-out.
// The escrow logic (hold additives, seize on 7-out) runs inline in rolls.ts
// because it requires reading and writing run.pendingAdditiveCents, which is
// a persistence concern outside the pure hook interface.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const tributeHooks: BossRuleHooks = {};
