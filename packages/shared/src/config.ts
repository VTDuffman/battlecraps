// =============================================================================
// BATTLECRAPS — SHARED GAME CONFIGURATION
// packages/shared/src/config.ts
//
// Constants that must match exactly between the API (game engine) and the
// web client (progress UI). Placing them here is the single source of truth.
// =============================================================================

/**
 * Gauntlet Marker targets — bankroll thresholds the player must reach
 * to advance through the roguelike loop.
 *
 * Reaching MARKER_TARGETS[i] while status is active triggers:
 *   - TRANSITION  → "The Seven-Proof Pub" (if not the final marker)
 *   - GAME_OVER   → Victory run-end      (if clearing the final/boss marker)
 *
 * When all shooters are lost (SEVEN_OUT drops shooters to 0):
 *   - bankroll >= MARKER_TARGETS[currentMarkerIndex] → TRANSITION (survive!)
 *   - bankroll <  MARKER_TARGETS[currentMarkerIndex] → GAME_OVER  (bust)
 *
 * Values are in CENTS. $400 = 40_000.
 */
export const MARKER_TARGETS: readonly number[] = [
  40_000,   //  $400 — Marker 1
  75_000,   //  $750 — Marker 2
  120_000,  // $1,200 — Marker 3
  250_000,  // $2,500 — Marker 4 (Boss / Gauntlet End)
];

/**
 * Maximum single bet (pass line or individual hardway) for a given marker.
 *
 * Set at 10 % of the current marker target so the player must sustain a
 * winning streak rather than YOLO-ing once.  Scales naturally as the
 * gauntlet difficulty rises.
 *
 * @param currentMarkerIndex  The marker the player is currently chasing (0-based).
 * @returns Maximum bet in cents.
 */
export function getMaxBet(currentMarkerIndex: number): number {
  const target = MARKER_TARGETS[currentMarkerIndex] ?? MARKER_TARGETS[MARKER_TARGETS.length - 1]!;
  return Math.floor(target * 0.10);
}
