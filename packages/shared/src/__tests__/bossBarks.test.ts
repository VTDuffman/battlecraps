import { describe, it, expect } from 'vitest';
import { deriveBossBarkEvents, selectBossBarkTrigger, pickBossBark, type BossBarkInput } from '../bossBarks.js';
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
    expect(pickBossBark({ ...base, markerIndex: 20, bankrollDelta: 400 }, always)).toBeNull(); // The Commander (no barks yet)
  });
});

describe('Sarge (FB-033): Double Time clock events', () => {
  const SARGE = 5;
  const sarge: BossBarkInput = { ...base, markerIndex: SARGE };

  it('point set starts the clock → pointSet', () => {
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'POINT_SET', newPhase: 'POINT_ACTIVE', newBossPointHits: 0 }, never)).toBe('pointSet');
  });

  it('2 rolls left → clockLow, 1 roll left → lastRoll (after the 4th and 5th blanks)', () => {
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'NO_RESOLUTION', newPhase: 'POINT_ACTIVE', newBossPointHits: 4 }, never)).toBe('clockLow');
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'NO_RESOLUTION', newPhase: 'POINT_ACTIVE', newBossPointHits: 5 }, never)).toBe('lastRoll');
  });

  it('other blanks are quiet (no event, no win/loss)', () => {
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'NO_RESOLUTION', newPhase: 'POINT_ACTIVE', newBossPointHits: 2 }, always)).toBeNull();
  });

  it('hitting the point → beatClock, even over a showing bark and beating the win line', () => {
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'POINT_HIT', newPhase: 'COME_OUT', bankrollDelta: 1_000, barkShowing: true }, always)).toBe('beatClock');
  });

  it("the clock running out → timeUp (beats the loss line)", () => {
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'SEVEN_OUT', newPhase: 'COME_OUT', clockExpired: true, isLoss: true }, always)).toBe('timeUp');
  });

  it('TIME\'S UP on the last shooter is silent (defeat cinematic)', () => {
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'SEVEN_OUT', clockExpired: true, isLoss: true, isGameOver: true }, always)).toBeNull();
  });

  it('a natural is a chance-based win; craps a chance-based loss', () => {
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'NATURAL', newPhase: 'COME_OUT', bankrollDelta: 1_000 }, always)).toBe('win');
    expect(selectBossBarkTrigger({ ...sarge, rollResult: 'CRAPS_OUT', newPhase: 'COME_OUT', bankrollDelta: -1_000, isLoss: true }, always)).toBe('loss');
  });

  it('pickBossBark returns a line from the matching Sarge pool', () => {
    const bark = pickBossBark({ ...sarge, rollResult: 'NO_RESOLUTION', newPhase: 'POINT_ACTIVE', newBossPointHits: 5 }, always);
    expect(bark?.trigger).toBe('lastRoll');
    expect(GAUNTLET[SARGE]?.boss?.barks?.lastRoll).toContain(bark?.line);
  });
});

describe('deriveBossBarkEvents', () => {
  it('bosses without event rules derive nothing', () => {
    expect(deriveBossBarkEvents({ ...base, markerIndex: 11, rollResult: 'POINT_HIT' })).toEqual([]); // The Executive
  });
});

describe('Mme. Le Prix (FB-034): charm events', () => {
  const LE_PRIX = 8;
  const leprix: BossBarkInput = { ...base, markerIndex: LE_PRIX };

  it('charmFired (the heartbeat) always barks, over a showing bark and over a win', () => {
    expect(selectBossBarkTrigger({ ...leprix, charmFired: true, charmedSlotBefore: 0, charmedSlotAfter: 2, bankrollDelta: 500, barkShowing: true }, never)).toBe('charmFired');
  });

  it('a re-charm that moves the heart barks only by chance', () => {
    const moved = { ...leprix, rollResult: 'NATURAL' as const, charmedSlotBefore: 0, charmedSlotAfter: 2 };
    expect(selectBossBarkTrigger(moved, always)).toBe('charmed');
    expect(selectBossBarkTrigger(moved, never)).toBeNull();          // skipped → silence, no win/loss fallback
  });

  it('a re-charm never talks over a showing bark', () => {
    expect(selectBossBarkTrigger({ ...leprix, charmedSlotBefore: 0, charmedSlotAfter: 2, barkShowing: true }, always)).toBeNull();
  });

  it('when the heart stays put, plain win / loss lines can play', () => {
    expect(selectBossBarkTrigger({ ...leprix, charmedSlotBefore: 1, charmedSlotAfter: 1, bankrollDelta: 500 }, always)).toBe('win');
    expect(selectBossBarkTrigger({ ...leprix, charmedSlotBefore: 1, charmedSlotAfter: 1, bankrollDelta: -500, isLoss: true }, always)).toBe('loss');
  });

  it('picks from her charmFired pool', () => {
    const bark = pickBossBark({ ...leprix, charmFired: true }, always);
    expect(GAUNTLET[LE_PRIX]?.boss?.barks?.charmFired).toContain(bark?.line);
  });
});

