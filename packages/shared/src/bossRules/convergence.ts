// =============================================================================
// BATTLECRAPS — CONVERGENCE BOSS RULE HOOKS
// packages/shared/src/bossRules/convergence.ts
//
// Floor 9 — The Architect (The Null Space — The Zero Chamber)
// Mechanic: Each seven-out permanently removes one crew slot via Targeted
// Demolition (rolls.ts), then shrinks the cascade window by one. After 5
// seven-outs, all crew are suppressed and the player rolls naked craps.
//
// Counter: bossPointHits (re-purposed for CONVERGENCE) tracks the seven-out
// count for this fight. It is incremented in computeNextState (rolls.ts) on
// SEVEN_OUT and held on all other result types (including POINT_HIT).
//
// Targeted Demolition (rolls.ts): on each SEVEN_OUT, the most recently
// triggered crew slot (last CascadeEvent.slotIndex) is zeroed persistently
// in the DB. If no crew fired this roll, the fallback is the highest-numbered
// active slot: max(0, unlockedSlots - 1 - bossPointHits).
//
// Hook: modifyCascadeOrder returns indices [0 .. (4 - bossPointHits)], which
// progressively shrinks the cascade window after each seven-out. At
// bossPointHits = 5, returns [] — full cascade suppression (naked craps).
// Null slots within the active window are skipped naturally by resolveCascade.
//
// Load-Bearing (rolls.ts): each removed slot imposes a cumulative 15%
// additive penalty applied post-cascade. With N slots removed:
// additives × 0.85^N, rounded to the nearest dollar (100 cents).
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const convergenceHooks: BossRuleHooks = {
  modifyCascadeOrder(_slotCount, _params, state) {
    const sevenOutCount = state?.bossPointHits ?? 0;
    const activeSlots   = Math.max(0, 5 - sevenOutCount);
    return Array.from({ length: activeSlots }, (_, i) => i);
  },
};
