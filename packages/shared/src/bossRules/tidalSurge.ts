// =============================================================================
// BATTLECRAPS — TIDAL_SURGE BOSS RULE HOOKS
// packages/shared/src/bossRules/tidalSurge.ts
//
// Floor 6 — The Sovereign (Atlantis — The Throne Room)
// Mechanic: A four-stage per-come-out cycle (LOW → EBB → HIGH → FLOW).
// Each stage advances on every come-out roll. LOW TIDE is the standard table
// minimum; EBB and FLOW hold at 2×; HIGH TIDE demands 3×.
//
// Counter storage: reuses `bossPointHits` (DB: boss_roll_count) as a
// come-out tide position counter wrapping mod stageMultipliers.length.
// =============================================================================

import type { BossRuleHooks } from './types.js';
import { getMinBet } from '../config.js';

export const tidalSurgeHooks: BossRuleHooks = {
  validateBet(bets, params, state) {
    if (params.rule !== 'TIDAL_SURGE') return null;
    const stageIndex  = state.bossPointHits % params.stageMultipliers.length;
    const multiplier  = params.stageMultipliers[stageIndex] ?? 1;
    if (multiplier <= 1) return null; // LOW TIDE — no minimum override

    const stageLabel       = params.stageLabels[stageIndex] ?? 'HIGH TIDE';
    const highTideMinCents = Math.round(getMinBet(state.markerIndex) * multiplier / 500) * 500;
    if (bets.passLine < highTideMinCents) {
      return `${stageLabel} — Pass Line minimum is $${highTideMinCents / 100}. Current bet: $${bets.passLine / 100}.`;
    }
    return null;
  },
};
