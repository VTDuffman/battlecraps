import { describe, it, expect } from 'vitest';
import {
  GAUNTLET,
  MARKER_TARGETS,
  getMaxBet,
  getMinBet,
  getBossMinBet,
  isBossMarker,
  getBossEntryCounter,
  getBossPayoffCents,
  getCrewHireCost,
  getBaseHypeTick,
  RARITY_COST_MULTIPLIERS,
  STREAK_BASE_TICK,
  STREAK_INCREMENT,
  STREAK_CAP,
} from '../config.js';
import { getTideStage } from '../bossRules/tidalSurge.js';
import type { BossRuleParams } from '../config.js';

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

  it('Floor 1 targets: $50 / $100 / $200', () => {
    expect(GAUNTLET[0]?.targetCents).toBe(5_000);
    expect(GAUNTLET[1]?.targetCents).toBe(10_000);
    expect(GAUNTLET[2]?.targetCents).toBe(20_000);
  });

  it('Floor 2 targets: $300 / $500 / $1,000', () => {
    expect(GAUNTLET[3]?.targetCents).toBe(30_000);
    expect(GAUNTLET[4]?.targetCents).toBe(50_000);
    expect(GAUNTLET[5]?.targetCents).toBe(100_000);
  });

  it('Floor 9 boss target: $60,000,000', () => {
    expect(GAUNTLET[26]?.targetCents).toBe(6_000_000_000);
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

  it('marker 1 ($100 target) → max $10 (1000 cents)', () => {
    // floor(10000 * 0.10) = 1000
    expect(getMaxBet(1)).toBe(1_000);
  });

  it('marker 2 ($200 boss target) → max $20 (2000 cents)', () => {
    // floor(20000 * 0.10) = 2000; the Foreman raises no minimum, so no boss floor
    expect(getMaxBet(2)).toBe(2_000);
  });

  it('applies ceilingPct override (0.15 for Old Pro)', () => {
    // floor(5000 * 0.15) = 750
    expect(getMaxBet(0, 0, 0.15)).toBe(750);
  });

  it('returns normalMax when no boss min-bet applies', () => {
    // Marker 0 is not a boss — no floor applied
    expect(getMaxBet(0, 5)).toBe(500);
  });

  it('Sarge (DOUBLE_TIME, index 5) has no boss floor — the clock never raises the max', () => {
    // normalMax = floor(100000 * 0.10) = 10000, whatever the clock counter is
    expect(getMaxBet(5, 0)).toBe(10_000);
    expect(getMaxBet(5, 5)).toBe(10_000);
  });

  it("The Sovereign's tide no longer moves the max bet (FB-037)", () => {
    expect(getMaxBet(17, 2)).toBe(5_000_000);
  });

  it('out-of-bounds index falls back to last GAUNTLET entry', () => {
    // Uses GAUNTLET[26].targetCents = 6_000_000_000
    expect(getMaxBet(99)).toBe(Math.floor(6_000_000_000 * 0.10));
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

  it('returns null for DISABLE_CREW boss', () => {
    // Marker 8 = Mme. Le Prix (DISABLE_CREW)
    expect(getBossMinBet(8, 0)).toBeNull();
  });

  it('returns null for CROSS_CALIBRATION boss (no rising min bets)', () => {
    // Marker 11 = The Executive
    expect(getBossMinBet(11, 0)).toBeNull();
  });

  it('Sarge (DOUBLE_TIME, index 5) returns null — the clock never raises the minimum', () => {
    expect(getBossMinBet(5, 0)).toBeNull();
    expect(getBossMinBet(5, 5)).toBeNull();
  });

  it('TIDAL_SURGE (index 17) returns null at every stage — FB-037 removed the tide minimums', () => {
    for (let stage = 0; stage < 8; stage++) expect(getBossMinBet(17, stage)).toBeNull();
  });

  it('CONVERGENCE boss (index 26) returns null', () => {
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

// ---------------------------------------------------------------------------
// Boss comp rewards — slot unlock floors (FB-025)
// ---------------------------------------------------------------------------

describe('Boss comp rewards — slot unlock floors', () => {
  it('F4 boss (index 11) awards BOARD_SEAT', () => {
    expect(GAUNTLET[11]?.boss?.compReward).toBe('BOARD_SEAT');
  });

  it('F7 boss (index 20) awards CARGO_HOLD', () => {
    expect(GAUNTLET[20]?.boss?.compReward).toBe('CARGO_HOLD');
  });

  it('GOLDEN_TOUCH does not appear in any boss comp reward', () => {
    const rewards = GAUNTLET.filter((m) => m.isBoss).map((m) => m.boss?.compReward);
    expect(rewards).not.toContain('GOLDEN_TOUCH');
  });

  it('ZERO_POINT does not appear in any boss comp reward', () => {
    const rewards = GAUNTLET.filter((m) => m.isBoss).map((m) => m.boss?.compReward);
    expect(rewards).not.toContain('ZERO_POINT');
  });
});

describe('getBossEntryCounter', () => {
  it('starts The Executive (CROSS_CALIBRATION) at rating 2 (Strong)', () => {
    const idx = GAUNTLET.findIndex((m) => m.boss?.rule === 'CROSS_CALIBRATION');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(getBossEntryCounter(idx)).toBe(2);
  });

  it('returns 0 for every other marker', () => {
    GAUNTLET.forEach((m, i) => {
      if (m.boss?.rule === 'CROSS_CALIBRATION') return;
      expect(getBossEntryCounter(i)).toBe(0);
    });
  });

  it('returns 0 for out-of-range indices', () => {
    expect(getBossEntryCounter(-1)).toBe(0);
    expect(getBossEntryCounter(GAUNTLET.length)).toBe(0);
  });
});

describe('getBossPayoffCents (FB-032)', () => {
  it('The Foreman (marker 2) clears on a $25 Payoff', () => {
    expect(getBossPayoffCents(2)).toBe(2_500);
  });

  it('every other marker is a normal bankroll-target marker', () => {
    GAUNTLET.forEach((_, i) => {
      if (i === 2) return;
      expect(getBossPayoffCents(i)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// getTideStage — The Sovereign's tide rhythm (FB-037)
// ---------------------------------------------------------------------------

describe('getTideStage', () => {
  const params = GAUNTLET[17]!.boss!.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;

  it('cycles LOW (Dead Calm) → EBB (Undertow) → HIGH (High Tide) → FLOW (Undertow)', () => {
    expect([0, 1, 2, 3].map((c) => getTideStage(params, c).effect)).toEqual(['DEAD_CALM', 'UNDERTOW', 'HIGH_TIDE', 'UNDERTOW']);
    expect([0, 1, 2, 3].map((c) => getTideStage(params, c).tide)).toEqual(['LOW TIDE', 'EBB', 'HIGH TIDE', 'FLOW']);
    expect(getTideStage(params, 6).effect).toBe('HIGH_TIDE');   // wraps
  });

  it('states each stage in one line', () => {
    expect(getTideStage(params, 0).rule).toBe('NO ODDS BETS');
    expect(getTideStage(params, 1).rule).toBe('A SEVEN-OUT TAKES 35% OF YOUR BANKROLL');
    expect(getTideStage(params, 2).rule).toBe('A SEVEN-OUT DROWNS 2 SHOOTERS');
  });
});
