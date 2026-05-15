// =============================================================================
// BATTLECRAPS — TIDAL_SURGE BOSS RULE HOOKS
// packages/shared/src/bossRules/tidalSurge.ts
//
// Floor 6 — The Sovereign (Atlantis — The Throne Room)
// Mechanic: A fixed 7-roll cycle (5 normal + 2 surge). During the 2-roll surge
// window the minimum Pass Line bet rises to 15% of the marker target.
//
// Counter storage: reuses `bossPointHits` (DB: boss_roll_count) as a per-roll
// tide position counter wrapping mod (cycleLength + surgeDuration). This field
// normally tracks point hits for RISING_MIN_BETS — these rules are mutually
// exclusive (different floors) so no conflict exists.
// =============================================================================

import type { BossRuleHooks } from './types.js';
import { GAUNTLET } from '../config.js';

export const tidalSurgeHooks: BossRuleHooks = {
  validateBet(bets, params, state) {
    if (params.rule !== 'TIDAL_SURGE') return null;
    if (state.bossPointHits < params.cycleLength) return null; // Normal tide — no minimum

    const markerConfig = GAUNTLET[state.markerIndex];
    if (!markerConfig) return null;

    const surgeMinCents = Math.ceil(markerConfig.targetCents * params.surgePct / 100) * 100;
    if (bets.passLine < surgeMinCents) {
      return `Tide surge active — Pass Line minimum is $${surgeMinCents / 100}. Current bet: $${bets.passLine / 100}.`;
    }
    return null;
  },
};
