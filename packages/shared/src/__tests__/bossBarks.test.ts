import { describe, it, expect } from 'vitest';
import { selectBossBarkTrigger, pickBossBark, type BossBarkInput } from '../bossBarks.js';
import { GAUNTLET } from '../config.js';

const FOREMAN = 2;
const always = () => 0;      // below every chance → chance-based barks fire
const never  = () => 0.999;  // above every chance → chance-based barks skip

const base: BossBarkInput = {
  markerIndex:   FOREMAN,
  bankrollDelta: 0,
  isLoss:        false,
  isGameOver:    false,
  barkShowing:   false,
  lastLine:      null,
};
const cut = (before: number, after: number, paidOff = false) =>
  ({ before, after, payoff: 2_500, paidOff });

describe('selectBossBarkTrigger', () => {
  it('payoff wins over everything', () => {
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: 500, cut: cut(2_300, 2_600, true), barkShowing: true }, never)).toBe('payoff');
  });

  it('crossing 80% / 50% of the Payoff always barks, even over a showing bark', () => {
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: 400, cut: cut(1_900, 2_100), barkShowing: true }, never)).toBe('progress80');
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: 400, cut: cut(1_100, 1_300), barkShowing: true }, never)).toBe('progress50');
  });

  it('a jump past both milestones reports the higher one', () => {
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: 900, cut: cut(1_000, 2_200) }, never)).toBe('progress80');
  });

  it('plain wins and losses bark only by chance', () => {
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: 400, cut: cut(0, 200) }, always)).toBe('win');
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: 400, cut: cut(0, 200) }, never)).toBeNull();
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: -500, isLoss: true }, always)).toBe('loss');
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: -500, isLoss: true }, never)).toBeNull();
  });

  it('chance barks never talk over a bark already on screen', () => {
    expect(selectBossBarkTrigger({ ...base, bankrollDelta: 400, barkShowing: true }, always)).toBeNull();
  });

  it('a neutral roll (point set, no change) is silent', () => {
    expect(selectBossBarkTrigger({ ...base }, always)).toBeNull();
  });

  it('a run-ending roll is silent (the defeat moment owns the screen)', () => {
    expect(selectBossBarkTrigger({ ...base, isLoss: true, isGameOver: true }, always)).toBeNull();
  });
});

describe('pickBossBark', () => {
  it('returns a Foreman line from the matching pool', () => {
    const bark = pickBossBark({ ...base, cut: cut(2_300, 2_600, true) }, always);
    expect(bark?.trigger).toBe('payoff');
    expect(GAUNTLET[FOREMAN]?.boss?.barks?.payoff).toContain(bark?.line);
  });

  it('does not repeat the last line when the pool has others', () => {
    const pool = GAUNTLET[FOREMAN]?.boss?.barks?.payoff ?? [];
    const last = pool[0] ?? null;
    for (let i = 0; i < 20; i++) {
      const bark = pickBossBark({ ...base, cut: cut(2_300, 2_600, true), lastLine: last }, () => i / 20);
      expect(bark?.line).not.toBe(last);
    }
  });

  it('bosses with no barks stay silent', () => {
    expect(pickBossBark({ ...base, markerIndex: 5, bankrollDelta: 400 }, always)).toBeNull(); // Sarge
  });
});
