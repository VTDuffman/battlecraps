import { describe, it, expect } from 'vitest';
import {
  GAUNTLET,
  MARKER_TARGETS,
  getMaxBet,
  getMinBet,
  getBossMinBet,
  isBossMarker,
  getCrewHireCost,
  getBaseHypeTick,
  RARITY_COST_MULTIPLIERS,
  STREAK_BASE_TICK,
  STREAK_INCREMENT,
  STREAK_CAP,
} from '../config.js';

// ---------------------------------------------------------------------------
// GAUNTLET structure
// ---------------------------------------------------------------------------

describe('GAUNTLET', () => {
  it('has exactly 27 markers', () => {
    expect(GAUNTLET).toHaveLength(27);
  });

  it('has bosses at indices 2, 5, 8, 11, 14, 17, 20, 23, 26', () => {
    const bossIndices = GAUNTLET
      .map((m, i) => (m.isBoss ? i : -1))
      .filter((i) => i !== -1);
    expect(bossIndices).toEqual([2, 5, 8, 11, 14, 17, 20, 23, 26]);
  });

  it('every non-boss marker has no boss property', () => {
    GAUNTLET.filter((m) => !m.isBoss).forEach((m) => {
      expect(m.boss).toBeUndefined();
    });
  });

  it('every boss marker has a boss property', () => {
    GAUNTLET.filter((m) => m.isBoss).forEach((m) => {
      expect(m.boss).toBeDefined();
    });
  });

  it('floors are correct (1-based, 3 markers each)', () => {
    for (let i = 0; i < 27; i++) {
      const expectedFloor = Math.floor(i / 3) + 1;
      expect(GAUNTLET[i]?.floor).toBe(expectedFloor);
    }
  });

  it('Floor 1 targets: $50 / $100 / $250', () => {
    expect(GAUNTLET[0]?.targetCents).toBe(5_000);
    expect(GAUNTLET[1]?.targetCents).toBe(10_000);
    expect(GAUNTLET[2]?.targetCents).toBe(25_000);
  });

  it('Floor 2 targets: $450 / $600 / $1,000', () => {
    expect(GAUNTLET[3]?.targetCents).toBe(45_000);
    expect(GAUNTLET[4]?.targetCents).toBe(60_000);
    expect(GAUNTLET[5]?.targetCents).toBe(100_000);
  });

  it('Floor 9 boss target: $20,000,000', () => {
    expect(GAUNTLET[26]?.targetCents).toBe(2_000_000_000);
  });

  it('targets are strictly ascending', () => {
    for (let i = 1; i < GAUNTLET.length; i++) {
      expect(GAUNTLET[i]!.targetCents).toBeGreaterThan(GAUNTLET[i - 1]!.targetCents);
    }
  });

  it('MARKER_TARGETS mirrors GAUNTLET targetCents', () => {
    expect(MARKER_TARGETS).toHaveLength(27);
    GAUNTLET.forEach((m, i) => {
      expect(MARKER_TARGETS[i]).toBe(m.targetCents);
    });
  });
});

// ---------------------------------------------------------------------------
// isBossMarker
// ---------------------------------------------------------------------------

