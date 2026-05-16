// =============================================================================
// BATTLECRAPS — FIRST_CONTACT_PROTOCOL BOSS RULE HOOKS
// packages/shared/src/bossRules/firstContactProtocol.ts
//
// Floor 8 — The Emissary (The Signal — The Receiving Chamber)
// Mechanic: During this boss fight, come-out rolls of 7 or 11 (normally a
// NATURAL — immediate win, pass line pays, hype ticks +0.10) are converted to
// NO_RESOLUTION blank rolls. No payout. No hype tick. The shooter stays in
// come-out with their original pass line bet still on the table.
//
// Implementation note: The conversion is applied inline in rollHandler()
// (apps/api/src/routes/rolls.ts), BEFORE the base-game hype tick (step 7b),
// so that the +0.10 NATURAL tick is never seeded. This is a deliberate
// pipeline-ordering constraint — placing the conversion after the hype tick
// (like POSEIDONS_FAVOR's position) would incorrectly award momentum for a
// roll the Emissary treated as meaningless.
//
// The naturalBlocked flag (TurnContextFlags) propagates through the cascade
// and into computeNextState, which uses it to return IDLE_TABLE / COME_OUT
// instead of the default POINT_ACTIVE return from the NO_RESOLUTION branch.
//
// No BossRuleHooks interface methods are needed here.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const firstContactProtocolHooks: BossRuleHooks = {};
