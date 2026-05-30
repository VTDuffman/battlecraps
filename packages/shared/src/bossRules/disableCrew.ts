// =============================================================================
// BATTLECRAPS — BOSS RULE: DISABLE_CREW — "The Enchantment" (Mme. Le Prix, F3)
//
// Before each come-out roll, one randomly selected crew member is enchanted
// by Mme. Le Prix and excluded from the cascade. The charmed slot persists
// through the point phase until resolution (POINT_HIT or SEVEN_OUT), then a
// new slot is selected for the next come-out.
//
// The charmed slot index is stored in bossPointHits (0-based).
// Random selection happens in rolls.ts using the server RNG after each
// come-out resolution, then stored as nextState.bossPointHits.
//
// Previously: modifyAdditives taxing 35% of additives (FB-026 Step 2).
// Previously before that: returning [] — full cascade suppress.
// Now: modifyCascadeOrder excluding one charmed slot per come-out.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const disableCrewHooks: BossRuleHooks = {
  modifyCascadeOrder(slotCount, _params, state) {
    const charmedSlot = state?.bossPointHits ?? 0;
    return Array.from({ length: slotCount }, (_, i) => i)
      .filter(i => i !== charmedSlot);
  },
};
