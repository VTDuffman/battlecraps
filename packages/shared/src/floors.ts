// =============================================================================
// BATTLECRAPS — FLOOR & TRANSITION DEFINITIONS
// packages/shared/src/floors.ts
//
// Phase 1: TransitionType and CelebrationSnapshot — the foundation of the
//          unified transition framework.
// Phase 2+: FloorConfig, FloorTheme, and the full floor configuration schema
//           will be added here as the framework expands.
//
// This file is the shared contract between the API and the web client for
// anything related to floor progression and game transition orchestration.
// =============================================================================

// ---------------------------------------------------------------------------
// TRANSITION TYPE
// ---------------------------------------------------------------------------

/**
 * The type of game transition currently in progress.
 *
 * Drives the TransitionOrchestrator in the web client to select the
 * correct phase sequence from the TRANSITION_REGISTRY.
 *
 * Active in Phase 1:
 *   MARKER_CLEAR  — Celebration after hitting a marker target
 *   BOSS_ENTRY    — Ominous boss introduction before the High Limit Room
 *   BOSS_VICTORY  — Triumph screen after defeating a boss
 *
 * Added in later phases:
 *   TITLE         — First-load cinematic (Phase 6)
 *   MARKER_INTRO  — Brief orientation card after pub, before first roll (Phase 3)
 *   FLOOR_REVEAL  — Full-screen new-floor announcement (Phase 4)
 *   VICTORY       — Full victory cinematic after clearing all 9 markers (Phase 8)
 *   GAME_OVER     — End screen after all shooters are lost (Phase 9)
 */
export type TransitionType =
  | 'TITLE'
  | 'MARKER_CLEAR'
  | 'MARKER_INTRO'
  | 'FLOOR_REVEAL'
  | 'BOSS_ENTRY'
  | 'BOSS_VICTORY'
  | 'VICTORY'
  | 'GAME_OVER';

// ---------------------------------------------------------------------------
// CELEBRATION SNAPSHOT
// ---------------------------------------------------------------------------

/**
 * Frozen snapshot of the game state at the moment a marker was cleared.
 *
 * Held in the Zustand store during the MARKER_CLEAR / BOSS_VICTORY celebration
 * sequence so that all phase components display the OLD marker state (the one
 * that was just beaten) rather than the already-incremented logical state.
 *
 * WHY THIS EXISTS — the chip-rain race condition:
 *   The server sends newMarkerIndex (already incremented) in turn:settled.
 *   The store updates its logical state immediately for correctness. But the
 *   UI must continue to show the marker the player just BEAT during the
 *   celebration, not the next target they haven't reached yet.
 *
 *   Without this snapshot, components that read currentMarkerIndex from the
 *   store will flash the new (higher) target during chip rain — confusing and
 *   incorrect. With the snapshot, every phase component reads from here instead
 *   of the live store during the celebration window.
 *
 * LIFECYCLE:
 *   1. applyPendingSettlement() detects runStatus === 'TRANSITION'
 *   2. Captures snapshot from the CURRENT (pre-update) store state
 *   3. Store logical state updates (currentMarkerIndex advances, etc.)
 *   4. UI reads from celebrationSnapshot for all display during celebration
 *   5. clearTransition() is called when the player clicks through all phases
 *   6. Snapshot is nulled — new state is now safe to render (pub screen)
 */
export interface CelebrationSnapshot {
  /** The 0-based index of the marker that was just cleared. */
  markerIndex: number;
  /** Target bankroll for the cleared marker, in cents. */
  targetCents: number;
  /** 1-indexed floor number for the cleared marker (1, 2, or 3). */
  floorId: number;
  /** Player bankroll immediately before the clearing roll was settled. */
  bankrollBefore: number;
  /** Player bankroll after the clearing roll (includes the payout). */
  bankrollAfter: number;
  /** True when the cleared marker was a boss fight. Drives BOSS_VICTORY vs MARKER_CLEAR routing. */
  isBossVictory: boolean;
}
