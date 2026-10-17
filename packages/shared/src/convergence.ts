// =============================================================================
// BATTLECRAPS — CONVERGENCE (FB-040, The Architect)
// packages/shared/src/convergence.ts
//
// The Architect's fight is fought in rooms rebuilt from the bosses you've
// already beaten. At fight entry the eight previous bosses are shuffled (server
// RNG) into a room order, stored on the run. The first room is in force from
// the first roll; every Seven-Out (bossPointHits = the Seven-Out count) builds
// the next one — and the rooms STACK: every rule in force stays in force.
//
// Each room keeps its rule's own counter in `ConvergenceState` (Sarge's clock,
// Le Prix's charmed slot, the Executive's rating, the Sovereign's tide stage);
// The Hierophant's escrow and The Emissary's signal reuse their own run columns.
// =============================================================================

import { GAUNTLET, isBossMarker, pickEntryCharmSlot, type BossRuleParams, type BossRuleType } from './config.js';
import { getTideStage } from './bossRules/tidalSurge.js';
import type { RollResult } from './types.js';

/** The boss marker indices whose rooms The Architect can rebuild (every boss before him). */
export const CONVERGENCE_ROOM_MARKERS: readonly number[] = GAUNTLET
  .map((m, i) => (m.isBoss && m.boss?.rule !== 'CONVERGENCE' ? i : -1))
  .filter((i) => i >= 0);

/** Most rooms that can be in force (the Seven-Out counter's cap is this − 1). */
export const MAX_CONVERGENCE_ROOMS = CONVERGENCE_ROOM_MARKERS.length;

/** Per-room counters for the rules that keep one. */
export interface ConvergenceState {
  /** Sarge: point-phase rolls used against the clock. */
  clock:  number;
  /** Mme. Le Prix: the charmed crew slot. */
  charm:  number;
  /** The Executive: Performance Review rating (0–4). */
  rating: number;
  /** The Sovereign: tide stage. */
  tide:   number;
}

export const EMPTY_CONVERGENCE_STATE: ConvergenceState = { clock: 0, charm: 0, rating: 2, tide: 0 };

/** True when the marker is The Architect's (a CONVERGENCE boss marker). */
export function isConvergenceMarker(markerIndex: number): boolean {
  return isBossMarker(markerIndex) && GAUNTLET[markerIndex]?.boss?.rule === 'CONVERGENCE';
}

/** A random room order (Fisher–Yates with the caller's RNG — the server's crypto RNG in play). */
export function shuffleConvergenceRooms(randomBelow: (n: number) => number): number[] {
  const order = [...CONVERGENCE_ROOM_MARKERS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    const a = order[i], b = order[j];
    if (a === undefined || b === undefined) continue;
    order[i] = b; order[j] = a;
  }
  return order;
}

/** The rooms in force (boss marker indices, in order) after `sevenOuts` Seven-Outs. */
export function getRoomsInForce(order: readonly number[], sevenOuts: number): number[] {
  return order.slice(0, Math.min(order.length, Math.max(0, sevenOuts) + 1));
}

/** The rule a room (boss marker index) brings, or null. */
export function getRoomRule(roomMarker: number): BossRuleType | null {
  return GAUNTLET[roomMarker]?.boss?.rule ?? null;
}

/** That room's rule parameters, or null. */
export function getRoomParams(roomMarker: number): BossRuleParams | null {
  return GAUNTLET[roomMarker]?.boss?.ruleParams ?? null;
}

/** The counter a rule reads from the convergence state (0 for rules that keep none). */
export function getRoomCounter(rule: BossRuleType, state: ConvergenceState): number {
  switch (rule) {
    case 'DOUBLE_TIME':       return state.clock;
    case 'DISABLE_CREW':      return state.charm;
    case 'CROSS_CALIBRATION': return state.rating;
    case 'TIDAL_SURGE':       return state.tide;
    default:                  return 0;
  }
}

/** The state with one rule's counter replaced. */
export function withRoomCounter(state: ConvergenceState, rule: BossRuleType, value: number): ConvergenceState {
  switch (rule) {
    case 'DOUBLE_TIME':       return { ...state, clock: value };
    case 'DISABLE_CREW':      return { ...state, charm: value };
    case 'CROSS_CALIBRATION': return { ...state, rating: value };
    case 'TIDAL_SURGE':       return { ...state, tide: value };
    default:                  return state;
  }
}

/**
 * A room's counter when it's built: the Executive starts at Strong (2), Le Prix
 * charms a random filled slot, the clock and the tide start at 0.
 */
export function getRoomEntryCounter(
  rule:          BossRuleType,
  crewSlots:     readonly ({ crewId: number } | null)[],
  unlockedSlots: number,
  randomBelow:   (n: number) => number,
): number {
  if (rule === 'CROSS_CALIBRATION') return 2;
  if (rule === 'DISABLE_CREW')      return pickEntryCharmSlot(crewSlots, unlockedSlots, randomBelow) ?? 0;
  return 0;
}

/**
 * The state for the first room of a new fight (or a fresh room added to it).
 */
export function enterRoom(
  state:         ConvergenceState,
  roomMarker:    number,
  crewSlots:     readonly ({ crewId: number } | null)[],
  unlockedSlots: number,
  randomBelow:   (n: number) => number,
): ConvergenceState {
  const rule = getRoomRule(roomMarker);
  if (rule === null) return state;
  return withRoomCounter(state, rule, getRoomEntryCounter(rule, crewSlots, unlockedSlots, randomBelow));
}

/**
 * How a rule's counter moves on a roll — the same rules as in that boss's own
 * fight (rolls.ts computeNextState):
 *   DOUBLE_TIME       +1 per blank, 0 on anything else.
 *   CROSS_CALIBRATION Natural / Point Hit +1 (cap 4); Craps Out / Seven-Out −1 (floor 0).
 *   TIDAL_SURGE       advances one stage on every come-out resolution.
 *   DISABLE_CREW      re-picked by the roll handler (returned unchanged here).
 */
export function advanceRuleCounter(rule: BossRuleType, params: BossRuleParams, current: number, result: RollResult): number {
  const resolves = result === 'NATURAL' || result === 'CRAPS_OUT' || result === 'POINT_HIT' || result === 'SEVEN_OUT';
  switch (rule) {
    case 'DOUBLE_TIME':
      return result === 'NO_RESOLUTION' ? current + 1 : 0;
    case 'CROSS_CALIBRATION':
      if (result === 'NATURAL' || result === 'POINT_HIT') return Math.min(4, current + 1);
      if (result === 'CRAPS_OUT' || result === 'SEVEN_OUT') return Math.max(0, current - 1);
      return current;
    case 'TIDAL_SURGE': {
      if (params.rule !== 'TIDAL_SURGE') return current;
      return resolves ? (current + 1) % params.stageEffects.length : current;
    }
    default:
      return current;
  }
}

/** The Sovereign's tide stage for a convergence state (for displays). */
export function getConvergenceTide(state: ConvergenceState) {
  const sov = CONVERGENCE_ROOM_MARKERS.find((m) => getRoomRule(m) === 'TIDAL_SURGE');
  const params = sov !== undefined ? getRoomParams(sov) : null;
  return params?.rule === 'TIDAL_SURGE' ? getTideStage(params, state.tide) : null;
}
