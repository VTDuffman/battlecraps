// =============================================================================
// BATTLECRAPS — UNLOCK EVALUATION
// apps/api/src/lib/unlocks.ts
//
// evaluateUnlocks() — called fire-and-forget after every roll to check
// whether the player has met any crew unlock conditions.
//
// Handles all 15 unlock conditions for original crew (IDs 1–15):
//   Cross-run cumulative  IDs 5, 8  (seven-out / point-hit lifetime totals)
//   Per-run counters      IDs 2, 4, 6  (tracked in perRunUnlockCounters JSONB)
//   Per-segment counter   ID 1  (Lefty: ≥3 seven-outs within one segment + clear it — resets at each TRANSITION)
//   One-time event flags  IDs 7, 10, 12  (stored as 0/1 in unlockProgress)
//   Per-cascade event     ID 13 (Mimic)  (≥4 distinct crew fire in one cascade)
//   Existing counter      IDs 3, 11  (consecutivePointHits)
//   Per-segment event     ID 15  (Lucky Charm: solo crew + clear marker)
//   Run achievements      IDs 9, 14  (bankroll peak / game cleared)
// =============================================================================

import { eq, sql } from 'drizzle-orm';

/** Embeds an integer array directly in SQL as ARRAY[...] — avoids postgres.js serialisation issues with number[] parameters. */
const pgIntArray = (ids: number[]) => sql.raw(`ARRAY[${ids.join(',')}]::integer[]`);

import {
  MIMIC_ID,
  MARKER_TARGETS,
  type TurnContext,
  type CascadeEvent,
} from '@battlecraps/shared';

import { db } from '../db/client.js';
import { runs, users, type UserRow, type RunRow, type StoredCrewSlots } from '../db/schema.js';
import { getIO } from './io.js';
import { getCrewById } from './crewRegistry.js';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The subset of computeNextState()'s return shape needed for unlock evaluation.
 * Passed in from the roll handler so this function remains unit-testable in isolation.
 */
export interface NextStateSnapshot {
  status:               string;
  currentMarkerIndex:   number;
  consecutivePointHits: number;
  bankrollCents:        number;
}

/**
 * Evaluates all crew unlock conditions after a roll and persists any newly
 * earned unlocks to the database.
 *
 * Call as fire-and-forget from the roll handler:
 *   void evaluateUnlocks(...).catch(err => log.error({ err }, '[unlocks] ...'));
 *
 * @param userId        Internal UUID of the player.
 * @param user          Full UserRow snapshot from BEFORE this roll (has current
 *                      unlockedCrewIds and unlockProgress).
 * @param finalCtx      The final TurnContext after cascade + boss hooks.
 * @param nextState     Snapshot of the next run state (from computeNextState()).
 * @param persistedRun  The RunRow as persisted AFTER this roll (perRunUnlockCounters
 *                      has NOT yet been updated by this call — that update happens here).
 * @param cascadeEvents All CascadeEvents emitted during this roll's cascade.
 * @param runId         The run's UUID (for WebSocket emission).
 */
