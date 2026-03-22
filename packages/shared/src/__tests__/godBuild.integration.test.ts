// =============================================================================
// GOD BUILD — Integration Tests
// src/__tests__/godBuild.integration.test.ts
//
// Two "God Build" scenarios that simulate maximum-crew synergy and verify
// every step of the integer-cent math is exact.
//
// SCENARIO 1: "The Perfect Hard Eight"
//   Crew: Big Spender → Shark → Whale
//   Dice: [4,4] = Hard 8 = POINT_HIT + Hard 8 win
//   Hype: 2.0 (built up over several rolls)
//   Expected: $1,224.00 net win on a $210 total bet
//
// SCENARIO 2: "The Yo-leven Jackpot"
//   Crew: Nervous Intern → Hype-Train Holly → Whale
//   Dice: [5,6] = Yo-leven NATURAL
//   Hype: 1.0 (fresh run)
//   Expected: $432.00 net win on a $200 pass line bet
// =============================================================================

import { describe, it, expect } from 'vitest';
import { resolveCascade } from '../cascade.js';
import { resolveRoll, settleTurn } from '../crapsEngine.js';
import { bigSpender }     from '../crew/bigSpender.js';
import { shark }          from '../crew/shark.js';
import { whale }          from '../crew/whale.js';
import { nervousIntern }  from '../crew/nervousIntern.js';
import { hypeTrainHolly } from '../crew/hypeTrainHolly.js';
import { makeBets, makeHardwayBets, neverCalledRng } from './helpers.js';
import type { CrewMember } from '../types.js';

function fresh<T extends CrewMember>(c: T): T {
  return { ...c, cooldownState: 0 };
}

// =============================================================================
// SCENARIO 1: "The Perfect Hard Eight"
// =============================================================================
//
// Setup:
//   Bets:  Pass Line $100 (10000c) | Odds $100 (10000c) | Hard 8 $10 (1000c)
//   Phase: POINT_ACTIVE, Point = 8
//   Hype:  2.0  (accumulated before this roll)
//   Dice:  [4, 4]  — Hard 8 = POINT_HIT + Hardway win
//
// resolveRoll():
//   basePassLinePayout  = +10000  (1:1 profit on $100 pass line)
//   baseOddsPayout      = +12000  (6:5 profit on $100 odds, floor(10000 × 6/5) = 12000)
//   baseHardwaysPayout  = +9000   (9:1 profit on $10 hard8, 1000 × 9 = 9000)
//   baseStakeReturned   = +21000  ($100 pass + $100 odds + $10 hard8 stakes returned 1:1)
//   grossProfit         = 31000
//
// Cascade:
//   slot 0 → Big Spender: hard8 win (9000 > 0) → additives += 10000 → additives = 10000
//   slot 1 → The Shark:   POINT_HIT            → additives += 10000 → additives = 20000
//   slot 2 → The Whale:   hasWin               → multipliers += 1.2 → multipliers = [1.2]
//
// settleTurn():
//   boostedProfit   = grossProfit + additives = 31000 + 20000 = 51000
//   crewMultiplier  = 1.2  (product of [1.2])
//   finalMultiplier = round(2.0 × 1.2 × 10000) / 10000 = round(24000) / 10000 = 2.4
//   amplifiedProfit = floor(51000 × 2.4) = floor(122400) = 122400
//   totalPayout     = stakeReturned + amplifiedProfit = 21000 + 122400 = 143400
//   (net gain to player = 143400 − 21000 placement deduction = +122400 = +$1,224.00)
//
// =============================================================================

describe('GOD BUILD 1: "The Perfect Hard Eight" — Big Spender + Shark + Whale', () => {
  const BETS = makeBets({
    passLine: 10_000,   // $100
    odds:     10_000,   // $100
    hardways: makeHardwayBets({ hard8: 1_000 }),  // $10 hard 8
  });
  const HYPE   = 2.0;
  const DICE: [number, number] = [4, 4];
  const POINT  = 8;

  const crew: (CrewMember | null)[] = [
    fresh(bigSpender),  // slot 0
    fresh(shark),       // slot 1
    fresh(whale),       // slot 2
    null,               // slot 3
    null,               // slot 4
  ];

  // ── Step 1: resolveRoll ──────────────────────────────────────────────────

  it('[step 1] resolveRoll correctly classifies Hard 8 as POINT_HIT + isHardway', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    expect(ctx.rollResult).toBe('POINT_HIT');
    expect(ctx.isHardway).toBe(true);
    expect(ctx.diceTotal).toBe(8);
  });

  it('[step 1] resolveRoll calculates base payouts exactly', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    expect(ctx.basePassLinePayout).toBe(10_000);    // 1:1 profit on $100 pass line
    expect(ctx.baseOddsPayout).toBe(12_000);         // 6:5 profit on $100 odds (point 8)
    expect(ctx.baseHardwaysPayout).toBe(9_000);      // 9:1 profit on $10 hard 8
    expect(ctx.baseStakeReturned).toBe(21_000);      // $100 pass + $100 odds + $10 hard8 stakes back
  });

  // ── Step 2: resolveCascade ───────────────────────────────────────────────

  it('[step 2] Big Spender fires and adds $100 (10000c) to additives', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    const { finalContext, events } = resolveCascade(crew, ctx, neverCalledRng);

    // Verify Big Spender fired (slot 0 event)
    const bigSpenderEvent = events.find(e => e.slotIndex === 0);
    expect(bigSpenderEvent?.contextDelta.additives).toBe(10_000);

    // Verify final additives after all three crew
    expect(finalContext.additives).toBe(20_000); // 10000 + 10000
  });

  it('[step 2] The Shark fires and adds $100 (10000c) to additives', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    const { events } = resolveCascade(crew, ctx, neverCalledRng);

    const sharkEvent = events.find(e => e.slotIndex === 1);
    expect(sharkEvent?.contextDelta.additives).toBe(20_000); // cumulative delta at Shark's fire
  });

  it('[step 2] The Whale fires and adds 1.2× to multipliers', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.multipliers).toEqual([1.2]);
  });

  it('[step 2] exactly 3 events emitted, one per crew member', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(events).toHaveLength(3);
  });

  it('[step 2] Hype is unchanged (no HYPE crew in this build)', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.hype).toBe(2.0);
  });

  // ── Step 3: settleTurn ───────────────────────────────────────────────────

  it('[step 3] settleTurn math: stakeReturned(21000) + floor((31000+20000) × 2.4) = 143400', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    //   grossProfit    = 10000 + 12000 + 9000 = 31000
    //   boostedProfit  = 31000 + 20000        = 51000
    //   finalMult      = 2.0 × 1.2            = 2.4
    //   amplifiedProfit = floor(51000 × 2.4)  = 122400
    //   stakeReturned  = 21000
    //   totalPayout    = 21000 + 122400        = 143400
    expect(settleTurn(finalContext)).toBe(143_400);
  });

  it('[step 3] net player gain is $1,224.00 on a $210 total bet placed', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: POINT, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    const totalPayout = settleTurn(finalContext);
    // totalPayout = $1,434.00 ($210 stake return + $1,224.00 amplified profit)
    // bankroll placement deduction was $210 (pass $100 + odds $100 + hard8 $10)
    // net gain = 143400 − 21000 = 122400 cents = $1,224.00
    expect(totalPayout).toBe(143_400);
    expect((totalPayout - 21_000) / 100).toBeCloseTo(1224.00, 2); // net gain = $1,224.00
  });
});