describe('The Executive (FB-035): performance review events', () => {
  const EXEC = 11;
  const exec: BossBarkInput = { ...base, markerIndex: EXEC };

  it('reaching Exceptional / Action Required always barks, even over a showing bark', () => {
    expect(selectBossBarkTrigger({ ...exec, bankrollDelta: 500, ratingBefore: 3, ratingAfter: 4, barkShowing: true }, never)).toBe('promoted');
    expect(selectBossBarkTrigger({ ...exec, bankrollDelta: -500, isLoss: true, ratingBefore: 1, ratingAfter: 0, barkShowing: true }, never)).toBe('finalWarning');
  });

  it('the Exceptional bonus barks half the time, never over a showing bark', () => {
    const paid = { ...exec, bankrollDelta: 900, ratingBefore: 4, ratingAfter: 4, exceptionalBonusCents: 300 };
    expect(selectBossBarkTrigger(paid, always)).toBe('bonusPaid');
    expect(selectBossBarkTrigger(paid, never)).toBeNull();
    expect(selectBossBarkTrigger({ ...paid, barkShowing: true }, always)).toBeNull();
  });

  it('ordinary rating moves bark by chance; a skip is silence', () => {
    expect(selectBossBarkTrigger({ ...exec, bankrollDelta: 500, ratingBefore: 2, ratingAfter: 3 }, always)).toBe('ratingUp');
    expect(selectBossBarkTrigger({ ...exec, bankrollDelta: -500, isLoss: true, ratingBefore: 2, ratingAfter: 1 }, always)).toBe('ratingDown');
    expect(selectBossBarkTrigger({ ...exec, bankrollDelta: 500, ratingBefore: 2, ratingAfter: 3 }, never)).toBeNull();
  });

  it('an unchanged rating with no bonus derives no events', () => {
    expect(deriveBossBarkEvents({ ...exec, ratingBefore: 2, ratingAfter: 2 })).toEqual([]);
    expect(deriveBossBarkEvents({ ...exec, ratingBefore: null, ratingAfter: 2 })).toEqual([]);
  });

  it('PIP termination (game over) is silent', () => {
    expect(selectBossBarkTrigger({ ...exec, isLoss: true, isGameOver: true, ratingBefore: 0, ratingAfter: 0 }, always)).toBeNull();
  });
});

describe('The Hierophant (FB-036): offering bowl events', () => {
  const HIERO = 14;   // target $100,000 → a big offering is ≥ $10,000 held
  const hiero: BossBarkInput = { ...base, markerIndex: HIERO };
  const escrow = (heldCents: number, releasedCents: number, seizedCents: number) => ({ heldCents, releasedCents, seizedCents });

  it('a seizure always speaks, even over a showing bark', () => {
    expect(selectBossBarkTrigger({ ...hiero, isLoss: true, escrow: escrow(0, 375_000, 125_000), barkShowing: true }, never)).toBe('tributeSeized');
  });

  it('a newly big offering barks half the time; an already-big one does not re-trigger', () => {
    const big = { ...hiero, escrowBeforeCents: 200_000, escrow: escrow(1_200_000, 0, 0) };
    expect(selectBossBarkTrigger(big, always)).toBe('bigOffering');
    expect(selectBossBarkTrigger(big, never)).toBeNull();
    expect(deriveBossBarkEvents({ ...big, escrowBeforeCents: 1_100_000 })).toEqual([]);
  });

  it('a release barks by chance; a skip is silence (no win fallback)', () => {
    const rel = { ...hiero, bankrollDelta: 400_000, escrow: escrow(0, 100_000, 0) };
    expect(selectBossBarkTrigger(rel, always)).toBe('escrowReleased');
    expect(selectBossBarkTrigger(rel, never)).toBeNull();
  });

  it('no escrow movement falls back to chance win / loss', () => {
    expect(selectBossBarkTrigger({ ...hiero, bankrollDelta: 300_000, escrow: escrow(0, 0, 0) }, always)).toBe('win');
  });
});

describe('The Sovereign (FB-037): tide events', () => {
  const SOV = 17;
  const sov: BossBarkInput = { ...base, markerIndex: SOV };

  it('the wave and the undertow always speak, even over a showing bark', () => {
    expect(selectBossBarkTrigger({ ...sov, isLoss: true, tide: { stage: 2, nextStage: 3, waveShooters: 2 }, barkShowing: true }, never)).toBe('waveHit');
    expect(selectBossBarkTrigger({ ...sov, isLoss: true, tide: { stage: 1, nextStage: 2, undertowCents: 7_000_000 }, barkShowing: true }, never)).toBe('undertowHit');
  });

  it('a wave The Covenant turned back is silent about the wave', () => {
    expect(deriveBossBarkEvents({ ...sov, tide: { stage: 2, nextStage: 3, waveShooters: 0 } })).toEqual([]);
  });

  it('the turn to High Tide speaks half the time', () => {
    const turning = { ...sov, bankrollDelta: 500, tide: { stage: 1, nextStage: 2 } };
    expect(selectBossBarkTrigger(turning, always)).toBe('highTide');
    expect(selectBossBarkTrigger(turning, never)).toBeNull();
  });

  it('a stage that holds (a blank or a point set) derives nothing', () => {
    expect(deriveBossBarkEvents({ ...sov, tide: { stage: 2, nextStage: 2 } })).toEqual([]);
  });

  it('a wave that ends the run is silent (the defeat moment owns it)', () => {
    expect(selectBossBarkTrigger({ ...sov, isLoss: true, isGameOver: true, tide: { stage: 2, nextStage: 3, waveShooters: 2 } }, always)).toBeNull();
  });
});

describe('bark copy is gender-neutral (CLAUDE.md copy rule)', () => {
  // Player and crew references must be neutral; bosses never refer to the
  // player or a crew member with a gendered word.
  const GENDERED = /\b(he|him|his|she|her|hers|boy|girl|guy|lady|man|sir|ma'am|son|lad|fella)\b/i;

  it('no boss bark line uses a gendered word', () => {
    const offenders: string[] = [];
    GAUNTLET.forEach((m) => {
      Object.values(m.boss?.barks ?? {}).forEach((lines) => {
        (lines ?? []).forEach((line) => { if (GENDERED.test(line)) offenders.push(`${m.boss?.name}: ${line}`); });
      });
    });
    expect(offenders).toEqual([]);
  });
});
