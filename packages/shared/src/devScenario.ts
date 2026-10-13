// =============================================================================
// BATTLECRAPS — DEVELOPER MODE SCENARIOS (FB-028)
// packages/shared/src/devScenario.ts
//
// Pure functions that turn a DevScenario (what the developer asked for) into
// concrete run state. Lives in `shared` so it is unit-testable and portable to a
// future local / desktop build. The API wraps it; nothing here touches the DB.
//
// Realistic defaults answer "what would a real player plausibly have when they
// arrive at marker N?" — comps from bosses already beaten, slot count from the
// slot-unlock comps, Member's Jacket shooter bonus, and a bankroll that is 60%
// of the marker target. Every field can be overridden.
// =============================================================================

import { GAUNTLET, MARKER_TARGETS, COMP_PERK_IDS, getBossEntryCounter, getMinBet, isBossMarker } from './config.js';
import type { Bets, GamePhase } from './types.js';

export type DevScenarioPoint = 4 | 5 | 6 | 8 | 9 | 10;

/** What the developer asks for. Omitted fields fall back to realistic defaults. */
export interface DevScenario {
  name?:                 string;
  markerIndex:           number;
  bankrollCents?:        number;
  shooters?:             number;
  hype?:                 number;
  consecutivePointHits?: number;
  phase?:                GamePhase;
  point?:                DevScenarioPoint;
  bets?:                 Bets;
  /** Crew ids by slot index (length ≤ 5). null = empty slot. */
  crew?:                 (number | null)[];
  unlockedSlots?:        3 | 4 | 5;
  compPerkIds?:          number[];
  /** Raw bossPointHits override — meaning depends on the boss rule (see clampBossCounter). */
  bossCounter?:          number;
  /** Hierophant escrow / Emissary transmission buffer, in cents. */
  pendingAdditiveCents?: number;
  /**
   * 'table'      — start directly at the marker. Entry cinematics (marker intro,
   *                floor reveal, boss entry) still play.
   * 'transition' — start one marker earlier at its target bankroll; tapping
   *                ADVANCE runs the real clear → celebration → pub → table path.
   */
  entry?:                'table' | 'transition';
  /** Allow crew the account has not unlocked. */
  ignoreUnlocks?:        boolean;
}

/** Concrete run values produced from a scenario. Maps 1:1 onto `runs` columns. */
export interface DevRunState {
  currentMarkerIndex:   number;
  floor:                number;
  status:               'IDLE_TABLE' | 'POINT_ACTIVE';
  phase:                GamePhase;
  currentPoint:         DevScenarioPoint | null;
  bankrollCents:        number;
  shooters:             number;
  hype:                 number;
  consecutivePointHits: number;
  bets:                 Bets;
  /** Crew ids by slot, always length 5. */
  crew:                 (number | null)[];
  unlockedSlots:        3 | 4 | 5;
  compPerkIds:          number[];
  bossPointHits:        number;
  pendingAdditiveCents: number;
}

export const EMPTY_DEV_BETS: Bets = {
  passLine: 0,
  odds:     0,
  hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
};

const DEV_POINTS: readonly DevScenarioPoint[] = [4, 5, 6, 8, 9, 10];
const DEFAULT_BANKROLL_PCT = 0.6;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function lastMarkerIndex(): number {
  return GAUNTLET.length - 1;
}

/** Clamps a marker index into the gauntlet. */
export function clampMarkerIndex(markerIndex: number): number {
  return clamp(Math.trunc(markerIndex), 0, lastMarkerIndex());
}

/**
 * Valid bossPointHits range for the boss at `markerIndex`, or null when the
 * marker has no counter-driven boss state.
 */
export function getBossCounterRange(markerIndex: number, unlockedSlots: number): { min: number; max: number } | null {
  if (!isBossMarker(markerIndex)) return null;
  switch (GAUNTLET[markerIndex]?.boss?.rule) {
    case 'CROSS_CALIBRATION': return { min: 0, max: 4 };               // rating
    case 'CONVERGENCE':       return { min: 0, max: 5 };               // seven-outs
    case 'TIDAL_SURGE':       return { min: 0, max: 3 };               // tide stage
    case 'DISABLE_CREW':      return { min: 0, max: Math.max(0, unlockedSlots - 1) }; // charmed slot
    case 'DOUBLE_TIME': {                                               // clock rolls used
      const params = GAUNTLET[markerIndex]?.boss?.ruleParams;
      const limit  = params?.rule === 'DOUBLE_TIME' ? params.rollLimit : 6;
      return { min: 0, max: Math.max(0, limit - 1) };
    }
    default:                  return null;
  }
}

function clampBossCounter(markerIndex: number, unlockedSlots: number, value: number): number {
  const range = getBossCounterRange(markerIndex, unlockedSlots);
  if (range === null) return 0;
  return clamp(Math.trunc(value), range.min, range.max);
}

/** Boss configs for every boss strictly before `markerIndex`. */
function beatenBosses(markerIndex: number) {
  return GAUNTLET.slice(0, markerIndex)
    .map((m) => m.boss)
    .filter((b): b is NonNullable<typeof b> => b !== undefined);
}