// =============================================================================
// SCENARIO 2: "The Yo-leven Jackpot"
// =============================================================================
//
// Setup:
//   Bets:  Pass Line $200 (20000c) | No odds | No hardways
//   Phase: COME_OUT
//   Hype:  1.0  (fresh shooter)
//   Dice:  [5, 6] — Yo-leven (11) = NATURAL
//
// resolveRoll():
//   basePassLinePayout = +20000  (1:1 profit on $200 pass line)
//   baseOddsPayout     = 0       (no odds in COME_OUT)
//   baseHardwaysPayout = 0
//   baseStakeReturned  = +20000  ($200 pass line stake returned)
//
// Cascade:
//   slot 0 → Nervous Intern: NATURAL            → hype += 0.2 → hype = 1.2
//   slot 1 → Hype-Train Holly: NATURAL + total=11 → hype × 1.5 → hype = 1.8
//   slot 2 → The Whale: hasWin                  → multipliers += 1.2
//
// settleTurn():
//   boostedProfit   = 20000 + 0 = 20000
//   crewMultiplier  = 1.2
//   finalMultiplier = round(1.8 × 1.2 × 10000) / 10000 = round(21600) / 10000 = 2.16
//   amplifiedProfit = floor(20000 × 2.16) = floor(43200) = 43200
//   totalPayout     = stakeReturned(20000) + amplifiedProfit(43200) = 63200
//   (net gain to player = 63200 − 20000 placement deduction = +43200 = +$432.00)
//
// =============================================================================

describe('GOD BUILD 2: "The Yo-leven Jackpot" — Nervous Intern + Holly + Whale', () => {
  const BETS = makeBets({ passLine: 20_000 }); // $200 pass line
  const HYPE = 1.0;
  const DICE: [number, number] = [5, 6];

  const crew: (CrewMember | null)[] = [
    fresh(nervousIntern),   // slot 0
    fresh(hypeTrainHolly),  // slot 1
    fresh(whale),           // slot 2
    null,
    null,
  ];

  it('[step 1] resolveRoll classifies [5,6] in COME_OUT as NATURAL', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    expect(ctx.rollResult).toBe('NATURAL');
    expect(ctx.diceTotal).toBe(11);
  });

  it('[step 2] Nervous Intern fires: hype 1.0 → 1.2', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    const internEvent = events.find(e => e.slotIndex === 0);
    expect(internEvent?.contextDelta.hype).toBe(1.2);
  });

  it('[step 2] Holly fires on Yo-leven: hype 1.2 → 1.8 (rounded, not 1.7999...)', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    const hollyEvent = events.find(e => e.slotIndex === 1);
    expect(hollyEvent?.contextDelta.hype).toBe(1.8);
  });

  it('[step 2] final context: hype=1.8, multipliers=[1.2]', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.hype).toBe(1.8);
    expect(finalContext.multipliers).toEqual([1.2]);
  });

  it('[step 3] settleTurn: stake(20000) + floor(20000 × 2.16) = 63200 (validates float rounding fix)', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    // Key: 1.8 × 1.2 = 2.1599... in IEEE-754.
    // Our fix: round(1.8 × 1.2 × 10000) / 10000 = 2.16 exactly.
    // floor(20000 × 2.16) = 43200; + stake 20000 = 63200
    expect(settleTurn(finalContext)).toBe(63_200);
  });

  it('[step 3] net player gain is $432.00 on a $200 pass line bet placed', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    const totalPayout = settleTurn(finalContext);
    // totalPayout = $632.00 ($200 stake return + $432.00 amplified profit)
    // net gain = 63200 − 20000 = 43200 cents = $432.00
    expect((totalPayout - 20_000) / 100).toBeCloseTo(432.00, 2);
  });
});
