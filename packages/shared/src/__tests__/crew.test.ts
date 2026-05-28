// =============================================================================
// CREW EXECUTE() UNIT TESTS
// packages/shared/src/__tests__/crew.test.ts
//
// One describe block per crew member (grouped by ID). Tests cover:
//   - Activation guard: crew does NOT fire when condition isn't met
//   - Happy path: crew fires and changes context correctly
//   - Edge cases: additive math, rounding, flag states
//   - Immutability: crew must not mutate ctx
//
// Uses markerTargetCents=10_000 ($100 target, maxBet=1000) for additive tests
// unless a specific target is needed to verify scaling.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { makeCtx, makeBets, makeHardwayBets, neverCalledRng, fixedDice } from './helpers.js';

// Crew imports — pull the actual execute() under test
import { lefty } from '../crew/lefty.js';
import { physicsProfessor } from '../crew/physicsProfessor.js';
import { mechanic } from '../crew/mechanic.js';
import { mathlete } from '../crew/mathlete.js';
import { floorWalker } from '../crew/floorWalker.js';
import { regular } from '../crew/regular.js';
import { bigSpender } from '../crew/bigSpender.js';
import { shark } from '../crew/shark.js';
import { whale } from '../crew/whale.js';
import { nervousIntern } from '../crew/nervousIntern.js';
import { hypeTrainHolly } from '../crew/hypeTrainHolly.js';
import { drunkUncle } from '../crew/drunkUncle.js';
import { mimic } from '../crew/mimic.js';
import { oldPro } from '../crew/oldPro.js';
import { luckyCharm } from '../crew/luckyCharm.js';
import { lookout } from '../crew/lookout.js';
import { aceMcgee } from '../crew/aceMcgee.js';
import { closeCall } from '../crew/closeCall.js';
import { momentum } from '../crew/momentum.js';
import { echo } from '../crew/echo.js';
import { silverLining } from '../crew/silverLining.js';
import { oddCouple } from '../crew/oddCouple.js';
import { evenKeel } from '../crew/evenKeel.js';
import { doorman } from '../crew/doorman.js';
import { grinder } from '../crew/grinder.js';
import { handicapper } from '../crew/handicapper.js';
import { mirror } from '../crew/mirror.js';
import { bookkeeper } from '../crew/bookkeeper.js';
import { pressureCooker } from '../crew/pressureCooker.js';
import { contrarian } from '../crew/contrarian.js';

// ---------------------------------------------------------------------------
// Shared test context parameters
// ---------------------------------------------------------------------------

// markerTargetCents=10_000 ($100 target) → maxBet = floor(10000*0.10) = 1000
const TARGET = 10_000;
const MAX_BET = Math.floor(TARGET * 0.10); // 1000

// ---------------------------------------------------------------------------
// ID 1 — Lefty
// ---------------------------------------------------------------------------

describe('Lefty (ID 1)', () => {
  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL' });
    const result = lefty.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on POINT_HIT', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT' });
    const result = lefty.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on CRAPS_OUT', () => {
    const ctx = makeCtx({ rollResult: 'CRAPS_OUT' });
    const result = lefty.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on SEVEN_OUT and re-rolls the dice', () => {
    // Re-roll [2,3]=5 — not a seven, so sevenOutBlocked=true
    const ctx = makeCtx({
      rollResult:  'SEVEN_OUT',
      activePoint: 5,
      bets:        makeBets({ passLine: 500, odds: 1000 }),
      markerTargetCents: TARGET,
    });
    const result = lefty.execute(ctx, fixedDice(2, 3));
    expect(result.context.flags.sevenOutBlocked).toBe(true);
    expect(result.context.dice).toEqual([2, 3]);
    expect(result.newCooldown).toBe(1);
  });

  it('re-roll that hits point → POINT_HIT, sevenOutBlocked is still true (Lefty always signals)', () => {
    // activePoint=8, re-roll [4,4]=8 → POINT_HIT
    // sevenOutBlocked is ALWAYS true when Lefty fires — it signals Lefty intervened
    const ctx = makeCtx({
      rollResult:  'SEVEN_OUT',
      activePoint: 8,
      bets:        makeBets({ passLine: 500, odds: 1000 }),
      markerTargetCents: TARGET,
    });
    const result = lefty.execute(ctx, fixedDice(4, 4));
    expect(result.context.rollResult).toBe('POINT_HIT');
    expect(result.context.flags.sevenOutBlocked).toBe(true);
    expect(result.newCooldown).toBe(1);
  });

  it('preserves additives and multipliers from earlier cascade steps', () => {
    const ctx = makeCtx({
      rollResult:  'SEVEN_OUT',
      activePoint: 6,
      additives:   1000,
      multipliers: [1.5],
      bets:        makeBets({ passLine: 100 }),
      markerTargetCents: TARGET,
    });
    const result = lefty.execute(ctx, fixedDice(3, 2));
    expect(result.context.additives).toBe(1000);
    expect(result.context.multipliers).toEqual([1.5]);
  });

  it('newCooldown is 1 (per_roll)', () => {
    const ctx = makeCtx({
      rollResult:  'SEVEN_OUT',
      activePoint: 4,
      bets:        makeBets({ passLine: 100 }),
      markerTargetCents: TARGET,
    });
    const result = lefty.execute(ctx, fixedDice(2, 3));
    expect(result.newCooldown).toBe(1);
  });

  it('does not mutate ctx', () => {
    const ctx = makeCtx({
      rollResult:  'SEVEN_OUT',
      activePoint: 6,
      bets:        makeBets({ passLine: 100 }),
      markerTargetCents: TARGET,
    });
    const originalFlags = { ...ctx.flags };
    lefty.execute(ctx, fixedDice(2, 3));
    expect(ctx.flags).toEqual(originalFlags);
  });
});

// ---------------------------------------------------------------------------
// ID 2 — Physics Professor
// ---------------------------------------------------------------------------

