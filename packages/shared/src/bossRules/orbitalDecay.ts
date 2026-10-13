// =============================================================================
// BATTLECRAPS — ORBITAL DECAY BOSS RULE HOOKS
// packages/shared/src/bossRules/orbitalDecay.ts
//
// The Commander's mechanic: every seven-out subtracts a tiered amount from the
// hype multiplier — baseDecay below 1.5×, heatingUpDecay at 1.5×+, onFireDecay
// at 2.5×+ — and it can fall below 1.0× to a minimum of hypeFloor (0.25×).
// Death spiral (rolls.ts): below 0.75× one cascade slot is lost; below 0.5×
// the max bet is halved. Sea Legs does not apply during this fight.
//
// No hooks are needed here — the decay formula is applied inline in
// computeNextState (rolls.ts) in the SEVEN_OUT branch, following the same
// pattern as TIDAL_SURGE's tide counter. The BossRuleHooks interface
// has no method for "modify hype on seven-out" because ORBITAL_DECAY is the
// only rule that needs it; adding a hook for one rule would be over-engineering.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const orbitalDecayHooks: BossRuleHooks = {};
