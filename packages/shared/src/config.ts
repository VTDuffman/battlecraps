// =============================================================================
// BATTLECRAPS — SHARED GAME CONFIGURATION
// packages/shared/src/config.ts
//
// Constants that must match exactly between the API (game engine) and the
// web client (progress UI). Placing them here is the single source of truth.
// =============================================================================

// ---------------------------------------------------------------------------
// Boss rule & reward types
// ---------------------------------------------------------------------------

/** The mechanical modifier a boss applies during their High Limit Room fight. */
export type BossRuleType =
  | 'RISING_MIN_BETS'     // Floor 1 — Sarge: minimum Pass Line bet rises each Point Hit
  | 'DISABLE_CREW'        // Floor 2 — Mme. Le Prix: Crew cascade fires in reverse
  | 'FOURS_INSTANT_LOSS'; // Floor 3 — The Executive: rolling a total of 4 is instant loss

/** The permanent comp perk awarded for defeating a boss. */
export type CompRewardType =
  | 'EXTRA_SHOOTER'   // Floor 1 — Member's Jacket: +1 Shooter at next segment reset
  | 'HYPE_RESET_HALF' // Floor 2 — Sea Legs: Hype resets to 50% of current (not 1.0×)
  | 'GOLDEN_TOUCH';   // Floor 3 — Golden Touch: guaranteed Natural on first come-out roll

/**
 * Tunable parameters for the RISING_MIN_BETS boss rule.
 * All percentages are expressed as fractions of the marker's target (0.05 = 5%).
 */
export interface RisingMinBetsParams {
  /** Fraction of the marker target that becomes the min-bet on the very first roll. */
  startPct: number;
  /** Added to startPct after each Point Hit (min-bet holds on Seven Out — does not reset). */
  incrementPct: number;
  /** The min-bet never exceeds this fraction of the target, no matter how many rolls. */
  capPct: number;
}

/** Full descriptor for a boss fight. Only present on markers where isBoss is true. */
export interface BossConfig {
  /** NPC name shown in boss entry and victory screens. */
  name: string;
  /** The rule mechanic in effect for the duration of this fight. */
  rule: BossRuleType;
  /** The comp perk awarded on defeat. */
  compReward: CompRewardType;
  /** Numeric ID written to users.comp_perk_ids after defeating this boss. */
  compPerkId: number;
  /** Flavor text shown in the boss entry modal. */
  flavorText: string;
  /**
   * Parameters for RISING_MIN_BETS.
   * Required when rule === 'RISING_MIN_BETS', undefined otherwise.
   */
  risingMinBets?: RisingMinBetsParams;
}

/** Complete configuration for a single gauntlet marker. */
export interface MarkerConfig {
  /** Bankroll threshold the player must reach to clear this marker, in cents. */
  targetCents: number;
  /** Venue name displayed in the progress UI. */
  venue: string;
  /** Which floor of the gauntlet this marker belongs to (1-based). */
  floor: number;
  /** True when this marker is a boss fight (every 3rd marker in the gauntlet). */
  isBoss: boolean;
  /** Full boss descriptor. Present only when isBoss is true. */
  boss?: BossConfig;
}

// ---------------------------------------------------------------------------
// Comp perk IDs — stable numeric IDs written to users.comp_perk_ids on boss
// defeat. Defined here so server (recruit.ts) and client (victory modal) share
// the same values without a separate lookup table.
// ---------------------------------------------------------------------------

export const COMP_PERK_IDS = {
  MEMBER_JACKET: 1,  // Floor 1 boss reward — +1 Shooter per segment reset
  SEA_LEGS:      2,  // Floor 2 boss reward — Hype resets to 50%
  GOLDEN_TOUCH:  3,  // Floor 3 boss reward — guaranteed first Natural
} as const;

// ---------------------------------------------------------------------------
// The Gauntlet — 9 markers across 3 floors (3 markers per floor)
//
// Targets (PRD v1.1, Section 5.1):
//   Floor 1 — VFW Hall:  $300 / $600 / $1,000
//   Floor 2 — Riverboat: $1,500 / $2,500 / $4,000
//   Floor 3 — The Strip: $6,000 / $9,000 / $12,500
//
// Boss at every 3rd marker (0-based indices 2, 5, 8).
// ---------------------------------------------------------------------------