describe('Physics Professor (ID 2)', () => {
  it('does not fire during come-out (activePoint=null)', () => {
    const ctx = makeCtx({ activePoint: null, rollResult: 'NATURAL', dice: [3, 4], diceTotal: 7 });
    const result = physicsProfessor.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on non-paired dice', () => {
    const ctx = makeCtx({
      activePoint: 8,
      rollResult:  'NO_RESOLUTION',
      dice:        [3, 4],
      diceTotal:   7,
    });
    const result = physicsProfessor.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire when dice already equal the point', () => {
    // [4,4]=8 with activePoint=8 — already a POINT_HIT, no nudge needed
    const ctx = makeCtx({
      activePoint:  8,
      rollResult:   'POINT_HIT',
      dice:         [4, 4],
      diceTotal:    8,
      isHardway:    true,
    });
    const result = physicsProfessor.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('nudges [3,3]=6 toward point 8 → [4,4]=8 POINT_HIT', () => {
    const ctx = makeCtx({
      activePoint:  8,
      rollResult:   'NO_RESOLUTION',
      dice:         [3, 3],
      diceTotal:    6,
      isHardway:    true,
      bets:         makeBets({ passLine: 500, odds: 1000 }),
      markerTargetCents: TARGET,
    });
    const result = physicsProfessor.execute(ctx, neverCalledRng);
    expect(result.context.dice).toEqual([4, 4]);
    expect(result.context.diceTotal).toBe(8);
    expect(result.context.rollResult).toBe('POINT_HIT');
    expect(result.context.isHardway).toBe(true);
  });

  it('nudges [3,3]=6 toward point 4 → [2,2]=4 POINT_HIT', () => {
    const ctx = makeCtx({
      activePoint:  4,
      rollResult:   'NO_RESOLUTION',
      dice:         [3, 3],
      diceTotal:    6,
      isHardway:    true,
      bets:         makeBets({ passLine: 500, odds: 500 }),
      markerTargetCents: TARGET,
    });
    const result = physicsProfessor.execute(ctx, neverCalledRng);
    expect(result.context.dice).toEqual([2, 2]);
    expect(result.context.diceTotal).toBe(4);
    expect(result.context.rollResult).toBe('POINT_HIT');
  });

  it('sets nudgedFrom flag on the modified context', () => {
    const ctx = makeCtx({
      activePoint:  8,
      rollResult:   'NO_RESOLUTION',
      dice:         [3, 3],
      diceTotal:    6,
      isHardway:    true,
      bets:         makeBets({ passLine: 500 }),
      markerTargetCents: TARGET,
    });
    const result = physicsProfessor.execute(ctx, neverCalledRng);
    expect(result.context.flags.nudgedFrom).toEqual([3, 3]);
  });

  it('newCooldown is 0', () => {
    const ctx = makeCtx({
      activePoint:  6,
      rollResult:   'NO_RESOLUTION',
      dice:         [2, 2],
      diceTotal:    4,
      isHardway:    true,
      bets:         makeBets({ passLine: 200 }),
      markerTargetCents: TARGET,
    });
    const result = physicsProfessor.execute(ctx, neverCalledRng);
    expect(result.newCooldown).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ID 3 — The Mechanic
// ---------------------------------------------------------------------------

describe('Mechanic (ID 3)', () => {
  it('execute() is a no-op — returns ctx unchanged on any roll', () => {
    const scenarios = [
      makeCtx({ rollResult: 'NATURAL' }),
      makeCtx({ rollResult: 'SEVEN_OUT' }),
      makeCtx({ rollResult: 'POINT_HIT' }),
      makeCtx({ rollResult: 'NO_RESOLUTION' }),
    ];

    scenarios.forEach((ctx) => {
      const result = mechanic.execute(ctx, neverCalledRng);
      expect(result.context).toBe(ctx);
      expect(result.newCooldown).toBe(0);
    });
  });

  it('has per_shooter cooldown type', () => {
    expect(mechanic.cooldownType).toBe('per_shooter');
  });
});

// ---------------------------------------------------------------------------
// ID 4 — The Mathlete
// ---------------------------------------------------------------------------

describe('Mathlete (ID 4)', () => {
  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({
      rollResult:  'SEVEN_OUT',
      diceTotal:   7,
      dice:        [3, 4],
      isHardway:   false,
      bets:        makeBets({ hardways: makeHardwayBets({ hard8: 100 }) }),
      markerTargetCents: TARGET,
    });
    const result = mathlete.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on a non-hardway total (diceTotal=5)', () => {
    const ctx = makeCtx({
      rollResult: 'NO_RESOLUTION',
      dice:       [2, 3],
      diceTotal:  5,
      isHardway:  false,
      bets:       makeBets({ hardways: makeHardwayBets({ hard4: 100 }) }),
    });
    const result = mathlete.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on a hardway WIN (isHardway=true)', () => {
    const ctx = makeCtx({
      rollResult: 'POINT_HIT',
      dice:       [4, 4],
      diceTotal:  8,
      isHardway:  true,
      bets:       makeBets({ hardways: makeHardwayBets({ hard8: 100 }) }),
    });
    const result = mathlete.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire when no hardway bet is active on the soft roll', () => {
    const ctx = makeCtx({
      rollResult:  'NO_RESOLUTION',
      dice:        [2, 4],
      diceTotal:   6,
      isHardway:   false,
      bets:        makeBets({ hardways: makeHardwayBets({ hard8: 100 }) }), // hard6 is 0
      markerTargetCents: TARGET,
    });
    const result = mathlete.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on soft 6 with active hard6 bet → restores hard6 in resolvedBets', () => {
    const ctx = makeCtx({
      rollResult:   'NO_RESOLUTION',
      dice:         [2, 4],
      diceTotal:    6,
      isHardway:    false,
      bets:         makeBets({ hardways: makeHardwayBets({ hard6: 200 }) }),
      resolvedBets: makeBets({ hardways: makeHardwayBets({ hard6: 0 }) }), // cleared by engine
      flags: {
        sevenOutBlocked:   false,
        passLineProtected: false,
        hardwayProtected:  false,
        instantLoss:       false,
      },
      additives:         0,
      markerTargetCents: TARGET,
    });
    const result = mathlete.execute(ctx, neverCalledRng);
    expect(result.context.resolvedBets.hardways.hard6).toBe(200);
    expect(result.context.flags.hardwayProtected).toBe(true);
    expect(result.context.additives).toBe(300);
    expect(result.newCooldown).toBe(0);
  });

  it('fires on soft 8 with active hard8 bet', () => {
    const ctx = makeCtx({
      rollResult:   'NO_RESOLUTION',
      dice:         [3, 5],
      diceTotal:    8,
      isHardway:    false,
      bets:         makeBets({ hardways: makeHardwayBets({ hard8: 300 }) }),
      resolvedBets: makeBets({ hardways: makeHardwayBets({ hard8: 0 }) }),
      flags: {
        sevenOutBlocked:   false,
        passLineProtected: false,
        hardwayProtected:  false,
        instantLoss:       false,
      },
    });
    const result = mathlete.execute(ctx, neverCalledRng);
    expect(result.context.resolvedBets.hardways.hard8).toBe(300);
    expect(result.context.flags.hardwayProtected).toBe(true);
  });

  it('fires on soft 8 with markerTarget — saves bet AND adds 0.25× maxBet additive', () => {
    const ctx = makeCtx({
      rollResult:   'NO_RESOLUTION',
      dice:         [3, 5],
      diceTotal:    8,
      isHardway:    false,
      bets:         makeBets({ hardways: makeHardwayBets({ hard8: 300 }) }),
      resolvedBets: makeBets({ hardways: makeHardwayBets({ hard8: 0 }) }),
      flags: { sevenOutBlocked: false, passLineProtected: false, hardwayProtected: false, instantLoss: false },
      additives:    0,
      markerTargetCents: TARGET,
    });
    const result = mathlete.execute(ctx, neverCalledRng);
    expect(result.context.resolvedBets.hardways.hard8).toBe(300);
    expect(result.context.additives).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// ID 5 — The Floor Walker
// ---------------------------------------------------------------------------

describe('Floor Walker (ID 5)', () => {
  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', bets: makeBets({ passLine: 500 }), shooters: 2 });
    const result = floorWalker.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on SEVEN_OUT when no pass-line bet', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', bets: makeBets({ passLine: 0 }), shooters: 2 });
    const result = floorWalker.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on last shooter (shooters <= 1)', () => {
    const ctx = makeCtx({
      rollResult: 'SEVEN_OUT',
      bets:       makeBets({ passLine: 500 }),
      shooters:   1,
    });
    const result = floorWalker.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on SEVEN_OUT with pass-line bet and multiple shooters', () => {
    const ctx = makeCtx({
      rollResult:        'SEVEN_OUT',
      bets:              makeBets({ passLine: 500 }),
      baseStakeReturned: 0,
      shooters:          2,
      flags: {
        sevenOutBlocked:   false,
        passLineProtected: false,
        hardwayProtected:  false,
        instantLoss:       false,
      },
    });
    const result = floorWalker.execute(ctx, neverCalledRng);
    expect(result.context.baseStakeReturned).toBe(500);
    expect(result.context.flags.passLineProtected).toBe(true);
    expect(result.newCooldown).toBe(1);
  });

  it('has per_shooter cooldown type', () => {
    expect(floorWalker.cooldownType).toBe('per_shooter');
  });

  it('does not protect odds — only pass line', () => {
    const ctx = makeCtx({
      rollResult: 'SEVEN_OUT',
      bets:       makeBets({ passLine: 500, odds: 1000 }),
      shooters:   3,
      flags: {
        sevenOutBlocked:   false,
        passLineProtected: false,
        hardwayProtected:  false,
        instantLoss:       false,
      },
    });
    const result = floorWalker.execute(ctx, neverCalledRng);
    // Only passLine (500) is returned — odds (1000) are not
    expect(result.context.baseStakeReturned).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// ID 6 — The Regular
// ---------------------------------------------------------------------------

describe('Regular (ID 6)', () => {
  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', bets: makeBets({ passLine: 500 }) });
    const result = regular.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on POINT_HIT', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', bets: makeBets({ passLine: 500 }) });
    const result = regular.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on NATURAL regardless of pass-line amount', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', bets: makeBets({ passLine: 0 }), additives: 0, markerTargetCents: TARGET });
    const result = regular.execute(ctx, neverCalledRng);
    // maxBet=1000, additive=round(0.40*1000/100)*100=round(4)*100=400
    expect(result.context.additives).toBe(400);
  });

  it('fires on NATURAL and adds floor-scaled additive (0.40× maxBet)', () => {
    const ctx = makeCtx({
      rollResult: 'NATURAL',
      bets:       makeBets({ passLine: 600 }),
      additives:  0,
      markerTargetCents: TARGET,
    });
    const result = regular.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(400);
    expect(result.newCooldown).toBe(0);
  });

  it('stacks on existing additives', () => {
    const ctx = makeCtx({
      rollResult: 'NATURAL',
      bets:       makeBets({ passLine: 300 }),
      additives:  500,
      markerTargetCents: TARGET,
    });
    const result = regular.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(900);
  });
});

// ---------------------------------------------------------------------------
// ID 7 — The Big Spender
// ---------------------------------------------------------------------------

describe('Big Spender (ID 7)', () => {
  it('does not fire when no hardway payout', () => {
    const ctx = makeCtx({ baseHardwaysPayout: 0, markerTargetCents: TARGET });
    const result = bigSpender.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on negative hardway payout', () => {
    // negative means a loss (already deducted) — should not trigger bonus
    const ctx = makeCtx({ baseHardwaysPayout: -700, markerTargetCents: TARGET });
    const result = bigSpender.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires when hardwaysPayout > 0 — additive at 0.75× maxBet', () => {
    // maxBet = floor(10000 * 0.10) = 1000
    // additive = round(0.75 * 1000 / 100) * 100 = round(7.5) * 100 = 800
    const ctx = makeCtx({
      baseHardwaysPayout: 700,
      additives:          0,
      markerTargetCents:  TARGET,
    });
    const result = bigSpender.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(800);
    expect(result.newCooldown).toBe(0);
  });

  it('additive scales with marker target (F9 check)', () => {
    // markerTargetCents=100_000 ($1000), maxBet=10_000 → additive=round(0.75*10000/100)*100=7500
    const ctx = makeCtx({
      baseHardwaysPayout: 100,
      additives:          0,
      markerTargetCents:  100_000,
    });
    const result = bigSpender.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(7_500);
  });
});

// ---------------------------------------------------------------------------
// ID 8 — The Shark
// ---------------------------------------------------------------------------

describe('Shark (ID 8)', () => {
  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', markerTargetCents: TARGET });
    const result = shark.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', markerTargetCents: TARGET });
    const result = shark.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on NO_RESOLUTION', () => {
    const ctx = makeCtx({ rollResult: 'NO_RESOLUTION', markerTargetCents: TARGET });
    const result = shark.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on POINT_HIT — additive at 0.65× maxBet', () => {
    // additive = round(0.65 * 1000 / 100) * 100 = Math.round(6.5) * 100 = 700
    const ctx = makeCtx({
      rollResult:        'POINT_HIT',
      additives:         0,
      markerTargetCents: TARGET,
    });
    const result = shark.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(700);
    expect(result.newCooldown).toBe(0);
  });

  it('additive scales with different marker targets', () => {
    // target=100_000 ($1000), maxBet=10000, additive=round(0.65*10000/100)*100=6500
    const ctx = makeCtx({
      rollResult:        'POINT_HIT',
      additives:         0,
      markerTargetCents: 100_000,
    });
    const result = shark.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(6_500);
  });

  it('stacks on existing additives', () => {
    const ctx = makeCtx({
      rollResult:        'POINT_HIT',
      additives:         500,
      markerTargetCents: TARGET,
    });
    const result = shark.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(1_200);
  });
});

