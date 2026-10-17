import { describe, it, expect } from 'vitest';
import {
  getRealisticDefaults,
  buildDevRunState,
  buildTransitionEntryState,
  getBossCounterRange,
} from '../devScenario.js';
import { DEV_SCENARIOS } from '../devScenarios.js';
import { COMP_PERK_IDS, MARKER_TARGETS, pickEntryCharmSlot } from '../config.js';

const { THE_VIG, MEMBER_JACKET, SEA_LEGS, THE_COVENANT, POSEIDONS_FAVOR, THE_FREQUENCY } = COMP_PERK_IDS;

describe('getRealisticDefaults', () => {
  it('marker 0: nothing earned yet', () => {
    const d = getRealisticDefaults(0);
    expect(d.compPerkIds).toEqual([]);
    expect(d.unlockedSlots).toBe(3);
    expect(d.shooters).toBe(5);
    expect(d.bossCounter).toBe(0);
  });

  it('marker 3 (after the Foreman): The Vig only', () => {
    const d = getRealisticDefaults(3);
    expect(d.compPerkIds).toEqual([THE_VIG]);
    expect(d.unlockedSlots).toBe(3);
    expect(d.shooters).toBe(5);
  });

  it('marker 11 (Executive): three comps, Member\'s Jacket shooter, rating 2', () => {
    const d = getRealisticDefaults(11);
    expect(d.compPerkIds).toEqual([THE_VIG, MEMBER_JACKET, SEA_LEGS]);
    expect(d.unlockedSlots).toBe(3);
    expect(d.shooters).toBe(6);
    expect(d.bossCounter).toBe(2);
  });

  it('marker 20 (Commander): Board Seat gives 4 slots', () => {
    const d = getRealisticDefaults(20);
    expect(d.compPerkIds).toEqual([THE_VIG, MEMBER_JACKET, SEA_LEGS, THE_COVENANT, POSEIDONS_FAVOR]);
    expect(d.unlockedSlots).toBe(4);
  });

  it('marker 26 (Architect): Cargo Hold gives 5 slots, all comps through F8', () => {
    const d = getRealisticDefaults(26);
    expect(d.compPerkIds).toEqual([THE_VIG, MEMBER_JACKET, SEA_LEGS, THE_COVENANT, POSEIDONS_FAVOR, THE_FREQUENCY]);
    expect(d.unlockedSlots).toBe(5);
  });

  it('bankroll defaults to 60% of the marker target, rounded to the dollar', () => {
    const d = getRealisticDefaults(11);
    expect(d.bankrollCents).toBe(Math.round(((MARKER_TARGETS[11] ?? 0) * 0.6) / 100) * 100);
    expect(d.bankrollCents % 100).toBe(0);
  });
});

describe('buildDevRunState', () => {
  it('clamps out-of-range values', () => {
    const s = buildDevRunState({ markerIndex: 99, shooters: 50, hype: 0, bankrollCents: -5, bossCounter: 99 });
    expect(s.currentMarkerIndex).toBe(26);
    expect(s.shooters).toBe(7);
    expect(s.hype).toBe(0.25);
    expect(s.bankrollCents).toBe(0);
    expect(s.bossPointHits).toBe(7); // Architect max — 8 rooms in force (FB-040)
  });

  it('a point sets POINT_ACTIVE and seeds a pass line bet', () => {
    const s = buildDevRunState({ markerIndex: 4, point: 8 });
    expect(s.status).toBe('POINT_ACTIVE');
    expect(s.phase).toBe('POINT_ACTIVE');
    expect(s.currentPoint).toBe(8);
    expect(s.bets.passLine).toBeGreaterThan(0);
  });

  it('drops crew placed beyond the active slot count', () => {
    const s = buildDevRunState({ markerIndex: 0, crew: [16, 17, 18, 19, 20] });
    expect(s.unlockedSlots).toBe(3);
    expect(s.crew).toEqual([16, 17, 18, null, null]);
  });

  it('non-boss markers always get bossPointHits 0', () => {
    expect(buildDevRunState({ markerIndex: 4, bossCounter: 3 }).bossPointHits).toBe(0);
  });
});

