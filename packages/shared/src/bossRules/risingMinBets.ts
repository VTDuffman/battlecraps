// =============================================================================
// BATTLECRAPS — BOSS RULE: RISING_MIN_BETS (Sarge)
// packages/shared/src/bossRules/risingMinBets.ts
//
// Minimum Pass Line bet rises by incrementPct of the marker target after every
// Point Hit, starting at startPct, capping at capPct. Holds on Seven Out —
// the pressure never drops once Sarge turns it up.
// =============================================================================

import { GAUNTLET } from '../config.js';
import type { BossRuleHooks } from './types.js';

export const risingMinBetsHooks: BossRuleHooks = {
  validateBet(bets, params, state) {
    if (params.rule !== 'RISING_MIN_BETS') return null;

    const target = GAUNTLET[state.markerIndex]?.targetCents;
    if (target == null) return null;

    const { startPct, incrementPct, capPct } = params;
    const rawPct     = startPct + incrementPct * state.bossPointHits;
    const clampedPct = Math.min(rawPct, capPct);
    // Round up to nearest dollar — same formula as getBossMinBet().
    const minBetCents = Math.ceil((target * clampedPct) / 100) * 100;

    if (bets.passLine < minBetCents) {
      const minBetDollars = (minBetCents / 100).toFixed(0);
      return `Sarge demands a minimum Pass Line bet of $${minBetDollars}.`;
    }

    return null;
  },
};