// ---------------------------------------------------------------------------
// ID 9 — The Whale
// ---------------------------------------------------------------------------

describe('Whale (ID 9)', () => {
  it('does not fire on pure loss (basePassLinePayout=0)', () => {
    const ctx = makeCtx({ basePassLinePayout: 0, baseOddsPayout: 0, baseHardwaysPayout: 0 });
    const result = whale.execute(ctx, neverCalledRng);
    expect(result.context.multipliers).toEqual([]);
    expect(result.context).toBe(ctx);
  });

  it('fires on positive passLine payout', () => {
    const ctx = makeCtx({ basePassLinePayout: 1000 });
    const result = whale.execute(ctx, neverCalledRng);
    expect(result.context.multipliers).toEqual([1.2]);
  });

  it('fires on positive odds payout', () => {
    const ctx = makeCtx({ baseOddsPayout: 1500 });
    const result = whale.execute(ctx, neverCalledRng);
    expect(result.context.multipliers).toEqual([1.2]);
  });

  it('fires on positive hardways payout', () => {
    const ctx = makeCtx({ baseHardwaysPayout: 700 });
    const result = whale.execute(ctx, neverCalledRng);
    expect(result.context.multipliers).toEqual([1.2]);
  });

  it('stacks on existing multipliers', () => {
    const ctx = makeCtx({ basePassLinePayout: 1000, multipliers: [1.5] });
    const result = whale.execute(ctx, neverCalledRng);
    expect(result.context.multipliers).toEqual([1.5, 1.2]);
  });

  it('newCooldown is 0', () => {
    const ctx = makeCtx({ basePassLinePayout: 500 });
    const result = whale.execute(ctx, neverCalledRng);
    expect(result.newCooldown).toBe(0);
  });

  it('does not mutate ctx.multipliers', () => {
    const mult = [1.5];
    const ctx = makeCtx({ basePassLinePayout: 500, multipliers: mult });
    whale.execute(ctx, neverCalledRng);
    expect(mult).toHaveLength(1); // original array unchanged
  });
});