export const GAUNTLET: readonly MarkerConfig[] = [
  // ── Floor 1: VFW Hall ─────────────────────────────────────────────────────

  {
    targetCents: 30_000,  // $300
    venue:       'VFW Hall',
    floor:       1,
    isBoss:      false,
  },
  {
    targetCents: 60_000,  // $600
    venue:       'VFW Hall',
    floor:       1,
    isBoss:      false,
  },
  {
    targetCents: 100_000,  // $1,000 — BOSS: Sarge
    venue:       'VFW Hall — High Limit Room',
    floor:       1,
    isBoss:      true,
    boss: {
      name:       'Sarge',
      rule:       'RISING_MIN_BETS',
      compReward: 'EXTRA_SHOOTER',
      compPerkId: COMP_PERK_IDS.MEMBER_JACKET,
      flavorText: "You want to play in MY hall? Ante up, soldier.",
      risingMinBets: {
        startPct:     0.05,  // 5%  of target on roll 1 → $50 min
        incrementPct: 0.02,  // +2% per subsequent roll → +$20/roll at this tier
        capPct:       0.20,  // never exceeds 20%       → $200 max for this boss
      },
    },
  },

  // ── Floor 2: Riverboat ────────────────────────────────────────────────────

  {
    targetCents: 150_000,  // $1,500
    venue:       'The Riverboat',
    floor:       2,
    isBoss:      false,
  },
  {
    targetCents: 250_000,  // $2,500
    venue:       'The Riverboat',
    floor:       2,
    isBoss:      false,
  },
  {
    targetCents: 400_000,  // $4,000 — BOSS: Mme. Le Prix
    venue:       'The Riverboat — Salon Privé',
    floor:       2,
    isBoss:      true,
    boss: {
      name:       'Mme. Le Prix',
      rule:       'DISABLE_CREW',
      compReward: 'HYPE_RESET_HALF',
      compPerkId: COMP_PERK_IDS.SEA_LEGS,
      flavorText: "On my table, the crew works backwards. Adapt.",
    },
  },

  // ── Floor 3: The Strip ────────────────────────────────────────────────────

  {
    targetCents: 600_000,  // $6,000
    venue:       'The Strip',
    floor:       3,
    isBoss:      false,
  },
  {
    targetCents: 900_000,  // $9,000
    venue:       'The Strip',
    floor:       3,
    isBoss:      false,
  },
  {
    targetCents: 1_250_000,  // $12,500 — BOSS: The Executive
    venue:       'The Strip — Penthouse',
    floor:       3,
    isBoss:      true,
    boss: {
      name:       'The Executive',
      rule:       'FOURS_INSTANT_LOSS',
      compReward: 'GOLDEN_TOUCH',
      compPerkId: COMP_PERK_IDS.GOLDEN_TOUCH,
      flavorText: "Fours are for losers. Don't roll one.",
    },
  },
];

/**
 * Flat array of marker targets in cents, derived from GAUNTLET.
 * Maintained for backwards-compatibility — new code should prefer
 * GAUNTLET[i].targetCents.
 */
export const MARKER_TARGETS: readonly number[] = GAUNTLET.map((m) => m.targetCents);

// ---------------------------------------------------------------------------
// Boss detection & min-bet helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the given 0-based marker index is a boss fight.
 * Boss markers are indices 2, 5, 8 (every 3rd marker, 1-based counting).
 */
export function isBossMarker(markerIndex: number): boolean {
  return GAUNTLET[markerIndex]?.isBoss === true;
}

/**
 * Returns the minimum Pass Line bet (in cents) for the current boss encounter,
 * or null if the marker is not a boss fight or has no RISING_MIN_BETS rule.
 *
 * Formula:
 *   minBet = targetCents × clamp(startPct + incrementPct × bossPointHits, 0, capPct)
 *   Result is rounded up to the nearest dollar (100 cents).
 *
 * Design note — "Hold on Seven Out, Rise on Point Hit":
 *   bossPointHits only increments when the player hits the point (POINT_HIT without
 *   clearing the marker). All other outcomes — NATURAL, CRAPS_OUT, POINT_SET,
 *   SEVEN_OUT, NO_RESOLUTION — leave the counter unchanged. The min-bet holds at
 *   its current level on Seven Out so Sarge never lets the pressure drop.
 *   Counter resets to 0 on any marker clear (TRANSITION).
 *
 * @param markerIndex  0-based index into GAUNTLET.
 * @param bossPointHits Point hits scored so far this boss segment (0 = first approach).
 */
