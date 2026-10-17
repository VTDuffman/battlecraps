import { describe, it, expect } from 'vitest';
import {
  CONVERGENCE_ROOM_MARKERS,
  MAX_CONVERGENCE_ROOMS,
  EMPTY_CONVERGENCE_STATE,
  isConvergenceMarker,
  shuffleConvergenceRooms,
  getRoomsInForce,
  getRoomCounter,
  withRoomCounter,
  enterRoom,
  advanceRuleCounter,
} from '../convergence.js';
import { GAUNTLET } from '../config.js';

describe('Convergence (FB-040)', () => {
  it('the rooms are the eight bosses before The Architect', () => {
    expect(CONVERGENCE_ROOM_MARKERS).toEqual([2, 5, 8, 11, 14, 17, 20, 23]);
    expect(MAX_CONVERGENCE_ROOMS).toBe(8);
    expect(isConvergenceMarker(26)).toBe(true);
    expect(isConvergenceMarker(23)).toBe(false);
  });

  it('a shuffle is a permutation of the rooms', () => {
    let seed = 7;
    const rng = (n: number) => { seed = (seed * 9301 + 49297) % 233280; return Math.floor((seed / 233280) * n); };
    for (let k = 0; k < 20; k++) {
      const order = shuffleConvergenceRooms(rng);
      expect([...order].sort((a, b) => a - b)).toEqual([...CONVERGENCE_ROOM_MARKERS]);
    }
  });

  it('rooms in force = Seven-Outs + 1, capped at all eight', () => {
    const order = [5, 11, 2, 8, 14, 17, 20, 23];
    expect(getRoomsInForce(order, 0)).toEqual([5]);
    expect(getRoomsInForce(order, 2)).toEqual([5, 11, 2]);
    expect(getRoomsInForce(order, 99)).toEqual(order);
  });

  it('each counter-keeping rule reads and writes its own field', () => {
    let st = EMPTY_CONVERGENCE_STATE;
    st = withRoomCounter(st, 'DOUBLE_TIME', 3);
    st = withRoomCounter(st, 'TIDAL_SURGE', 2);
    expect(getRoomCounter('DOUBLE_TIME', st)).toBe(3);
    expect(getRoomCounter('TIDAL_SURGE', st)).toBe(2);
    expect(getRoomCounter('CROSS_CALIBRATION', st)).toBe(2);
    expect(getRoomCounter('ORBITAL_DECAY', st)).toBe(0);
  });

  it('entering a room starts its counter fresh (Executive at Strong, Le Prix charms a filled slot)', () => {
    const crew = [null, { crewId: 16 }, null, null, null];
    const st = enterRoom({ ...EMPTY_CONVERGENCE_STATE, rating: 0 }, 11, crew, 5, () => 0);
    expect(st.rating).toBe(2);
    expect(enterRoom(EMPTY_CONVERGENCE_STATE, 8, crew, 5, () => 0).charm).toBe(1);
  });

  it('counters move as in each boss’s own fight', () => {
    const sov = GAUNTLET[17]!.boss!.ruleParams;
    const sarge = GAUNTLET[5]!.boss!.ruleParams;
    const exec = GAUNTLET[11]!.boss!.ruleParams;
    expect(advanceRuleCounter('DOUBLE_TIME', sarge, 2, 'NO_RESOLUTION')).toBe(3);
    expect(advanceRuleCounter('DOUBLE_TIME', sarge, 2, 'POINT_HIT')).toBe(0);
    expect(advanceRuleCounter('CROSS_CALIBRATION', exec, 4, 'NATURAL')).toBe(4);
    expect(advanceRuleCounter('CROSS_CALIBRATION', exec, 1, 'SEVEN_OUT')).toBe(0);
    expect(advanceRuleCounter('TIDAL_SURGE', sov, 3, 'CRAPS_OUT')).toBe(0);
    expect(advanceRuleCounter('TIDAL_SURGE', sov, 1, 'POINT_SET')).toBe(1);
  });
});
