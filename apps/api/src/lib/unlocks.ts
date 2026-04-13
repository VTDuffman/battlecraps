// =============================================================================
// BATTLECRAPS — UNLOCK EVALUATION
// apps/api/src/lib/unlocks.ts
//
// evaluateUnlocks() — called fire-and-forget after every roll to check
// whether the player has met any crew unlock conditions.
//
// Handles all 15 unlock conditions for original crew (IDs 1–15):
//   Cross-run cumulative  IDs 5, 8  (seven-out / point-hit lifetime totals)
//   Per-run counters      IDs 1, 2, 4, 6  (tracked in perRunUnlockCounters JSONB)
//   One-time event flags  IDs 7, 10, 12  (stored as 0/1 in unlockProgress)
//   Per-cascade event     ID 13 (Mimic)  (≥4 distinct crew fire in one cascade)
//   Existing counter      IDs 3, 11  (consecutivePointHits)
//   Per-run compound      ID 1  (Lefty: ≥3 seven-outs + clear marker)
//   Per-run event         ID 15  (Lucky Charm: solo crew + clear marker)
//   Run achievements      IDs 9, 14  (bankroll peak / game cleared)
// =============================================================================

import { eq } from 'drizzle-orm';

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

  // ID 2 (Physics Prof): Any pair of identical dice faces
  if (dice[0] === dice[1]) {
    newCounters.pairedRollsThisRun += 1;
  }

  // ID 4 (Mathlete): Soft hardway loss — NO_RESOLUTION, hardway total, non-paired,
  // and the corresponding hardway bet was placed before crew modification.
  // We intentionally check finalCtx.bets (original bets), not resolvedBets.
  if (
    rollResult === 'NO_RESOLUTION' &&
    dice[0] !== dice[1] &&
    (diceTotal === 4 || diceTotal === 6 || diceTotal === 8 || diceTotal === 10)
  ) {
    const hwKey = `hard${diceTotal}` as keyof typeof finalCtx.bets.hardways;
    if (finalCtx.bets.hardways[hwKey] > 0) {
      newCounters.softHardwayLossesThisRun += 1;
    }
  }

  // Persist counter updates (separate from the main optimistic-lock transaction
  // since these counters are not core game state — a lost update is acceptable).
  const countersChanged = (
    newCounters.naturalsThisRun          !== existingCounters.naturalsThisRun          ||
    newCounters.sevenOutsThisRun         !== existingCounters.sevenOutsThisRun         ||
    newCounters.pairedRollsThisRun       !== existingCounters.pairedRollsThisRun       ||
    newCounters.softHardwayLossesThisRun !== existingCounters.softHardwayLossesThisRun
  );
  if (countersChanged) {
    await db.update(runs)
      .set({ perRunUnlockCounters: newCounters })
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

  // ID 8 (Shark): 10 Point Hits total across all runs
  if (rollResult === 'POINT_HIT') {
    const newCount = (unlockProgress[8] ?? 0) + 1;
    newProgressUpdates[8] = newCount;
    if (newCount >= 10) tryUnlock(8);
  }

  // ── Per-run counters (IDs 2, 4, 6) ─────────────────────────────────────────

  // ID 6 (Regular): 3 Naturals in a single run
  if (newCounters.naturalsThisRun >= 3) tryUnlock(6);

  // ID 4 (Mathlete): 3 soft Hardway losses in a single run
  if (newCounters.softHardwayLossesThisRun >= 3) tryUnlock(4);

  // ID 2 (Physics Prof): 5 paired rolls in a single run
  if (newCounters.pairedRollsThisRun >= 5) tryUnlock(2);

  // ── One-time event flags (IDs 7, 10, 12) ───────────────────────────────────

  // ID 7 (Big Spender): Win a Hardway bet for the first time
  if (baseHardwaysPayout > 0 && unlockProgress[7] !== 1) {
    newProgressUpdates[7] = 1;
    tryUnlock(7);
  }

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

  // ID 12 (Drunk Uncle): Hype exceeds 2.0× at any point
  if (hype > 2.0 && unlockProgress[12] !== 1) {
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

  // ── consecutivePointHits piggyback (IDs 3, 11) ─────────────────────────────

  // nextState.consecutivePointHits is already incremented on POINT_HIT, so
  // the threshold comparisons directly reflect "N or more consecutive hits."

  // ID 3 (Mechanic): 4 consecutive point hits within single shooter
  if (rollResult === 'POINT_HIT' && nextState.consecutivePointHits >= 4) tryUnlock(3);

  // ID 11 (Hype-Train Holly): 3 consecutive point hits in single shooter
  if (rollResult === 'POINT_HIT' && nextState.consecutivePointHits >= 3) tryUnlock(11);

  // ── Per-run compound + per-run event (IDs 1, 15) — checked at TRANSITION ───

  if (nextState.status === 'TRANSITION') {
    // ID 1 (Lefty): Lose ≥3 shooters to Seven Out AND still clear the floor marker
    if (newCounters.sevenOutsThisRun >= 3) tryUnlock(1);

    // ID 15 (Lucky Charm): Clear a marker with exactly 1 crew member in slots
    const activeCrewCount = (persistedRun.crewSlots as StoredCrewSlots).filter(Boolean).length;
    if (activeCrewCount === 1) tryUnlock(15);
  }

  // ── Run achievements (IDs 9, 14) ───────────────────────────────────────────

  // ID 9 (Whale): Reach $8,000 (800,000 cents) bankroll in a single run
  if (persistedRun.bankrollCents >= 800_000) tryUnlock(9);

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
    await db.update(users)
      .set({
        ...(hasNewUnlocks ? {
          unlockedCrewIds: [...user.unlockedCrewIds, ...newUnlocks],
        } : {}),
        ...(hasProgressUpdates ? {
          unlockProgress: { ...unlockProgress, ...newProgressUpdates },
        } : {}),
      })
      .where(eq(users.id, userId));
  }

  // ── 4. Emit unlocks:granted WebSocket event ─────────────────────────────────

  if (hasNewUnlocks) {
    const crewNames = newUnlocks.map(id => getCrewById(id)?.name ?? `Crew #${id}`);
    getIO()
      .to(`run:${runId}`)
      .emit('unlocks:granted', { newUnlockIds: newUnlocks, crewNames });
  }
}