// ---------------------------------------------------------------------------
// ID 10 — The Nervous Intern
// ---------------------------------------------------------------------------

describe('Nervous Intern (ID 10)', () => {
  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.5 });
    const result = nervousIntern.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.5);
  });

  it('does not fire on POINT_HIT', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', hype: 1.5 });
    const result = nervousIntern.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.5);
  });

  it('fires on NATURAL → hype +0.30', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', hype: 1.0 });
    const result = nervousIntern.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.30, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('stacks on elevated hype', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', hype: 1.8 });
    const result = nervousIntern.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(2.10, 4);
  });

  it('does not call RNG', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', hype: 1.0 });
    // neverCalledRng throws if called
    expect(() => nervousIntern.execute(ctx, neverCalledRng)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ID 11 — "Hype-Train" Holly
// ---------------------------------------------------------------------------

describe('Hype-Train Holly (ID 11)', () => {
  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', hype: 1.5 });
    const result = hypeTrainHolly.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.5);
  });

  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.5 });
    const result = hypeTrainHolly.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.5);
  });

  it('fires on POINT_HIT → hype +0.15, rounded to 4dp', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', hype: 1.0 });
    const result = hypeTrainHolly.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.15, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('IEEE-754 accumulation: 1.0 + 0.15 + 0.15 + 0.15 = 1.45 exactly', () => {
    // Three consecutive point hits via manual execute() calls
    let ctx = makeCtx({ rollResult: 'POINT_HIT', hype: 1.0 });
    ctx = hypeTrainHolly.execute(ctx, neverCalledRng).context;
    ctx = hypeTrainHolly.execute({ ...ctx, rollResult: 'POINT_HIT' }, neverCalledRng).context;
    ctx = hypeTrainHolly.execute({ ...ctx, rollResult: 'POINT_HIT' }, neverCalledRng).context;
    // Should be 1.45 — the 4dp rounding prevents floating-point noise
    expect(ctx.hype).toBeCloseTo(1.45, 4);
  });
});