describe('buildTransitionEntryState', () => {
  it('starts one marker earlier with enough bankroll to clear it', () => {
    const s = buildTransitionEntryState({ markerIndex: 11 });
    expect(s).not.toBeNull();
    expect(s!.currentMarkerIndex).toBe(10);
    expect(s!.bankrollCents).toBeGreaterThanOrEqual(MARKER_TARGETS[10] ?? Infinity);
    expect(s!.status).toBe('IDLE_TABLE');
  });

  it('is null for marker 0', () => {
    expect(buildTransitionEntryState({ markerIndex: 0 })).toBeNull();
  });
});

describe('getBossCounterRange', () => {
  it('matches each counter-driven boss', () => {
    expect(getBossCounterRange(11, 3)).toEqual({ min: 0, max: 4 });
    expect(getBossCounterRange(26, 5)).toEqual({ min: 0, max: 7 });   // Seven-Outs = rooms built − 1
    expect(getBossCounterRange(17, 4)).toEqual({ min: 0, max: 3 });
    expect(getBossCounterRange(8, 3)).toEqual({ min: 0, max: 2 });
    expect(getBossCounterRange(2, 3)).toBeNull(); // Foreman: stateless
    expect(getBossCounterRange(4, 3)).toBeNull(); // not a boss
  });
});

describe('DEV_SCENARIOS presets', () => {
  it('every preset has a unique name', () => {
    const names = DEV_SCENARIOS.map((s) => s.name);
    expect(names.every((n) => typeof n === 'string' && n.length > 0)).toBe(true);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(DEV_SCENARIOS.map((s) => [s.name, s] as const))('"%s" builds without clamping', (_name, scenario) => {
    const s = buildDevRunState(scenario);
    expect(s.currentMarkerIndex).toBe(scenario.markerIndex);
    if (scenario.bankrollCents !== undefined) expect(s.bankrollCents).toBe(scenario.bankrollCents);
    if (scenario.hype !== undefined)          expect(s.hype).toBe(scenario.hype);
    if (scenario.bossCounter !== undefined)   expect(s.bossPointHits).toBe(scenario.bossCounter);
    if (scenario.point !== undefined)         expect(s.currentPoint).toBe(scenario.point);
  });
});

describe('Emissary signal (FB-039)', () => {
  it('sets transit and blackout only at The Emissary', () => {
    const s = buildDevRunState({ markerIndex: 23, signalTransitCents: 500_000, signalTransitHype: 0.3 });
    expect(s.signalTransit).toEqual({ additives: 500_000, hype: 0.3, multipliers: [] });
    expect(s.signalDarkRolls).toBe(0);
    const elsewhere = buildDevRunState({ markerIndex: 20, signalTransitCents: 500_000, signalDarkRolls: 3 });
    expect(elsewhere.signalTransit).toBeNull();
    expect(elsewhere.signalDarkRolls).toBe(0);
  });

  it('clamps the blackout and holds nothing in transit while dark', () => {
    const s = buildDevRunState({ markerIndex: 23, signalDarkRolls: 99, signalTransitCents: 500_000 });
    expect(s.signalDarkRolls).toBe(6);
    expect(s.signalTransit).toBeNull();
  });
});

describe('pickEntryCharmSlot', () => {
  const slot = (crewId: number) => ({ crewId });

  it('picks only filled, active slots', () => {
    const crew = [null, slot(16), null, slot(18), slot(19)];
    // unlockedSlots 4 → candidates are slots 1 and 3.
    expect(pickEntryCharmSlot(crew, 4, () => 0)).toBe(1);
    expect(pickEntryCharmSlot(crew, 4, () => 1)).toBe(3);
  });

  it('returns null when no active slot is filled', () => {
    expect(pickEntryCharmSlot([null, null, null, slot(16), null], 3, () => 0)).toBeNull();
  });
});