export function getBossMinBet(markerIndex: number, bossPointHits: number): number | null {
  const config = GAUNTLET[markerIndex];
  if (!config?.isBoss || !config.boss?.risingMinBets) return null;

  const { targetCents } = config;
  const { startPct, incrementPct, capPct } = config.boss.risingMinBets;

  const rawPct     = startPct + incrementPct * bossPointHits;
  const clampedPct = Math.min(rawPct, capPct);
  const rawCents   = targetCents * clampedPct;

  // Round up to the nearest dollar to keep bet amounts clean.
  return Math.ceil(rawCents / 100) * 100;
}

/**
 * Maximum single bet (pass line or individual hardway) for a given marker.
 *
 * Normally set at 10 % of the current marker target. In boss rooms that use
 * RISING_MIN_BETS (e.g. Sarge), the table max is dynamically floored at
 * 5 × the current boss minimum so the player always has room to place the
 * minimum pass-line bet and back it with full 5× odds on a 6 or 8.
 *
 * @param currentMarkerIndex  The marker the player is currently chasing (0-based).
 * @param bossPointHits       Point hits scored so far this boss segment (required
 *                            for boss markers to compute the dynamic floor; pass 0
 *                            when unknown — safe default, never over-restricts).
 * @returns Maximum bet in cents.
 */
export function getMaxBet(currentMarkerIndex: number, bossPointHits = 0): number {
  const target    = GAUNTLET[currentMarkerIndex]?.targetCents ?? GAUNTLET[GAUNTLET.length - 1]!.targetCents;
  const normalMax = Math.floor(target * 0.10);

  // Boss floor: table max must be at least 5× the current minimum demand so
  // the player can place the minimum and cover full 5× odds on 6/8.
  const bossMin = getBossMinBet(currentMarkerIndex, bossPointHits);
  if (bossMin !== null) {
    return Math.max(normalMax, bossMin * 5);
  }

  return normalMax;
}

/**
 * Minimum Pass Line bet for a given marker, in cents.
 *
 * Set at approximately 1/6th of the table maximum, rounded to the nearest $5
 * (500 cents), with a hard floor of $5.  Scales with marker difficulty so the
 * stakes never feel trivially low late-game.
 *
 * Examples (marker → max → min):
 *   Marker 0 ($300 target)  → max $30  → min $5
 *   Marker 1 ($600 target)  → max $60  → min $10
 *   Marker 2 ($1 k target)  → max $100 → min $15
 *   Marker 3 ($1.5k target) → max $150 → min $25
 *   Marker 5 ($4 k target)  → max $400 → min $65
 *   Marker 8 ($12.5k target)→ max $1250→ min $210
 *
 * This minimum governs two things:
 *   1. Server rejects a come-out roll whose Pass Line bet is below this value.
 *   2. After any bet-clearing roll (NATURAL, CRAPS_OUT, POINT_HIT, SEVEN_OUT),
 *      if newBankroll < getMinBet() and no chips remain on the table, the
 *      server transitions the run to GAME_OVER.
 *
 * @param currentMarkerIndex  0-based index into GAUNTLET.
 * @returns Minimum bet in cents.
 */
export function getMinBet(currentMarkerIndex: number): number {
  const maxBet = getMaxBet(currentMarkerIndex);
  // ~1/6th of table max, snapped to nearest $5 (500 cents), never below $5.
  return Math.max(500, Math.round(maxBet / 6 / 500) * 500);
}

// ---------------------------------------------------------------------------
// Point Streak Hype — base-game escalating hype tick on consecutive point hits
// ---------------------------------------------------------------------------

/**
 * Flat hype added on the FIRST point hit of any streak.
 * Subsequent hits add STREAK_INCREMENT more per step, up to STREAK_CAP.
 */
export const STREAK_BASE_TICK = 0.05;
export const STREAK_INCREMENT = 0.05;
export const STREAK_CAP       = 3;  // tick caps at 4th+ hit: +0.20× per roll

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