describe('isBossMarker', () => {
  it('returns true for boss markers (2, 5, 8, ...)', () => {
    [2, 5, 8, 11, 14, 17, 20, 23, 26].forEach((i) => {
      expect(isBossMarker(i)).toBe(true);
    });
  });

  it('returns false for non-boss markers', () => {
    [0, 1, 3, 4, 6, 7, 9, 10].forEach((i) => {
      expect(isBossMarker(i)).toBe(false);
    });
  });

  it('returns false for out-of-bounds index', () => {
    expect(isBossMarker(99)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getMaxBet
// ---------------------------------------------------------------------------

describe('getMaxBet', () => {
  it('marker 0 ($50 target) → max $5 (500 cents)', () => {
    // floor(5000 * 0.10) = 500
    expect(getMaxBet(0)).toBe(500);
  });

  it('marker 1 ($100 target) → max $10', () => {
    expect(getMaxBet(1)).toBe(1_000);
  });

  it('marker 2 ($250 boss target) → max $25', () => {
    expect(getMaxBet(2)).toBe(2_500);
  });

  it('applies ceilingPct override (0.15 for Old Pro)', () => {
    // floor(5000 * 0.15) = 750
    expect(getMaxBet(0, 0, 0.15)).toBe(750);
  });

  it('returns normalMax when no boss min-bet applies', () => {
    // Marker 0 is not a boss — no floor applied
    expect(getMaxBet(0, 5)).toBe(500);
  });

  it('applies boss floor for RISING_MIN_BETS (Sarge, index 5)', () => {
    // Sarge at 0 hits: bossMin = ceil(100000 * 0.05 / 100) * 100 = 5000
    // normalMax = floor(100000 * 0.10) = 10000
    // floor = bossMin * 5 = 25000 → max(10000, 25000) = 25000
    const bossMin0 = getBossMinBet(5, 0)!;
    expect(bossMin0).toBe(5_000);
    expect(getMaxBet(5, 0)).toBe(Math.max(10_000, bossMin0 * 5));
  });

  it('boss floor grows as bossPointHits increases (Sarge)', () => {
    // 1 hit: bossMin = ceil(100000 * 0.07 / 100) * 100 = 7000; floor = 35000
    const max0 = getMaxBet(5, 0);
    const max1 = getMaxBet(5, 1);
    expect(max1).toBeGreaterThan(max0);
  });

  it('caps Sarge boss floor at capPct (20% → bossMin 20000, floor 100000)', () => {
    // 8+ hits: clampedPct = 0.20; bossMin = ceil(100000 * 0.20 / 100)*100 = 20000
    // floor = 20000 * 5 = 100000
    const bossMinCapped = getBossMinBet(5, 8)!;
    expect(bossMinCapped).toBe(20_000);
    expect(getMaxBet(5, 8)).toBe(100_000);
    // Same at 9+ hits
    expect(getMaxBet(5, 9)).toBe(100_000);
  });

  it('out-of-bounds index falls back to last GAUNTLET entry', () => {
    // Uses GAUNTLET[26].targetCents = 2_000_000_000
    expect(getMaxBet(99)).toBe(Math.floor(2_000_000_000 * 0.10));
  });
});

// ---------------------------------------------------------------------------
// getMinBet
// ---------------------------------------------------------------------------

describe('getMinBet', () => {
  it('marker 0 ($50 target, max 500) → min $5 (500)', () => {
    // max=500; round(500/6/500)*500 = round(0.167)*500 = 0 → max(500,0) = 500
    expect(getMinBet(0)).toBe(500);
  });

  it('marker 1 ($100 target, max 1000) → min $5 (500)', () => {
    // max=1000; round(1000/6/500)*500 = round(0.33)*500=0→500
    expect(getMinBet(1)).toBe(500);
  });

  it('minimum is never below $5 (500 cents)', () => {
    // Check first few markers which have small targets
    for (let i = 0; i < 6; i++) {
      expect(getMinBet(i)).toBeGreaterThanOrEqual(500);
    }
  });

  it('scales up with higher marker index', () => {
    // Higher markers have higher minimums
    const minFloor1 = getMinBet(0);
    const minFloor5 = getMinBet(12);
    expect(minFloor5).toBeGreaterThan(minFloor1);
  });

  it('rounds to nearest $5 (500 cents)', () => {
    for (let i = 0; i < 27; i++) {
      expect(getMinBet(i) % 500).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// getBossMinBet
// ---------------------------------------------------------------------------

describe('getBossMinBet', () => {
  it('returns null for non-boss marker', () => {
    expect(getBossMinBet(0, 0)).toBeNull();
    expect(getBossMinBet(1, 3)).toBeNull();
  });

  it('returns null for DISABLE_CREW boss (no risingMinBets)', () => {
    // Marker 8 = Mme. Le Prix (DISABLE_CREW)
    expect(getBossMinBet(8, 0)).toBeNull();
  });

  it('returns null for FOURS_INSTANT_LOSS boss', () => {
    // Marker 11 = The Executive
    expect(getBossMinBet(11, 0)).toBeNull();
  });

  it('Sarge (index 5): 0 hits → 5% of $1000 = $50', () => {
    // ceil(100000 * 0.05 / 100) * 100 = 5000
    expect(getBossMinBet(5, 0)).toBe(5_000);
  });

  it('Sarge (index 5): 1 hit → ~7% of $1000 (fp: $71 due to ceil of 0.07 float)', () => {
    // rawPct = 0.05 + 0.02 * 1 = 0.07 (floating point: ~7.000...00416e-2)
    // rawCents = 100000 * 0.07 ≈ 7000.000000000000416 (not exactly 7000)
    // Math.ceil(7000.000.../ 100) = 71; 71 * 100 = 7100
    expect(getBossMinBet(5, 1)).toBe(7_100);
  });

  it('Sarge (index 5): 2 hits → ~9% of $1000 ($90 actual)', () => {
    // rawPct = 0.05 + 0.02 * 2 = 0.09; fp rounds to 9000 (stays exact here)
    expect(getBossMinBet(5, 2)).toBe(9_000);
  });

  it('Sarge (index 5): hits clamped at capPct 20% = $200', () => {
    // 8+ hits: 0.05 + 0.02*8 = 0.21 → clamped to 0.20
    expect(getBossMinBet(5, 8)).toBe(20_000);
    expect(getBossMinBet(5, 20)).toBe(20_000);
  });

  it('TIDAL_SURGE boss (index 17) returns null when counter < cycleLength', () => {
    // Sovereign: cycleLength=5; counter 0–4 = calm tide
    expect(getBossMinBet(17, 0)).toBeNull();
    expect(getBossMinBet(17, 4)).toBeNull();
  });

  it('TIDAL_SURGE boss (index 17) returns surge min when counter >= cycleLength', () => {
    // surge = round(getMinBet(17) × highTideMinMultiplier / 500) × 500
    // getMinBet(17): maxBet=1_750_000; round(1_750_000/6/500)*500 = round(583.3)*500 = 291_500
    // surge = round(291_500 × 3 / 500) × 500 = round(1749) × 500 = 874_500
    expect(getBossMinBet(17, 5)).toBe(874_500);
    expect(getBossMinBet(17, 6)).toBe(874_500);
  });

  it('CONVERGENCE boss (index 26) returns null (no risingMinBets)', () => {
    expect(getBossMinBet(26, 0)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getCrewHireCost
// ---------------------------------------------------------------------------

describe('getCrewHireCost', () => {
  it('Starter (2×) at $50 target (maxBet=500) → 1000 cents', () => {
    expect(getCrewHireCost('Starter', 5_000)).toBe(1_000);
  });

  it('Common (3×) at $100 target (maxBet=1000) → 3000 cents', () => {
    expect(getCrewHireCost('Common', 10_000)).toBe(3_000);
  });

  it('Uncommon (4×) at $250 target (maxBet=2500) → 10000 cents', () => {
    expect(getCrewHireCost('Uncommon', 25_000)).toBe(10_000);
  });

  it('Rare (5×) at $1000 target (maxBet=10000) → 50000 cents', () => {
    expect(getCrewHireCost('Rare', 100_000)).toBe(50_000);
  });

  it('Epic (7×) at $1000 target → 70000 cents', () => {
    expect(getCrewHireCost('Epic', 100_000)).toBe(70_000);
  });

  it('Legendary (9×) at $1000 target → 90000 cents', () => {
    expect(getCrewHireCost('Legendary', 100_000)).toBe(90_000);
  });

  it('RARITY_COST_MULTIPLIERS covers all 6 rarities', () => {
    const rarities: Array<keyof typeof RARITY_COST_MULTIPLIERS> = [
      'Starter', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary',
    ];
    rarities.forEach((r) => {
      expect(RARITY_COST_MULTIPLIERS[r]).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// getBaseHypeTick (point-hit streak hype)
// ---------------------------------------------------------------------------

describe('getBaseHypeTick', () => {
  it('streak 0 → STREAK_BASE_TICK (0.15)', () => {
    expect(getBaseHypeTick(0)).toBeCloseTo(STREAK_BASE_TICK, 4);
  });

  it('streak 1 → 0.20', () => {
    // BASE(0.15) + INCREMENT(0.05) * 1 = 0.20
    expect(getBaseHypeTick(1)).toBeCloseTo(0.20, 4);
  });

  it('streak 2 → 0.25', () => {
    expect(getBaseHypeTick(2)).toBeCloseTo(0.25, 4);
  });

  it('streak 3 → 0.30 (cap)', () => {
    // BASE(0.15) + INCREMENT(0.05) * min(3, CAP=3) = 0.30
    expect(getBaseHypeTick(3)).toBeCloseTo(0.30, 4);
  });

  it('streak 4+ → same as streak 3 (capped at STREAK_CAP)', () => {
    expect(getBaseHypeTick(4)).toBeCloseTo(0.30, 4);
    expect(getBaseHypeTick(10)).toBeCloseTo(0.30, 4);
  });

  it('STREAK_BASE_TICK is 0.15', () => {
    expect(STREAK_BASE_TICK).toBeCloseTo(0.15, 4);
  });

  it('STREAK_CAP is 3', () => {
    expect(STREAK_CAP).toBe(3);
  });

  it('STREAK_INCREMENT is 0.05', () => {
    expect(STREAK_INCREMENT).toBeCloseTo(0.05, 4);
  });
});
