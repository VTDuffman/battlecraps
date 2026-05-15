// =============================================================================
// BATTLECRAPS — ORBITAL DECAY BOSS RULE HOOKS
// packages/shared/src/bossRules/orbitalDecay.ts
//
// The Commander's mechanic: every seven-out subtracts decayAmount from the
// hype multiplier, which can fall below 1.0× to a minimum of hypeFloor.
//
// No hooks are needed here — the decay formula is applied inline in
// computeNextState (rolls.ts) in the SEVEN_OUT branch, following the same
// pattern as TIDAL_SURGE's per-roll tide counter. The BossRuleHooks interface
// has no method for "modify hype on seven-out" because ORBITAL_DECAY is the
// only rule that needs it; adding a hook for one rule would be over-engineering.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const orbitalDecayHooks: BossRuleHooks = {};