// ---------------------------------------------------------------------------
// ID 12 — The Drunk Uncle
// ---------------------------------------------------------------------------

describe('Drunk Uncle (ID 12)', () => {
  it('does not fire when d1 > 2', () => {
    const ctx = makeCtx({ hype: 1.5 });
    // d1=3 → no activation
    const result = drunkUncle.execute(ctx, fixedDice(3, 1));
    expect(result.context.hype).toBe(1.5);
  });

  it('fires when d1=1, d2 odd → +0.5 hype', () => {
    const ctx = makeCtx({ hype: 1.0 });
    const result = drunkUncle.execute(ctx, fixedDice(1, 3)); // d1=1 (fires), d2=3 (odd)
    expect(result.context.hype).toBeCloseTo(1.5, 4);
  });

  it('fires when d1=2, d2 even → −0.25 hype', () => {
    const ctx = makeCtx({ hype: 1.0 });
    const result = drunkUncle.execute(ctx, fixedDice(2, 4)); // d1=2 (fires), d2=4 (even)
    expect(result.context.hype).toBeCloseTo(0.75, 4);
  });

  it('negative hype is allowed (no floor guard)', () => {
    // Design choice: Drunk Uncle can push below 1.0× intentionally
    const ctx = makeCtx({ hype: 1.0 });
    const result = drunkUncle.execute(ctx, fixedDice(1, 2)); // fires, d2=2 even → -0.25
    expect(result.context.hype).toBeCloseTo(0.75, 4);
    // Could push further below 1.0 with repeated calls
  });

  it('calls RNG exactly once', () => {
    let callCount = 0;
    const countingRng = (): [number, number] => { callCount++; return [1, 3]; };
    const ctx = makeCtx({ hype: 1.0 });
    drunkUncle.execute(ctx, countingRng);
    expect(callCount).toBe(1);
  });

  it('does not mutate ctx on no-fire path', () => {
    const ctx = makeCtx({ hype: 1.5 });
    drunkUncle.execute(ctx, fixedDice(5, 2)); // d1=5 → no fire
    expect(ctx.hype).toBe(1.5);
  });
});

// ---------------------------------------------------------------------------
// ID 13 — The Mimic
// ---------------------------------------------------------------------------

describe('Mimic (ID 13)', () => {
  it('execute() is always a no-op (cascade handles copying)', () => {
    const scenarios = [
      makeCtx({ rollResult: 'NATURAL' }),
      makeCtx({ rollResult: 'SEVEN_OUT' }),
      makeCtx({ rollResult: 'POINT_HIT' }),
    ];

    scenarios.forEach((ctx) => {
      const result = mimic.execute(ctx, neverCalledRng);
      expect(result.context).toBe(ctx);
      expect(result.newCooldown).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// ID 14 — The Old Pro
// ---------------------------------------------------------------------------

describe('Old Pro (ID 14)', () => {
  it('execute() is always a no-op on any roll', () => {
    const scenarios = [
      makeCtx({ rollResult: 'NATURAL' }),
      makeCtx({ rollResult: 'SEVEN_OUT' }),
      makeCtx({ rollResult: 'POINT_HIT' }),
      makeCtx({ rollResult: 'NO_RESOLUTION' }),
      makeCtx({ rollResult: 'CRAPS_OUT' }),
    ];

    scenarios.forEach((ctx) => {
      const result = oldPro.execute(ctx, neverCalledRng);
      expect(result.context).toBe(ctx);
      expect(result.newCooldown).toBe(0);
    });
  });

  it('has no cooldown', () => {
    expect(oldPro.cooldownType).toBe('none');
    expect(oldPro.cooldownState).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ID 15 — The Lucky Charm
// ---------------------------------------------------------------------------

describe('Lucky Charm (ID 15)', () => {
  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', hype: 1.5 });
    const result = luckyCharm.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.5);
  });

  it('does not fire on POINT_HIT', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', hype: 1.5 });
    const result = luckyCharm.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.5);
  });

  it('does not fire on NO_RESOLUTION', () => {
    const ctx = makeCtx({ rollResult: 'NO_RESOLUTION', hype: 1.5 });
    const result = luckyCharm.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.5);
  });

  it('fires on SEVEN_OUT → hype +1.0', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.4 });
    const result = luckyCharm.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(2.4, 4);
    expect(result.newCooldown).toBe(1);
  });

  it('has per_shooter cooldown type', () => {
    expect(luckyCharm.cooldownType).toBe('per_shooter');
  });

  it('fires on SEVEN_OUT from hype 1.0 → hype 2.0', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.0 });
    const result = luckyCharm.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(2.0, 4);
  });

  it('fires even when other crew are present (no alone-on-rail check)', () => {
    // Lucky Charm has no alone-on-rail guard — it fires on SEVEN_OUT regardless
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.0 });
    const result = luckyCharm.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(2.0, 4);
  });
});

// ---------------------------------------------------------------------------
// ID 16 — The Lookout
// ---------------------------------------------------------------------------

