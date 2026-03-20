// =============================================================================
// TEST HELPERS
// src/__tests__/helpers.ts
//
// Factory functions for building TurnContext and Bets fixtures in tests.
// All monetary values are in cents. Use deep-merging overrides for brevity.
// =============================================================================

import type { Bets, HardwayBets, RollDiceFn, TurnContext } from '../types.js';

// ---------------------------------------------------------------------------
// Bet factories
// ---------------------------------------------------------------------------

export function makeHardwayBets(overrides: Partial<HardwayBets> = {}): HardwayBets {
  return { hard4: 0, hard6: 0, hard8: 0, hard10: 0, ...overrides };
}

export function makeBets(overrides: Partial<Bets> = {}): Bets {
  return {
    passLine: 0,
    odds: 0,
    hardways: makeHardwayBets(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TurnContext factory
// ---------------------------------------------------------------------------

/**
 * Builds a TurnContext with safe defaults. Override only what each test needs.
 *
 * Default state: 7-out with no bets — a neutral starting point that most
 * tests immediately override with relevant dice/rollResult/bets.
 */
export function makeCtx(overrides: Partial<TurnContext> = {}): TurnContext {
  return {
    dice:                [3, 4],
    diceTotal:           7,
    isHardway:           false,
    rollResult:          'SEVEN_OUT',
    activePoint:         8,   // Arbitrary point for SEVEN_OUT scenarios
    bets:                makeBets(),
    basePassLinePayout:  0,
    baseOddsPayout:      0,
    baseHardwaysPayout:  0,
    baseStakeReturned:   0,
    additives:           0,
    multipliers:         [],
    hype:                1.0,
    flags: {
      sevenOutBlocked:   false,
      passLineProtected: false,
      hardwayProtected:  false,
    },
    resolvedBets: makeBets(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RNG helpers
// ---------------------------------------------------------------------------

/** A deterministic RollDiceFn for use in tests. */
export function fixedDice(d1: number, d2: number): RollDiceFn {
  return () => [d1, d2];
}

/**
 * A RollDiceFn that throws if called — useful to prove a crew member does NOT
 * generate dice (e.g., HYPE and PAYOUT crew should never call rollDice).
 */
export const neverCalledRng: RollDiceFn = () => {
  throw new Error('RNG was called unexpectedly — this crew should not generate dice.');
};
