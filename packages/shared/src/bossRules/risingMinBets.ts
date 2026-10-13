// =============================================================================
// BATTLECRAPS — BOSS RULE: RISING_MIN_BETS (Sarge)
//
// Minimum Pass Line bet rises by incrementPct of the marker target after every
// Point Hit, starting at startPct, capping at capPct. Holds on Seven Out —
// the pressure never drops once Sarge turns it up.
//
// Non-compliance fine (FB-026): if the come-out Pass Line is below the rising
// minimum, the roll is allowed but a flat fine (nonComplianceFinePct × marker
// target) is deducted from the bankroll after settlement. rolls.ts only calls
// validateBet on the come-out, so each under-minimum bet is fined once.
// =============================================================================

import { GAUNTLET } from '../config.js';
import type { BossRuleHooks } from './types.js';

export const risingMinBetsHooks: BossRuleHooks = {
  validateBet(bets, params, state) {
    if (params.rule !== 'RISING_MIN_BETS') return null;

    const { targetCents } = GAUNTLET[state.markerIndex]!;
    const rawPct     = params.startPct + params.incrementPct * state.bossPointHits;
    const clampedPct = Math.min(rawPct, params.capPct);
    // Round up to nearest dollar — same formula as getBossMinBet().
    const bossMin = Math.ceil(targetCents * clampedPct / 100) * 100;

    // Fine = nonComplianceFinePct × marker target, rounded to nearest dollar.
    const fine = Math.round(targetCents * params.nonComplianceFinePct / 100) * 100;

    if (bets.passLine < bossMin) {
      return {
        fine,
        message: `Below Sarge's minimum of $${bossMin / 100}. A $${fine / 100} non-compliance fine was applied.`,
      };
    }

    return null;
  },
};
