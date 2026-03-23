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
  60_000,   //  $600 — Marker 2 (softened — survivable after crew buy)
  150_000,  // $1,500 — Marker 3 (the real wall — 150 % growth with 2 crew)
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

// ---------------------------------------------------------------------------
// Point Streak Hype — base-game escalating hype tick on consecutive point hits
// ---------------------------------------------------------------------------

/**
 * Flat hype added on the FIRST point hit of any streak.
 * Subsequent hits add STREAK_INCREMENT more per step, up to STREAK_CAP.
 */
export const STREAK_BASE_TICK  = 0.05;
export const STREAK_INCREMENT  = 0.05;
export const STREAK_CAP        = 3;   // tick caps at 4th+ hit: +0.20× per roll

/**
 * Returns the base-game hype bonus for a point hit given the current
 * consecutive-point-hit streak count (BEFORE incrementing it).
 *
 * Formula: STREAK_BASE_TICK + STREAK_INCREMENT × min(streak, STREAK_CAP)
 *
 * Streak entering → tick awarded:
 *   0 → +0.05   (1st hit)
 *   1 → +0.10   (2nd consecutive)
 *   2 → +0.15   (3rd consecutive)
 *   3 → +0.20   (4th+ consecutive, capped)
 *
 * Applied BEFORE the crew cascade so Holly and other HYPE crew layer
 * their bonuses on top of the already-excited crowd.
 */
export function getBaseHypeTick(consecutivePointHits: number): number {
  return Math.round(
    (STREAK_BASE_TICK + STREAK_INCREMENT * Math.min(consecutivePointHits, STREAK_CAP)) * 10_000,
  ) / 10_000;
}
