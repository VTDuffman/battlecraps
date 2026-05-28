// =============================================================================
// BATTLECRAPS — TRANSMISSION_DELAY BOSS RULE HOOKS (The Emissary, F8)
//
// Crew additive escrow with 7-out evaporation. Runs inline in rolls.ts using
// pendingAdditiveCents (same column as Hierophant). No hook interface methods needed.
// FIRST_CONTACT_PROTOCOL logic (naturalBlocked) has been retired.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const firstContactProtocolHooks: BossRuleHooks = {};
