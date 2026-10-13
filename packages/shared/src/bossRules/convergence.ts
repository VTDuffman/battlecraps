// =============================================================================
// BATTLECRAPS — CONVERGENCE BOSS RULE HOOKS
// packages/shared/src/bossRules/convergence.ts
//
// Floor 9 — The Architect (The Null Space — The Zero Chamber)
// Mechanic: each seven-out permanently removes ONE crew member via Targeted
// Demolition (rolls.ts). Once every crew member is gone the player rolls
// naked craps.
//
// Counter: bossPointHits (re-purposed for CONVERGENCE) tracks the seven-out
// count for this fight. It is incremented in computeNextState (rolls.ts) on
// SEVEN_OUT (capped at 5) and held on all other result types (including POINT_HIT).
//
// Targeted Demolition (rolls.ts): on each SEVEN_OUT, the most recently
// triggered crew slot (last CascadeEvent.slotIndex) is zeroed persistently
// in the DB. If no crew fired this roll, the highest occupied active slot is
// removed instead.
//
// No cascade-order hook: removed crew are null in crew_slots, so the default
// cascade (slots 0..unlockedSlots-1) already skips them. (The cascade window
// used to shrink as well, which removed two crew per seven-out in practice.)
//
// Load-Bearing (rolls.ts): each seven-out imposes a cumulative 15% penalty on
// crew cash bonuses, applied post-cascade: additives × 0.85^N, rounded down
// to the dollar.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const convergenceHooks: BossRuleHooks = {};