describe('Lookout (ID 16)', () => {
  it('does not fire when neither die shows 6', () => {
    const ctx = makeCtx({ dice: [3, 4], diceTotal: 7, hype: 1.0 });
    const result = lookout.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('fires when die[0] = 6', () => {
    const ctx = makeCtx({ dice: [6, 2], diceTotal: 8, hype: 1.0 });
    const result = lookout.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.20, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('fires when die[1] = 6', () => {
    const ctx = makeCtx({ dice: [1, 6], diceTotal: 7, hype: 1.0 });
    const result = lookout.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.20, 4);
  });

  it('fires on [6,6] (both show 6)', () => {
    const ctx = makeCtx({ dice: [6, 6], diceTotal: 12, hype: 1.0 });
    const result = lookout.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.20, 4);
  });

  it('rounds to 4 decimal places', () => {
    const ctx = makeCtx({ dice: [6, 1], diceTotal: 7, hype: 1.0 });
    const result = lookout.execute(ctx, neverCalledRng);
    // 1.0 + 0.20 = 1.20 — check no trailing float noise
    expect(result.context.hype).toBe(1.20);
  });
});

// ---------------------------------------------------------------------------
// ID 17 — "Ace" McGee
// ---------------------------------------------------------------------------

describe('Ace McGee (ID 17)', () => {
  it('does not fire when no die shows 1', () => {
    const ctx = makeCtx({ dice: [3, 4], diceTotal: 7, markerTargetCents: TARGET });
    const result = aceMcgee.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires when die[0] = 1 → additive 0.40× maxBet', () => {
    // maxBet=1000, additive=round(0.40*1000/100)*100=round(4)*100=400
    const ctx = makeCtx({ dice: [1, 5], diceTotal: 6, additives: 0, markerTargetCents: TARGET });
    const result = aceMcgee.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(400);
  });

  it('fires when die[1] = 1', () => {
    const ctx = makeCtx({ dice: [5, 1], diceTotal: 6, additives: 0, markerTargetCents: TARGET });
    const result = aceMcgee.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(400);
  });

  it('fires on [1,1] (snake eyes)', () => {
    const ctx = makeCtx({ dice: [1, 1], diceTotal: 2, additives: 0, markerTargetCents: TARGET });
    const result = aceMcgee.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(400);
  });

  it('rounds additive to nearest $1 (100 cents)', () => {
    // target=5000, maxBet=500, additive=round(0.40*500/100)*100=round(2.0)*100=200
    const ctx = makeCtx({ dice: [1, 3], diceTotal: 4, additives: 0, markerTargetCents: 5_000 });
    const result = aceMcgee.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// ID 18 — The Close Call
// ---------------------------------------------------------------------------

describe('Close Call (ID 18)', () => {
  it('does not fire on non-consecutive dice (diff > 1)', () => {
    const ctx = makeCtx({ dice: [1, 4], diceTotal: 5, markerTargetCents: TARGET });
    const result = closeCall.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on paired dice (diff = 0)', () => {
    const ctx = makeCtx({ dice: [3, 3], diceTotal: 6, markerTargetCents: TARGET });
    const result = closeCall.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires when |d0-d1| = 1 → additive 0.35× maxBet', () => {
    // round(0.35 * 1000 / 100) * 100 = Math.round(3.5) * 100 = 400
    const ctx = makeCtx({ dice: [3, 4], diceTotal: 7, additives: 0, markerTargetCents: TARGET });
    const result = closeCall.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(400);
  });

  it('fires on [5,6] consecutive pair', () => {
    const ctx = makeCtx({ dice: [5, 6], diceTotal: 11, additives: 0, markerTargetCents: TARGET });
    const result = closeCall.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(400);
  });

  it('fires on [2,1] (reversed consecutive)', () => {
    const ctx = makeCtx({ dice: [2, 1], diceTotal: 3, additives: 0, markerTargetCents: TARGET });
    const result = closeCall.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// ID 19 — The Momentum
// ---------------------------------------------------------------------------

describe('Momentum (ID 19)', () => {
  it('does not fire on first roll (previousRollTotal=null)', () => {
    const ctx = makeCtx({ previousRollTotal: null, diceTotal: 8, hype: 1.0 });
    const result = momentum.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('does not fire when diceTotal = previousRollTotal (tied)', () => {
    const ctx = makeCtx({ previousRollTotal: 7, diceTotal: 7, hype: 1.0 });
    const result = momentum.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('does not fire when diceTotal < previousRollTotal (descended)', () => {
    const ctx = makeCtx({ previousRollTotal: 9, diceTotal: 6, hype: 1.0 });
    const result = momentum.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('fires when diceTotal > previousRollTotal → +0.2 hype', () => {
    const ctx = makeCtx({ previousRollTotal: 5, diceTotal: 8, hype: 1.0 });
    const result = momentum.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.2, 4);
    expect(result.newCooldown).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ID 20 — The Echo
// ---------------------------------------------------------------------------

describe('Echo (ID 20)', () => {
  it('does not fire on first roll (previousRollTotal=null)', () => {
    const ctx = makeCtx({ previousRollTotal: null, diceTotal: 7, hype: 1.0 });
    const result = echo.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('does not fire when diceTotal != previousRollTotal', () => {
    const ctx = makeCtx({ previousRollTotal: 6, diceTotal: 8, hype: 1.0 });
    const result = echo.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('fires when diceTotal === previousRollTotal → +0.4 hype', () => {
    const ctx = makeCtx({ previousRollTotal: 7, diceTotal: 7, hype: 1.0 });
    const result = echo.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.4, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('rounds to 4 decimal places', () => {
    const ctx = makeCtx({ previousRollTotal: 8, diceTotal: 8, hype: 1.0 });
    const result = echo.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.4);
  });
});

// ---------------------------------------------------------------------------
// ID 21 — The Silver Lining
// ---------------------------------------------------------------------------

describe('Silver Lining (ID 21)', () => {
  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', hype: 1.0 });
    const result = silverLining.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.0 });
    const result = silverLining.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('fires on CRAPS_OUT → +0.4 hype', () => {
    const ctx = makeCtx({ rollResult: 'CRAPS_OUT', hype: 1.0 });
    const result = silverLining.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.4, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('rounds to 4 decimal places', () => {
    const ctx = makeCtx({ rollResult: 'CRAPS_OUT', hype: 1.0 });
    const result = silverLining.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.4);
  });
});

// ---------------------------------------------------------------------------
// ID 22 — The Odd Couple
// ---------------------------------------------------------------------------

describe('Odd Couple (ID 22)', () => {
  it('does not fire when dice are mixed (one odd, one even)', () => {
    const ctx = makeCtx({ dice: [1, 2], diceTotal: 3, hype: 1.0 });
    const result = oddCouple.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('does not fire when both dice are even', () => {
    const ctx = makeCtx({ dice: [2, 4], diceTotal: 6, hype: 1.0 });
    const result = oddCouple.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('fires when both dice are odd → +0.2 hype', () => {
    const ctx = makeCtx({ dice: [1, 3], diceTotal: 4, hype: 1.0 });
    const result = oddCouple.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.2, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('fires on [3,5], [5,5], [1,1]', () => {
    [[3, 5], [5, 5], [1, 1]].forEach(([d0, d1]) => {
      const ctx = makeCtx({ dice: [d0!, d1!], diceTotal: d0! + d1!, hype: 1.0 });
      const result = oddCouple.execute(ctx, neverCalledRng);
      expect(result.context.hype).toBeCloseTo(1.2, 4);
    });
  });
});

// ---------------------------------------------------------------------------
// ID 23 — The Even Keel
// ---------------------------------------------------------------------------

describe('Even Keel (ID 23)', () => {
  it('does not fire when dice are mixed', () => {
    const ctx = makeCtx({ dice: [2, 3], diceTotal: 5, additives: 0, markerTargetCents: TARGET });
    const result = evenKeel.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire when both dice are odd', () => {
    const ctx = makeCtx({ dice: [3, 5], diceTotal: 8, additives: 0, markerTargetCents: TARGET });
    const result = evenKeel.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires when both dice are even → additive 0.50× maxBet', () => {
    // maxBet=1000, additive=round(0.50*1000/100)*100=500
    const ctx = makeCtx({ dice: [2, 4], diceTotal: 6, additives: 0, markerTargetCents: TARGET });
    const result = evenKeel.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(500);
    expect(result.newCooldown).toBe(0);
  });

  it('fires on [6,6]', () => {
    const ctx = makeCtx({ dice: [6, 6], diceTotal: 12, additives: 0, markerTargetCents: TARGET });
    const result = evenKeel.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(500);
  });

  it('fires on [2,2]', () => {
    const ctx = makeCtx({ dice: [2, 2], diceTotal: 4, additives: 0, markerTargetCents: TARGET });
    const result = evenKeel.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// ID 24 — The Doorman
// ---------------------------------------------------------------------------

describe('Doorman (ID 24)', () => {
  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', markerTargetCents: TARGET });
    const result = doorman.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on POINT_HIT', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', markerTargetCents: TARGET });
    const result = doorman.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on NO_RESOLUTION', () => {
    const ctx = makeCtx({ rollResult: 'NO_RESOLUTION', markerTargetCents: TARGET });
    const result = doorman.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on NATURAL → additive 0.25× maxBet', () => {
    // maxBet=1000, additive=round(0.25*1000/100)*100=round(2.5)*100=300
    const ctx = makeCtx({ rollResult: 'NATURAL', additives: 0, markerTargetCents: TARGET });
    const result = doorman.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(300);
    expect(result.newCooldown).toBe(0);
  });

  it('fires on CRAPS_OUT (come-out) → additive 0.25× maxBet', () => {
    const ctx = makeCtx({ rollResult: 'CRAPS_OUT', additives: 0, markerTargetCents: TARGET });
    const result = doorman.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(300);
  });

  it('fires on POINT_SET (come-out) → additive 0.25× maxBet', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', additives: 0, markerTargetCents: TARGET });
    const result = doorman.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// ID 25 — The Grinder
// ---------------------------------------------------------------------------

describe('Grinder (ID 25)', () => {
  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', markerTargetCents: TARGET });
    const result = grinder.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on POINT_HIT', () => {
    const ctx = makeCtx({ rollResult: 'POINT_HIT', markerTargetCents: TARGET });
    const result = grinder.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', markerTargetCents: TARGET });
    const result = grinder.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on NO_RESOLUTION → additive 0.15× maxBet', () => {
    // round(0.15*1000/100)*100=round(1.5)*100=200
    const ctx = makeCtx({ rollResult: 'NO_RESOLUTION', additives: 0, markerTargetCents: TARGET });
    const result = grinder.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(200);
    expect(result.newCooldown).toBe(0);
  });

  it('stacks on existing additives', () => {
    const ctx = makeCtx({ rollResult: 'NO_RESOLUTION', additives: 500, markerTargetCents: TARGET });
    const result = grinder.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// ID 26 — The Handicapper
// ---------------------------------------------------------------------------

describe('Handicapper (ID 26)', () => {
  it('does not fire on NATURAL', () => {
    const ctx = makeCtx({ rollResult: 'NATURAL', hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('does not fire on SEVEN_OUT', () => {
    const ctx = makeCtx({ rollResult: 'SEVEN_OUT', hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('does not fire on NO_RESOLUTION', () => {
    const ctx = makeCtx({ rollResult: 'NO_RESOLUTION', hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('fires on POINT_SET with point 4 → +0.3 hype', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 4, hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.3, 4);
  });

  it('fires on POINT_SET with point 10 → +0.3 hype', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 10, hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.3, 4);
  });

  it('fires on POINT_SET with point 5 → +0.2 hype', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 5, hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.2, 4);
  });

  it('fires on POINT_SET with point 9 → +0.2 hype', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 9, hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.2, 4);
  });

  it('fires on POINT_SET with point 6 → +0.1 hype', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 6, hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.1, 4);
  });

  it('fires on POINT_SET with point 8 → +0.1 hype', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 8, hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.1, 4);
  });

  it('stacks on elevated hype', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 4, hype: 1.5 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.8, 4);
  });

  it('newCooldown is 0', () => {
    const ctx = makeCtx({ rollResult: 'POINT_SET', activePoint: 8, hype: 1.0 });
    const result = handicapper.execute(ctx, neverCalledRng);
    expect(result.newCooldown).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ID 27 — The Mirror
// ---------------------------------------------------------------------------

describe('Mirror (ID 27)', () => {
  it('does not fire when diceTotal != 7', () => {
    const ctx = makeCtx({ diceTotal: 8, hype: 1.0 });
    const result = mirror.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.0);
  });

  it('fires on diceTotal=7 (NATURAL come-out) → +0.2 hype', () => {
    const ctx = makeCtx({ diceTotal: 7, rollResult: 'NATURAL', hype: 1.0 });
    const result = mirror.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.2, 4);
    expect(result.newCooldown).toBe(0);
  });

  it('fires on diceTotal=7 (SEVEN_OUT point phase) → +0.2 hype', () => {
    const ctx = makeCtx({ diceTotal: 7, rollResult: 'SEVEN_OUT', hype: 1.5 });
    const result = mirror.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.7, 4);
  });

  it('rounds to 4 decimal places', () => {
    const ctx = makeCtx({ diceTotal: 7, rollResult: 'NATURAL', hype: 1.0 });
    const result = mirror.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBe(1.2);
  });
});

// ---------------------------------------------------------------------------
// ID 28 — The Bookkeeper
// ---------------------------------------------------------------------------

describe('Bookkeeper (ID 28)', () => {
  it('does not fire on roll 1 (shooterRollCount=1, not divisible by 3)', () => {
    const ctx = makeCtx({ shooterRollCount: 1, additives: 0, markerTargetCents: TARGET });
    const result = bookkeeper.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire on roll 2', () => {
    const ctx = makeCtx({ shooterRollCount: 2, additives: 0, markerTargetCents: TARGET });
    const result = bookkeeper.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on roll 3 (shooterRollCount % 3 === 0) → additive 0.25× maxBet', () => {
    // maxBet=1000, additive=round(0.25*1000/100)*100=round(2.5)*100=300
    const ctx = makeCtx({ shooterRollCount: 3, additives: 0, markerTargetCents: TARGET });
    const result = bookkeeper.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(300);
    expect(result.newCooldown).toBe(0);
  });

  it('fires on roll 6', () => {
    const ctx = makeCtx({ shooterRollCount: 6, additives: 0, markerTargetCents: TARGET });
    const result = bookkeeper.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(300);
  });

  it('fires on roll 9', () => {
    const ctx = makeCtx({ shooterRollCount: 9, additives: 0, markerTargetCents: TARGET });
    const result = bookkeeper.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(300);
  });

  it('does not fire on roll 4', () => {
    const ctx = makeCtx({ shooterRollCount: 4, additives: 0, markerTargetCents: TARGET });
    const result = bookkeeper.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });
});

// ---------------------------------------------------------------------------
// ID 29 — The Pressure Cooker
// ---------------------------------------------------------------------------

describe('Pressure Cooker (ID 29)', () => {
  it('does not fire on non-NO_RESOLUTION result', () => {
    const ctx = makeCtx({
      rollResult:            'POINT_HIT',
      pointPhaseBlankStreak: 4,
      markerTargetCents:     TARGET,
    });
    const result = pressureCooker.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire when streak < 4', () => {
    const ctx = makeCtx({
      rollResult:            'NO_RESOLUTION',
      pointPhaseBlankStreak: 3,
      markerTargetCents:     TARGET,
    });
    const result = pressureCooker.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire when streak = 0', () => {
    const ctx = makeCtx({
      rollResult:            'NO_RESOLUTION',
      pointPhaseBlankStreak: 0,
      markerTargetCents:     TARGET,
    });
    const result = pressureCooker.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('fires on NO_RESOLUTION with streak=4 (5th blank) → +0.5 hype + 0.75× additive', () => {
    // maxBet=1000, additive=round(0.75*1000/100)*100=round(7.5)*100=800
    const ctx = makeCtx({
      rollResult:            'NO_RESOLUTION',
      pointPhaseBlankStreak: 4,
      hype:                  1.0,
      additives:             0,
      markerTargetCents:     TARGET,
    });
    const result = pressureCooker.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(1.5, 4);
    expect(result.context.additives).toBe(800);
    expect(result.newCooldown).toBe(0);
  });

  it('stacks hype on existing value', () => {
    const ctx = makeCtx({
      rollResult:            'NO_RESOLUTION',
      pointPhaseBlankStreak: 4,
      hype:                  1.5,
      additives:             0,
      markerTargetCents:     TARGET,
    });
    const result = pressureCooker.execute(ctx, neverCalledRng);
    expect(result.context.hype).toBeCloseTo(2.0, 4);
  });
});

// ---------------------------------------------------------------------------
// ID 30 — The Contrarian
// ---------------------------------------------------------------------------

describe('Contrarian (ID 30)', () => {
  it('does not fire on first roll (previousRollTotal=null)', () => {
    const ctx = makeCtx({ previousRollTotal: null, diceTotal: 5, markerTargetCents: TARGET });
    const result = contrarian.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);
  });

  it('does not fire when diceTotal >= previousRollTotal (ascending or equal)', () => {
    const ctx = makeCtx({ previousRollTotal: 6, diceTotal: 8, markerTargetCents: TARGET });
    const result = contrarian.execute(ctx, neverCalledRng);
    expect(result.context).toBe(ctx);

    const ctxTied = makeCtx({ previousRollTotal: 7, diceTotal: 7, markerTargetCents: TARGET });
    const resultTied = contrarian.execute(ctxTied, neverCalledRng);
    expect(resultTied.context).toBe(ctxTied);
  });

  it('fires when diceTotal < previousRollTotal → additive 0.25× maxBet', () => {
    // maxBet=1000, additive=round(0.25*1000/100)*100=round(2.5)*100=300
    const ctx = makeCtx({
      previousRollTotal: 9,
      diceTotal:         5,
      additives:         0,
      markerTargetCents: TARGET,
    });
    const result = contrarian.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(300);
    expect(result.newCooldown).toBe(0);
  });

  it('stacks on existing additives', () => {
    const ctx = makeCtx({
      previousRollTotal: 10,
      diceTotal:         4,
      additives:         800,
      markerTargetCents: TARGET,
    });
    const result = contrarian.execute(ctx, neverCalledRng);
    expect(result.context.additives).toBe(1_100);
  });
});
