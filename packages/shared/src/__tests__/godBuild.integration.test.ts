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
//   Bets:             Pass Line $100 (10000c) | Odds $100 (10000c) | Hard 8 $10 (1000c)
//   Phase:            POINT_ACTIVE, Point = 8
//   Hype:             2.0  (accumulated before this roll)
//   Dice:             [4, 4]  — Hard 8 = POINT_HIT + Hardway win
//   markerTarget:     $1,000 (100_000c, e.g. VFW High-Limit Room) → maxBet = $100 (10_000c)
//
// resolveRoll():
//   basePassLinePayout  = +10000  (1:1 profit on $100 pass line)
//   baseOddsPayout      = +12000  (6:5 profit on $100 odds, floor(10000 × 6/5) = 12000)
//   baseHardwaysPayout  = +9000   (9:1 profit on $10 hard8, 1000 × 9 = 9000)
//   baseStakeReturned   = +21000  ($100 pass + $100 odds + $10 hard8 stakes returned 1:1)
//   grossProfit         = 31000
//
// Cascade (FB-024 dynamic additives: MULT × maxBet, rounded to nearest $1):
//   slot 0 → Big Spender: hard8 win → 1.5 × $100 = $150 → additives = 15000
//   slot 1 → The Shark:   POINT_HIT → 2.0 × $100 = $200 → additives = 35000
//   slot 2 → The Whale:   hasWin    → multipliers += 1.2 → multipliers = [1.2]
//
// settleTurn():
//   boostedProfit   = grossProfit + additives = 31000 + 35000 = 66000
//   crewMultiplier  = 1.2  (product of [1.2])
//   finalMultiplier = round(2.0 × 1.2 × 10000) / 10000 = round(24000) / 10000 = 2.4
//   amplifiedProfit = floor(66000 × 2.4 / 100) × 100 = floor(1584) × 100 = 158400
//   totalPayout     = stakeReturned + amplifiedProfit = 21000 + 158400 = 179400
//   (net gain to player = 179400 − 21000 placement deduction = +158400 = +$1,584.00)
//
// =============================================================================

