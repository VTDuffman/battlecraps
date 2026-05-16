// =============================================================================
// BATTLECRAPS — CONVERGENCE BOSS RULE HOOKS
// packages/shared/src/bossRules/convergence.ts
//
// Floor 9 — The Architect (The Null Space — The Zero Chamber)
// Mechanic: Each seven-out removes one crew slot from the cascade, starting
// with slot 4 (rightmost). After 5 seven-outs, all crew are suppressed and
// the player rolls naked craps.
//
// Counter: bossPointHits (re-purposed for CONVERGENCE) tracks the seven-out
// count for this fight. It is incremented in computeNextState (rolls.ts) on
// SEVEN_OUT and held on all other result types (including POINT_HIT).
//
// Hook: modifyCascadeOrder returns indices [0 .. (4 - bossPointHits)], which
// progressively drops the rightmost slot after each seven-out. At
// bossPointHits = 5, returns [] — full cascade suppression (naked craps).
//
// The removal is ephemeral: crew slot entries on the runs DB record are
// untouched. Only the cascade iteration order is shortened each roll.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const convergenceHooks: BossRuleHooks = {
  modifyCascadeOrder(_slotCount, _params, state) {
    const sevenOutCount = state?.bossPointHits ?? 0;
    const activeSlots   = Math.max(0, 5 - sevenOutCount);
    return Array.from({ length: activeSlots }, (_, i) => i);
  },
};