/** What a real player would plausibly have on arriving at `markerIndex`. */
export function getRealisticDefaults(markerIndex: number): Required<Omit<DevScenario, 'name' | 'point' | 'crew' | 'ignoreUnlocks'>> {
  const idx    = clampMarkerIndex(markerIndex);
  const target = MARKER_TARGETS[idx] ?? 0;
  const bosses = beatenBosses(idx);

  const compPerkIds = bosses
    .filter((b) => b.compReward !== 'NONE' && b.compPerkId > 0)
    .map((b) => b.compPerkId);

  let unlockedSlots: 3 | 4 | 5 = 3;
  if (bosses.some((b) => b.compReward === 'BOARD_SEAT')) unlockedSlots = 4;
  if (bosses.some((b) => b.compReward === 'CARGO_HOLD')) unlockedSlots = 5;

  return {
    markerIndex:          idx,
    bankrollCents:        Math.round((target * DEFAULT_BANKROLL_PCT) / 100) * 100,
    shooters:             compPerkIds.includes(COMP_PERK_IDS.MEMBER_JACKET) ? 6 : 5,
    hype:                 1.0,
    consecutivePointHits: 0,
    phase:                'COME_OUT',
    bets:                 EMPTY_DEV_BETS,
    unlockedSlots,
    compPerkIds,
    bossCounter:          getBossEntryCounter(idx),
    pendingAdditiveCents: 0,
    entry:                'table',
  };
}

/**
 * Merges a scenario over realistic defaults and clamps every field into a
 * valid range. Does not validate crew ids (the API does that against the DB).
 */
export function buildDevRunState(scenario: DevScenario): DevRunState {
  const idx      = clampMarkerIndex(scenario.markerIndex);
  const defaults = getRealisticDefaults(idx);

  const unlockedSlots = scenario.unlockedSlots ?? defaults.unlockedSlots;

  const crew: (number | null)[] = [null, null, null, null, null];
  // Crew beyond the active slot count would sit in locked slots; drop it.
  (scenario.crew ?? []).slice(0, unlockedSlots).forEach((id, i) => { crew[i] = id ?? null; });

  const point = scenario.point !== undefined && DEV_POINTS.includes(scenario.point) ? scenario.point : null;
  const phase: GamePhase = point !== null ? 'POINT_ACTIVE' : 'COME_OUT';

  let bets = scenario.bets ?? defaults.bets;
  // A point with nothing on the pass line can't resolve meaningfully; seed the min bet.
  if (phase === 'POINT_ACTIVE' && bets.passLine <= 0) {
    bets = { ...bets, passLine: getMinBet(idx) };
  }

  return {
    currentMarkerIndex:   idx,
    floor:                GAUNTLET[idx]?.floor ?? 1,
    status:               phase === 'POINT_ACTIVE' ? 'POINT_ACTIVE' : 'IDLE_TABLE',
    phase,
    currentPoint:         point,
    bankrollCents:        Math.max(0, Math.round(scenario.bankrollCents ?? defaults.bankrollCents)),
    shooters:             clamp(Math.trunc(scenario.shooters ?? defaults.shooters), 1, 7),
    hype:                 clamp(scenario.hype ?? defaults.hype, 0.25, 10),
    consecutivePointHits: clamp(Math.trunc(scenario.consecutivePointHits ?? 0), 0, 20),
    bets,
    crew,
    unlockedSlots,
    compPerkIds:          [...new Set(scenario.compPerkIds ?? defaults.compPerkIds)],
    bossPointHits:        clampBossCounter(idx, unlockedSlots, scenario.bossCounter ?? defaults.bossCounter),
    pendingAdditiveCents: Math.max(0, Math.round(scenario.pendingAdditiveCents ?? 0)),
  };
}

/**
 * For entry 'transition': the run starts at the previous marker with enough
 * bankroll to clear it, so the real clear → pub → table path runs on ADVANCE.
 * The carried bankroll is max(previous target, requested bankroll).
 * Returns null for marker 0 (nothing to transition from).
 */
export function buildTransitionEntryState(scenario: DevScenario): DevRunState | null {
  const target = buildDevRunState(scenario);
  if (target.currentMarkerIndex === 0) return null;

  const prevIdx    = target.currentMarkerIndex - 1;
  const prevTarget = MARKER_TARGETS[prevIdx] ?? 0;
  // Comps/slots as they'd be *before* the previous marker's boss pays out
  // (the real pub awards it on the way through).
  const prevDefaults = getRealisticDefaults(prevIdx);

  return {
    ...target,
    currentMarkerIndex:   prevIdx,
    floor:                GAUNTLET[prevIdx]?.floor ?? 1,
    status:               'IDLE_TABLE',
    phase:                'COME_OUT',
    currentPoint:         null,
    bets:                 EMPTY_DEV_BETS,
    bankrollCents:        Math.max(prevTarget, target.bankrollCents),
    unlockedSlots:        scenario.unlockedSlots ?? prevDefaults.unlockedSlots,
    compPerkIds:          [...new Set(scenario.compPerkIds ?? prevDefaults.compPerkIds)],
    bossPointHits:        getBossEntryCounter(prevIdx),
    consecutivePointHits: 0,
  };
}
