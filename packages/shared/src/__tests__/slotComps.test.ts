import { describe, it, expect } from 'vitest';
import { getSlotsAfterBossComp } from '../config.js';

const EXECUTIVE = 11; // Board Seat
const COMMANDER = 20; // Cargo Hold

describe('getSlotsAfterBossComp (FB-025)', () => {
  it('beating The Executive grants the 4th slot', () => {
    expect(getSlotsAfterBossComp(EXECUTIVE, 3)).toBe(4);
  });

  it('beating The Commander grants the 5th slot', () => {
    expect(getSlotsAfterBossComp(COMMANDER, 4)).toBe(5);
  });

  it('never lowers the slot count, and is idempotent', () => {
    expect(getSlotsAfterBossComp(EXECUTIVE, 5)).toBe(5);
    expect(getSlotsAfterBossComp(EXECUTIVE, 4)).toBe(4);
  });

  it('other markers (and before the first) change nothing', () => {
    expect(getSlotsAfterBossComp(10, 3)).toBe(3);
    expect(getSlotsAfterBossComp(5, 3)).toBe(3);
    expect(getSlotsAfterBossComp(-1, 3)).toBe(3);
  });
});