export async function evaluateUnlocks(
  userId:        string,
  user:          UserRow,
  finalCtx:      TurnContext,
  nextState:     NextStateSnapshot,
  persistedRun:  RunRow,
  cascadeEvents: CascadeEvent[],
  runId:         string,
): Promise<void> {
  const { rollResult, dice, diceTotal, flags, baseHardwaysPayout, hype } = finalCtx;
  const existingCounters = persistedRun.perRunUnlockCounters;
  const unlockProgress   = user.unlockProgress;

  // Track which crew are already unlocked; use a Set for O(1) membership checks.
  // We mutate this locally as we discover new unlocks to prevent double-counting
  // when multiple conditions could award the same crew in one roll.
  const unlockedSet = new Set(user.unlockedCrewIds);

  // ── 1. Compute updated perRunUnlockCounters ─────────────────────────────────

  const newCounters = { ...existingCounters };

  // ID 6 (Regular): Natural in come-out
  if (rollResult === 'NATURAL') {
    newCounters.naturalsThisRun += 1;
  }

  // IDs 1 + 5 (Lefty / Floor Walker): Seven Out with shooter genuinely lost
  if (rollResult === 'SEVEN_OUT' && !flags.sevenOutBlocked) {
    newCounters.sevenOutsThisRun += 1;
  }

  // ID 2 (Physics Prof): Consecutive streak — increment on pair, reset on any other roll.
  // Old rows pre-dating this counter use undefined; treat as 0.
  if (dice[0] === dice[1]) {
    newCounters.consecutivePairedStreak = (existingCounters.consecutivePairedStreak ?? 0) + 1;
  } else {
    newCounters.consecutivePairedStreak = 0;
  }

  // ID 3 (Mechanic): Consecutive identical unordered dice combo streak.
  // Encode as min*10+max so {3,1} and {1,3} both map to 13 (range 11–66; 0 = none).
  const currentCombo = Math.min(dice[0], dice[1]) * 10 + Math.max(dice[0], dice[1]);
  const existingRef  = existingCounters.repeatingDiceRef ?? 0;
  if (currentCombo === existingRef) {
    newCounters.repeatingDiceStreak = (existingCounters.repeatingDiceStreak ?? 0) + 1;
  } else {
    newCounters.repeatingDiceStreak = 1;
    newCounters.repeatingDiceRef    = currentCombo;
  }

  // IDs 4 + 7 (Mathlete / Big Spender): any hardway win this run.
  if (baseHardwaysPayout > 0) {
    newCounters.hardwayWinsThisRun = (existingCounters.hardwayWinsThisRun ?? 0) + 1;
    // Bitmask of distinct hardway numbers won — bit 0=Hard4, bit 1=Hard6, bit 2=Hard8, bit 3=Hard10.
    const hwBit: Record<number, number> = { 4: 1, 6: 2, 8: 4, 10: 8 };
    const bit = hwBit[diceTotal] ?? 0;
    if (bit !== 0) {
      newCounters.hardwayWinBitsThisRun = (existingCounters.hardwayWinBitsThisRun ?? 0) | bit;
    }
  }

  // ID 15 (Lucky Charm): solo-floor streak — track consecutive solo marker clears.
  // Updated here (before countersToStore) so it persists correctly.
  // Floor position = (clearedMarkerIdx) % 3: 0 = floor-start, 2 = floor-end.
  // Cross-floor carries are prevented by resetting the streak at floor-start markers.
  if (nextState.status === 'TRANSITION') {
    const soloCount = (persistedRun.crewSlots as StoredCrewSlots).filter(Boolean).length;
    const clearedMarkerIdx = nextState.currentMarkerIndex - 1;
    const floorPos = clearedMarkerIdx % 3;
    // Reset streak at the start of a new floor so Floor 1 solo can't carry into Floor 2.
    const baseStreak = floorPos === 0 ? 0 : (existingCounters.soloMarkersConsecutive ?? 0);
    newCounters.soloMarkersConsecutive = soloCount === 1 ? baseStreak + 1 : 0;
  }

  // Lefty (ID 1) tracks seven-outs per marker segment, not per run.
  // Reset sevenOutsThisRun at TRANSITION so the next segment starts at zero.
  // The unlock check below still uses newCounters (pre-reset) to evaluate this segment.
  const countersToStore = nextState.status === 'TRANSITION'
    ? { ...newCounters, sevenOutsThisRun: 0 }
    : newCounters;

  // Persist counter updates (separate from the main optimistic-lock transaction
  // since these counters are not core game state — a lost update is acceptable).
  const countersChanged = (
    countersToStore.naturalsThisRun             !== existingCounters.naturalsThisRun              ||
    countersToStore.sevenOutsThisRun            !== existingCounters.sevenOutsThisRun             ||
    countersToStore.consecutivePairedStreak     !== (existingCounters.consecutivePairedStreak ?? 0) ||
    countersToStore.hardwayWinBitsThisRun       !== (existingCounters.hardwayWinBitsThisRun ?? 0)   ||
    countersToStore.hardwayWinsThisRun          !== (existingCounters.hardwayWinsThisRun ?? 0)      ||
    countersToStore.repeatingDiceStreak         !== (existingCounters.repeatingDiceStreak ?? 0)     ||
    countersToStore.repeatingDiceRef            !== (existingCounters.repeatingDiceRef ?? 0)        ||
    (countersToStore.soloMarkersConsecutive ?? 0) !== (existingCounters.soloMarkersConsecutive ?? 0)
  );
  if (countersChanged) {
    await db.update(runs)
      .set({ perRunUnlockCounters: countersToStore })
      .where(eq(runs.id, runId));
  }

  // ── 2. Evaluate unlock conditions ─────────────────────────────────────────

  const newProgressUpdates: Record<number, number> = {};
  const newUnlocks: number[] = [];

  /** Adds crewId to newUnlocks if not already owned. */
  function tryUnlock(crewId: number): void {
    if (!unlockedSet.has(crewId)) {
      unlockedSet.add(crewId);  // prevent double-add within this evaluation
      newUnlocks.push(crewId);
    }
  }

  // ── Cross-run cumulative (IDs 5, 8) ────────────────────────────────────────

  // ID 5 (Floor Walker): 8 Seven Outs total across all runs
  if (rollResult === 'SEVEN_OUT' && !flags.sevenOutBlocked) {
    const newCount = (unlockProgress[5] ?? 0) + 1;
    newProgressUpdates[5] = newCount;
    if (newCount >= 8) tryUnlock(5);
  }

  // ID 8 (Shark): 40 Point Hits total across all runs
  if (rollResult === 'POINT_HIT') {
    const newCount = (unlockProgress[8] ?? 0) + 1;
    newProgressUpdates[8] = newCount;
    if (newCount >= 40) tryUnlock(8);
  }

  // ── Per-run counters (IDs 2, 3, 4, 6) ─────────────────────────────────────

  // ID 6 (Regular): 3 Naturals in a single run
  if (newCounters.naturalsThisRun >= 3) tryUnlock(6);

  // ID 4 (Mathlete): Hardway bets won on 3 or more distinct numbers in a single run
  const hwBits = newCounters.hardwayWinBitsThisRun ?? 0;
  if ([1, 2, 4, 8].filter(b => (hwBits & b) !== 0).length >= 3) tryUnlock(4);

  // ID 7 (Big Spender): 3 Hardway wins in a single run
  if ((newCounters.hardwayWinsThisRun ?? 0) >= 3) tryUnlock(7);

  // ID 2 (Physics Prof): 3 consecutive paired rolls
  if (newCounters.consecutivePairedStreak >= 3) tryUnlock(2);

  // ID 3 (Mechanic): 3 consecutive identical unordered dice combos
  if (newCounters.repeatingDiceStreak >= 3) tryUnlock(3);

  // ── One-time event flags (IDs 7, 10, 12) ───────────────────────────────────

  // ID 10 (Nervous Intern): Natural on the shooter's very first come-out roll.
  // MVP heuristic: if the player has never triggered this before (unlockProgress[10]
  // undefined) and a Natural just fired on marker index ≤ 1 (covers the case where
  // the Natural itself advanced the marker from 0 → 1).
  if (
    rollResult === 'NATURAL' &&
    unlockProgress[10] === undefined &&
    nextState.currentMarkerIndex <= 1
  ) {
    newProgressUpdates[10] = 1;
    tryUnlock(10);
  }

  // ID 12 (Drunk Uncle): Hype reaches 3.0× at any point
  if (hype >= 3.0 && unlockProgress[12] !== 1) {
    newProgressUpdates[12] = 1;
    tryUnlock(12);
  }

  // ── Per-cascade event (ID 13 — Mimic) ──────────────────────────────────────

  // 4 or more DISTINCT non-Mimic crew abilities activate in a single cascade.
  // Events array only contains crew that actually changed the context (no silent passes).
  const distinctFiringCrew = new Set(
    cascadeEvents
      .filter(e => e.crewId !== MIMIC_ID)
      .map(e => e.crewId),
  );
  if (distinctFiringCrew.size >= 4) tryUnlock(13);

  // ── consecutivePointHits (ID 11) ──────────────────────────────────────────

  // nextState.consecutivePointHits is already incremented on POINT_HIT.

  // ID 11 (Hype-Train Holly): 3 consecutive point hits in single shooter
  if (rollResult === 'POINT_HIT' && nextState.consecutivePointHits >= 3) tryUnlock(11);

  // ── Per-run compound + per-run event (IDs 1, 15) — checked at TRANSITION ───

  if (nextState.status === 'TRANSITION') {
    // ID 1 (Lefty): ≥3 seven-outs within THIS segment AND clear the marker.
    // newCounters has the segment total; countersToStore already reset it to 0 for next segment.
    if (newCounters.sevenOutsThisRun >= 3) tryUnlock(1);

    // ID 15 (Lucky Charm): Clear all 3 markers of any floor with exactly 1 crew in slots.
    // soloMarkersConsecutive is already updated above; floor-end = clearedMarkerIdx % 3 === 2.
    const clearedMarkerIdx = nextState.currentMarkerIndex - 1;
    if (clearedMarkerIdx % 3 === 2 && (newCounters.soloMarkersConsecutive ?? 0) >= 3) tryUnlock(15);
  }

  // ── Run achievements (IDs 9, 14) ───────────────────────────────────────────

  // ID 9 (Whale): Reach $20,000 (2,000,000 cents) bankroll in a single run
  if (persistedRun.bankrollCents >= 2_000_000) tryUnlock(9);

  // ID 14 (Old Pro): Win the game — clear all 9 Gauntlet markers.
  // Detected when the run transitions to GAME_OVER and bankroll meets the last
  // marker's target (distinguishes a win GAME_OVER from a bust GAME_OVER).
  const lastMarkerTarget = MARKER_TARGETS[MARKER_TARGETS.length - 1] ?? Infinity;
  if (nextState.status === 'GAME_OVER' && persistedRun.bankrollCents >= lastMarkerTarget) {
    tryUnlock(14);
  }

  // ── 3. Persist user changes (unlocks + progress) ───────────────────────────

  const hasProgressUpdates = Object.keys(newProgressUpdates).length > 0;
  const hasNewUnlocks      = newUnlocks.length > 0;

  if (hasNewUnlocks || hasProgressUpdates) {
    // Use PostgreSQL array concatenation (||) for all four array columns so that
    // concurrent fire-and-forget evaluations never overwrite each other's additions.
    // A snapshot-based [...old, ...new] spread would lose unlocks when two rolls
    // complete fast enough that the second evaluation reads a stale run/user row.
    await db.update(users)
      .set({
        ...(hasNewUnlocks ? {
          unlockedCrewIds:         sql`unlocked_crew_ids         || ${pgIntArray(newUnlocks)}`,
          unacknowledgedUnlockIds: sql`unacknowledged_unlock_ids || ${pgIntArray(newUnlocks)}`,
        } : {}),
        ...(hasProgressUpdates ? {
          unlockProgress: { ...unlockProgress, ...newProgressUpdates },
        } : {}),
      })
      .where(eq(users.id, userId));

    if (hasNewUnlocks) {
      await db.update(runs)
        .set({
          guaranteedPubDraftIds: sql`guaranteed_pub_draft_ids || ${pgIntArray(newUnlocks)}`,
          crewUnlockedThisRun:   sql`crew_unlocked_this_run   || ${pgIntArray(newUnlocks)}`,
        })
        .where(eq(runs.id, runId));
    }
  }

  // ── 4. Emit unlocks:granted WebSocket event ─────────────────────────────────

  if (hasNewUnlocks) {
    const crewNames = newUnlocks.map(id => getCrewById(id)?.name ?? `Crew #${id}`);
    getIO()
      .to(`run:${runId}`)
      .emit('unlocks:granted', { newUnlockIds: newUnlocks, crewNames });
  }
}