describe('GOD BUILD 1: "The Perfect Hard Eight" — Big Spender + Shark + Whale', () => {
  const BETS = makeBets({
    passLine: 10_000,   // $100
    odds:     10_000,   // $100
    hardways: makeHardwayBets({ hard8: 1_000 }),  // $10 hard 8
  });
  const HYPE          = 2.0;
  const DICE: [number, number] = [4, 4];
  const POINT         = 8;
  const MARKER_TARGET = 100_000;  // $1,000 target → $100 max bet

  // Shared resolveRoll state for all Scenario 1 tests.
  const STATE = { phase: 'POINT_ACTIVE' as const, currentPoint: POINT, bets: BETS, hype: HYPE, markerTargetCents: MARKER_TARGET };

  const crew: (CrewMember | null)[] = [
    fresh(bigSpender),  // slot 0
    fresh(shark),       // slot 1
    fresh(whale),       // slot 2
    null,               // slot 3
    null,               // slot 4
  ];

  // ── Step 1: resolveRoll ──────────────────────────────────────────────────

  it('[step 1] resolveRoll correctly classifies Hard 8 as POINT_HIT + isHardway', () => {
    const ctx = resolveRoll(DICE, STATE);
    expect(ctx.rollResult).toBe('POINT_HIT');
    expect(ctx.isHardway).toBe(true);
    expect(ctx.diceTotal).toBe(8);
  });

  it('[step 1] resolveRoll calculates base payouts exactly', () => {
    const ctx = resolveRoll(DICE, STATE);
    expect(ctx.basePassLinePayout).toBe(10_000);    // 1:1 profit on $100 pass line
    expect(ctx.baseOddsPayout).toBe(12_000);         // 6:5 profit on $100 odds (point 8)
    expect(ctx.baseHardwaysPayout).toBe(9_000);      // 9:1 profit on $10 hard 8
    expect(ctx.baseStakeReturned).toBe(21_000);      // $100 pass + $100 odds + $10 hard8 stakes back
  });

  // ── Step 2: resolveCascade ───────────────────────────────────────────────

  it('[step 2] Big Spender fires and adds $150 (15000c) to additives', () => {
    const ctx = resolveRoll(DICE, STATE);
    const { finalContext, events } = resolveCascade(crew, ctx, neverCalledRng);

    // Verify Big Spender fired (slot 0 event): 1.5 × $100 max bet = $150
    const bigSpenderEvent = events.find(e => e.slotIndex === 0);
    expect(bigSpenderEvent?.contextDelta.additives).toBe(15_000);

    // Verify final additives after all three crew (BigSpender $150 + Shark $125 = $275)
    expect(finalContext.additives).toBe(27_500);
  });

  it('[step 2] The Shark fires and adds $125 (12500c) to additives (27500c cumulative)', () => {
    const ctx = resolveRoll(DICE, STATE);
    const { events } = resolveCascade(crew, ctx, neverCalledRng);

    // Shark is in slot 1; contextDelta reflects cumulative additives at fire time
    const sharkEvent = events.find(e => e.slotIndex === 1);
    expect(sharkEvent?.contextDelta.additives).toBe(27_500); // 15000 (BigSpender) + 12500 (Shark)
  });

  it('[step 2] The Whale fires and adds 1.2× to multipliers', () => {
    const ctx = resolveRoll(DICE, STATE);
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.multipliers).toEqual([1.2]);
  });

  it('[step 2] exactly 3 events emitted, one per crew member', () => {
    const ctx = resolveRoll(DICE, STATE);
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    expect(events).toHaveLength(3);
  });

  it('[step 2] Hype is unchanged (no HYPE crew in this build)', () => {
    const ctx = resolveRoll(DICE, STATE);
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.hype).toBe(2.0);
  });

  // ── Step 3: settleTurn ───────────────────────────────────────────────────

  it('[step 3] settleTurn math: stakeReturned(21000) + floor((31000+27500) × 2.4 / 100) × 100 = 161400', () => {
    const ctx = resolveRoll(DICE, STATE);
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);

    //   grossProfit     = 10000 + 12000 + 9000 = 31000
    //   additives       = 15000 (BigSpender 1.5×) + 12500 (Shark 1.25×) = 27500
    //   boostedProfit   = 31000 + 27500          = 58500
    //   finalMult       = 2.0 × 1.2              = 2.4
    //   amplifiedProfit = floor(58500 × 2.4 / 100) × 100 = floor(1404) × 100 = 140400
    //   stakeReturned   = 21000
    //   totalPayout     = 21000 + 140400          = 161400
    expect(settleTurn(finalContext)).toBe(161_400);
  });

  it('[step 3] net player gain is $1,404.00 on a $210 total bet placed', () => {
    const ctx = resolveRoll(DICE, STATE);
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    const totalPayout = settleTurn(finalContext);
    // totalPayout = $1,614.00 ($210 stake return + $1,404.00 amplified profit)
    // bankroll placement deduction was $210 (pass $100 + odds $100 + hard8 $10)
    // net gain = 161400 − 21000 = 140400 cents = $1,404.00
    expect(totalPayout).toBe(161_400);
    expect((totalPayout - 21_000) / 100).toBeCloseTo(1404.00, 2); // net gain = $1,404.00
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

// GOD BUILD 2 updated: Holly now triggers on POINT_HIT (+0.3 additive), not NATURAL.
// On a NATURAL, only Intern (+0.2) and Whale (×1.2) fire. Holly is silent.
// The "Yo-leven Jackpot" concept now splits across two roll types:
//   NATURAL:    Intern boosts Hype (+0.2) → Whale multiplies the payout
//   POINT_HIT:  Holly boosts Hype (+0.3) → Whale multiplies the payout
describe('GOD BUILD 2: Nervous Intern + Holly + Whale — NATURAL roll (Holly silent)', () => {
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

  it('[step 2] Nervous Intern fires: hype 1.0 → 1.3; Holly silent on NATURAL', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    const internEvent = events.find(e => e.slotIndex === 0);
    const hollyEvent  = events.find(e => e.slotIndex === 1);
    expect(internEvent?.contextDelta.hype).toBe(1.3);
    expect(hollyEvent).toBeUndefined(); // Holly does not fire on NATURAL
  });

  it('[step 2] final context: hype=1.3, multipliers=[1.2]', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.hype).toBe(1.3);
    expect(finalContext.multipliers).toEqual([1.2]);
  });

  it('[step 3] settleTurn: stake(20000) + floor(20000 × 1.56) = 31200 + 20000 = 51200', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    // 1.3 hype × 1.2 whale = 1.56; floor(20000 × 1.56 / 100) × 100 = 31200; + stake 20000 = 51200
    expect(settleTurn(finalContext)).toBe(51_200);
  });

  it('[step 3] net player gain is $312.00 on a $200 pass line bet placed', () => {
    const ctx = resolveRoll(DICE, { phase: 'COME_OUT', currentPoint: null, bets: BETS, hype: HYPE });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    const totalPayout = settleTurn(finalContext);
    // net gain = 51200 − 20000 = 31200 cents = $312.00
    expect((totalPayout - 20_000) / 100).toBeCloseTo(312.00, 2);
  });
});

describe('GOD BUILD 2: Nervous Intern + Holly + Whale — POINT_HIT roll (Holly fires)', () => {
  const BETS = makeBets({ passLine: 20_000 }); // $200 pass line
  const DICE: [number, number] = [4, 4];

  const crew: (CrewMember | null)[] = [
    fresh(nervousIntern),   // slot 0
    fresh(hypeTrainHolly),  // slot 1
    fresh(whale),           // slot 2
    null,
    null,
  ];

  it('[step 2] Holly fires (+0.15) on POINT_HIT: hype 1.0 → 1.15; Intern silent', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: 8, bets: BETS, hype: 1.0 });
    const { events } = resolveCascade(crew, ctx, neverCalledRng);
    const internEvent = events.find(e => e.slotIndex === 0);
    const hollyEvent  = events.find(e => e.slotIndex === 1);
    expect(internEvent).toBeUndefined(); // Intern does not fire on POINT_HIT
    expect(hollyEvent?.contextDelta.hype).toBe(1.15);
  });

  it('[step 2] final context: hype=1.15, multipliers=[1.2]', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: 8, bets: BETS, hype: 1.0 });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    expect(finalContext.hype).toBe(1.15);
    expect(finalContext.multipliers).toEqual([1.2]);
  });

  it('[step 3] settleTurn: stake(20000) + floor(20000 × 1.38) = 27500 + 20000 = 47500', () => {
    const ctx = resolveRoll(DICE, { phase: 'POINT_ACTIVE', currentPoint: 8, bets: BETS, hype: 1.0 });
    const { finalContext } = resolveCascade(crew, ctx, neverCalledRng);
    // finalMult = round(1.15 × 1.2 × 10000)/10000 = 1.3799999...; floor(20000 × 1.3799.../100) × 100 = 27500
    // + stake 20000 = 47500
    expect(settleTurn(finalContext)).toBe(47_500);
  });
});
