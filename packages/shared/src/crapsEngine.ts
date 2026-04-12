// =============================================================================
// BATTLECRAPS — CRAPS ENGINE
// packages/shared/src/crapsEngine.ts
//
// The authoritative, server-side resolution of all dice outcomes.
// This module contains ZERO randomness — the dice are passed IN (generated
// by the server's RNG before calling these functions). That makes every
// function here a pure, deterministic, easily unit-testable transform.
//
// SECURITY: This entire module must only ever execute on the server (apps/api).
// It is in packages/shared for type-sharing purposes, but the API layer must
// never expose raw payout calculations or dice logic to the client.
// =============================================================================

import type {
  Bets,
  GamePhase,
  HardwayBets,
  RollReceipt,
  RollReceiptLine,
  RollResult,
  TurnContext,
} from './types.js';

// ---------------------------------------------------------------------------
// STATIC LOOKUP TABLES
// ---------------------------------------------------------------------------

/** The four hardway numbers (paired dice totals). Used in multiple checks. */
const HARDWAY_NUMBERS = new Set([4, 6, 8, 10]);

/**
 * True-odds payout ratios for the Odds bet, keyed by point number.
 * Expressed as [numerator, denominator] to enable exact integer-cent arithmetic.
 *
 * Point 4/10 → 2:1  (a $10 Odds bet pays $20)
 * Point 5/9  → 3:2  (a $10 Odds bet pays $15)
 * Point 6/8  → 6:5  (a $10 Odds bet pays $12)
 *
 * NOTE: To get exact payouts, players should size their Odds bets to be
 * multiples of 2 (for 4/10), multiples of 2 (for 5/9), and multiples of
 * 5 (for 6/8). The engine floors fractional cents but never rounds up.
 */
const ODDS_PAYOUT_RATIO: Readonly<Record<number, [number, number]>> = {
  4:  [2, 1],
  5:  [3, 2],
  6:  [6, 5],
  8:  [6, 5],
  9:  [3, 2],
  10: [2, 1],
};

/**
 * Hardway win payout ratios (profit : bet).
 * Hard 4/10 → 7:1  (a $5 bet pays $35 profit)
 * Hard 6/8  → 9:1  (a $5 bet pays $45 profit)
 */
const HARDWAY_PAYOUT_RATIO: Readonly<Record<number, number>> = {
  4:  7,
  6:  9,
  8:  9,
  10: 7,
};

/**
 * Maximum Odds multiplier allowed per point number (the 3-4-5x rule).
 * The max Odds bet = passLineBet × this multiplier.
 *
 * Points 4/10 → 3x | Points 5/9 → 4x | Points 6/8 → 5x
 */
const ODDS_MAX_MULTIPLIER: Readonly<Record<number, number>> = {
  4:  3,
  5:  4,
  6:  5,
  8:  5,
  9:  4,
  10: 3,
};

// ---------------------------------------------------------------------------
// EXPORTED HELPER — Odds bet validation (3-4-5x rule)
// ---------------------------------------------------------------------------

/**
 * Validates and caps a proposed Odds bet against the 3-4-5x casino rule.
 *
 * Returns the maximum allowable odds amount (may be lower than proposedOdds
 * if the bet would exceed the allowed multiplier for the current point).
 * Call this on bet placement — the engine trusts that bets already in
 * GameState passed validation when they were placed.
 *
 * @param passLineBet  The player's Pass Line bet in cents.
 * @param proposedOdds The Odds amount the player wants to place, in cents.
 * @param point        The active point number (4, 5, 6, 8, 9, or 10).
 * @returns            The capped odds amount in cents (≤ proposedOdds).
 */
export function validateOddsBet(
  passLineBet: number,
  proposedOdds: number,
  point: number,
): number {
  const maxMultiplier = ODDS_MAX_MULTIPLIER[point];
  if (maxMultiplier === undefined) {
    throw new Error(`validateOddsBet: invalid point value ${point}`);
  }
  const maxOdds = passLineBet * maxMultiplier;
  return Math.min(proposedOdds, maxOdds);
}

// ---------------------------------------------------------------------------
// INTERNAL HELPERS — Roll Classification
// ---------------------------------------------------------------------------

/**
 * Classifies a come-out roll into its game-rule outcome.
 * Called only when GamePhase === 'COME_OUT'.
 */
function classifyComeOut(total: number): RollResult {
  if (total === 7 || total === 11) return 'NATURAL';
  if (total === 2 || total === 3 || total === 12) return 'CRAPS_OUT';
  // Any other total (4, 5, 6, 8, 9, 10) sets the point.
  return 'POINT_SET';
}

/**
 * Classifies a point-phase roll.
 * Called only when GamePhase === 'POINT_ACTIVE'.
 */
function classifyPointPhase(total: number, currentPoint: number): RollResult {
  if (total === currentPoint) return 'POINT_HIT';
  if (total === 7) return 'SEVEN_OUT';
  return 'NO_RESOLUTION';
}

// ---------------------------------------------------------------------------
// EXPORTED HELPERS — Used by Dice crew (e.g., Lefty) for re-roll recalculation
// ---------------------------------------------------------------------------

/**
 * Classifies the outcome of a set of dice for a given game phase.
 *
 * Exported because Dice crew members (Lefty, The Physics Prof, The Mechanic)
 * may substitute new or modified dice mid-cascade and need to re-classify the
 * outcome without duplicating this logic inside each crew implementation.
 *
 * @param dice         The [d1, d2] values to evaluate.
 * @param phase        The current game phase.
 * @param currentPoint The active point, if any. Required when phase === 'POINT_ACTIVE'.
 */
export function classifyDiceOutcome(
  dice: [number, number],
  phase: GamePhase,
  currentPoint: number | null,
): RollResult {
  const total = dice[0] + dice[1];
  if (phase === 'COME_OUT') {
    return classifyComeOut(total);
  }
  // phase === 'POINT_ACTIVE' — a currentPoint must exist
  if (currentPoint === null) {
    throw new Error(
      'classifyDiceOutcome: currentPoint cannot be null in POINT_ACTIVE phase.',
    );
  }
  return classifyPointPhase(total, currentPoint);
}

// ---------------------------------------------------------------------------
// INTERNAL HELPERS — Payout Calculation
// ---------------------------------------------------------------------------

/**
 * Computes the Pass Line PROFIT for a single roll, in cents.
 *
 * Returns positive on a win (profit only — stake is tracked separately via
 * calcStakeReturned and returned to the bankroll without amplification).
 * Returns zero on a loss or unresolved roll — the stake was already deducted
 * from the bankroll when the bet was placed, so the engine does not re-subtract it.
 *
 * Note on POINT_SET: The pass line bet is frozen/pending — no payout yet.
 */
function calcPassLinePayout(result: RollResult, passLineBet: number): number {
  switch (result) {
    case 'NATURAL':
    case 'POINT_HIT':
      return passLineBet; // 1:1 profit
    case 'CRAPS_OUT':
    case 'SEVEN_OUT':
      return 0; // stake already gone (deducted at placement)
    case 'POINT_SET':
    case 'NO_RESOLUTION':
      return 0; // bet still locked on the table — not resolved yet
  }
}

/**
 * Computes the Odds bet true-odds PROFIT, in cents.
 *
 * Returns the profit only on POINT_HIT. Returns 0 on SEVEN_OUT (stake already
 * gone at placement) and all other results (bet unresolved, stays on table).
 * Math.floor here prevents sub-cent remainders within this calculation; whole-dollar
 * rounding of the final payout is applied in settleTurn().
 */
function calcOddsPayout(
  result: RollResult,
  oddsBet: number,
  activePoint: number | null,
): number {
  if (oddsBet === 0 || activePoint === null) return 0;

  if (result === 'POINT_HIT') {
    const ratio = ODDS_PAYOUT_RATIO[activePoint];
    if (ratio === undefined) {
      throw new Error(`calcOddsPayout: invalid point value ${activePoint}`);
    }
    const [numerator, denominator] = ratio;
    return Math.floor((oddsBet * numerator) / denominator);
  }

  // SEVEN_OUT: stake already gone at placement — return 0, not -oddsBet.
  // All other results (NATURAL, CRAPS_OUT, POINT_SET, NO_RESOLUTION): unresolved.
  return 0;
}

/**
 * Computes the total Hardways PROFIT for this roll, in cents.
 *
 * Each of the four hardway bets is evaluated independently:
 *   - SEVEN_OUT: all hardway stakes were already gone at placement — returns 0.
 *   - Dice total is a hardway number (4/6/8/10):
 *       - Paired dice (e.g., 3+3 = Hard 6): that hardway WINS — returns profit.
 *       - Non-paired / "easy" dice (e.g., 2+4 = Easy 6): that hardway LOSES —
 *         stake already gone at placement, returns 0.
 *   - Any other total: no hardway resolves this roll — returns 0.
 *
 * Only ONE hardway number can resolve per roll (the one matching the total).
 */
function calcHardwaysPayout(
  dice: [number, number],
  isHardway: boolean,
  result: RollResult,
  hardwayBets: HardwayBets,
): number {
  // Seven-out: all hardway bets lost — stakes already gone at placement
  if (result === 'SEVEN_OUT') {
    return 0;
  }

  const total = dice[0] + dice[1];

  // Non-hardway total: no hardway resolves this roll
  if (!HARDWAY_NUMBERS.has(total)) {
    return 0;
  }

  const betMap: Record<number, number> = {
    4:  hardwayBets.hard4,
    6:  hardwayBets.hard6,
    8:  hardwayBets.hard8,
    10: hardwayBets.hard10,
  };

  const bet = betMap[total] ?? 0;
  if (bet === 0) return 0; // no bet on this number

  if (isHardway) {
    // Paired dice — this hardway WINS; return profit
    const ratio = HARDWAY_PAYOUT_RATIO[total];
    if (ratio === undefined) {
      throw new Error(`calcHardwaysPayout: invalid hardway total ${total}`);
    }
    return bet * ratio;
  }

  // Easy / soft roll — this hardway LOSES; stake already gone at placement
  return 0;
}

/**
 * Computes the total stake being returned to the bankroll for this roll, in cents.
 *
 * Stakes are returned ONLY on winning bets — at the same 1:1 ratio (no amplification).
 * Losing bet stakes were already deducted from the bankroll at placement time.
 *
 * Pass Line stake is returned on NATURAL or POINT_HIT.
 * Odds stake is returned on POINT_HIT only.
 * A single hardway stake is returned when paired dice match that hardway number.
 */
function calcStakeReturned(
  dice: [number, number],
  rollResult: RollResult,
  isHardway: boolean,
  bets: Readonly<Bets>,
): number {
  const total = dice[0] + dice[1];
  let stake = 0;

  // Pass Line: stake back on a win
  if (rollResult === 'NATURAL' || rollResult === 'POINT_HIT') {
    stake += bets.passLine;
  }

  // Odds: stake back only on a Point Hit (not on NATURAL — no odds in COME_OUT)
  if (rollResult === 'POINT_HIT') {
    stake += bets.odds;
  }

  // Hardways: stake back only when the paired (hard) version wins
  if (isHardway) {
    if (total === 4)  stake += bets.hardways.hard4;
    if (total === 6)  stake += bets.hardways.hard6;
    if (total === 8)  stake += bets.hardways.hard8;
    if (total === 10) stake += bets.hardways.hard10;
  }

  return stake;
}

/**
 * Computes the bets that remain on the table after this roll.
 *
 * Resolved bets (won or lost) are zeroed out. Unresolved bets stay at their
 * current values — they remain locked on the table.
 *
 * Clearing rules:
 *   Pass Line  — cleared on NATURAL, CRAPS_OUT, POINT_HIT, SEVEN_OUT.
 *                Locked on POINT_SET (point just set) and NO_RESOLUTION.
 *   Odds       — cleared on POINT_HIT or SEVEN_OUT. Locked otherwise.
 *   Hardways   — SEVEN_OUT clears ALL four hardway bets simultaneously.
 *                A hardway-number total (4/6/8/10) clears THAT bet, whether
 *                it was a paired win or a soft-number loss.
 *                Any other total leaves all hardway bets untouched.
 *
 * NOTE: crew with protective flags (e.g., Mathlete's hardwayProtected) should
 * restore zeroed values in their execute() before the cascade completes.
 */
function calcResolvedBets(
  dice: [number, number],
  rollResult: RollResult,
  bets: Readonly<Bets>,
): Bets {
  const total = dice[0] + dice[1];

  // Pass Line: cleared on any terminal result
  const passLineClears =
    rollResult === 'NATURAL' ||
    rollResult === 'CRAPS_OUT' ||
    rollResult === 'POINT_HIT' ||
    rollResult === 'SEVEN_OUT';

  // Odds: only resolves at the end of a point phase
  const oddsClears =
    rollResult === 'POINT_HIT' || rollResult === 'SEVEN_OUT';

  // Hardways: start from current values and zero out what resolves
  let { hard4, hard6, hard8, hard10 } = bets.hardways;

  if (rollResult === 'SEVEN_OUT' || (rollResult === 'NATURAL' && total === 7)) {
    // Seven-out and a come-out 7 (Natural) both wipe all hardway bets simultaneously
    hard4 = hard6 = hard8 = hard10 = 0;
  } else if (HARDWAY_NUMBERS.has(total)) {
    // The bet for this specific number resolves (win or soft loss)
    if (total === 4)  hard4  = 0;
    if (total === 6)  hard6  = 0;
    if (total === 8)  hard8  = 0;
    if (total === 10) hard10 = 0;
  }

  return {
    passLine: passLineClears ? 0 : bets.passLine,
    odds:     oddsClears     ? 0 : bets.odds,
    hardways: { hard4, hard6, hard8, hard10 },
  };
}

// ---------------------------------------------------------------------------
// EXPORTED CORE — calculateBasePayouts
// ---------------------------------------------------------------------------

/**
 * Computes all three base payouts from dice, result, point, and bets.
 *
 * Exported separately from resolveRoll() because Dice crew members (Lefty)
 * need to recalculate payouts after substituting new dice mid-cascade —
 * without reconstructing the entire TurnContext from scratch.
 *
 * @param dice        The final dice values to evaluate against.
 * @param rollResult  The pre-classified outcome for these dice.
 * @param activePoint The current point (null if COME_OUT phase).
 * @param bets        The player's active bets for this roll.
 * @returns           Gross payouts (positive = win, negative = loss) in cents.
 */
export function calculateBasePayouts(
  dice: [number, number],
  rollResult: RollResult,
  activePoint: number | null,
  bets: Readonly<Bets>,
): { passLine: number; odds: number; hardways: number; stakeReturned: number; resolvedBets: Bets } {
  const diceTotal = dice[0] + dice[1];
  const isHardway = dice[0] === dice[1] && HARDWAY_NUMBERS.has(diceTotal);

  return {
    passLine:      calcPassLinePayout(rollResult, bets.passLine),
    odds:          calcOddsPayout(rollResult, bets.odds, activePoint),
    hardways:      calcHardwaysPayout(dice, isHardway, rollResult, bets.hardways),
    stakeReturned: calcStakeReturned(dice, rollResult, isHardway, bets),
    resolvedBets:  calcResolvedBets(dice, rollResult, bets),
  };
}

// ---------------------------------------------------------------------------
// EXPORTED CORE — resolveRoll (the main entry point)
// ---------------------------------------------------------------------------

/**
 * The core Craps resolution engine. The server calls this immediately after
 * generating dice to produce a fresh TurnContext for the cascade.
 *
 * What it does:
 *   1. Computes the dice total and determines if it's a hardway combination.
 *   2. Classifies the roll outcome (NATURAL, SEVEN_OUT, etc.) based on phase.
 *   3. Calculates base payouts for Pass Line, Odds, and all Hardway bets.
 *   4. Returns a fully initialized TurnContext with cascade modifiers at
 *      their identity values (additives=0, multipliers=[], hype unchanged).
 *
 * What it does NOT do:
 *   - Generate dice (that's the server's crypto RNG responsibility).
 *   - Run crew abilities (that's resolveCascade()).
 *   - Apply Hype or multipliers to the payout (that's settleTurn()).
 *   - Mutate GameState (that's the API route handler's responsibility).
 *
 * @param dice   Server-generated [d1, d2] values. Each must be 1–6.
 * @param state  The relevant snapshot of GameState for this roll.
 */
export function resolveRoll(
  dice: [number, number],
  state: {
    phase: GamePhase;
    currentPoint: number | null;
    bets: Bets;
    hype: number;
    mechanicFreeze?: { lockedValue: number; rollsRemaining: number } | null;
  },
): TurnContext {
  const { phase, currentPoint, bets, hype } = state;

  // Validate dice input — catches bugs in test fixtures early
  if (
    dice[0] < 1 || dice[0] > 6 ||
    dice[1] < 1 || dice[1] > 6
  ) {
    throw new Error(`resolveRoll: invalid dice values [${dice[0]}, ${dice[1]}]. Each must be 1–6.`);
  }

  // ── Apply Mechanic freeze ───────────────────────────────────────────────────
  // If a freeze is active, replace dice[0] with the locked value. dice[1] rolls
  // freely as normal. The locked value was validated as 1–6 at the freeze endpoint
  // so it is always a legal die face. We compute mechanicLockedValue for the
  // receipt log; it is null when no freeze is in effect.
  const freeze = state.mechanicFreeze;
  const mechanicLockedValue: number | null =
    freeze && freeze.rollsRemaining > 0 ? freeze.lockedValue : null;
  const effectiveDice: [number, number] = mechanicLockedValue !== null
    ? [mechanicLockedValue, dice[1]]
    : dice;

  const diceTotal  = effectiveDice[0] + effectiveDice[1];
  const isHardway  = effectiveDice[0] === effectiveDice[1] && HARDWAY_NUMBERS.has(diceTotal);
  const rollResult = classifyDiceOutcome(effectiveDice, phase, currentPoint);

  // In POINT_ACTIVE, the active point is the current point; in COME_OUT it's null.
  // This distinction matters for Odds payout calculation.
  const activePoint = phase === 'POINT_ACTIVE' ? currentPoint : null;

  // Enforce the 3-4-5x Odds cap inside the engine so it applies regardless of
  // whether the upstream route validated the bet at placement time.
  // validateOddsBet() is the exported single source of truth for this rule.
  const effectiveBets: Bets =
    phase === 'POINT_ACTIVE' && currentPoint !== null
      ? { ...bets, odds: validateOddsBet(bets.passLine, bets.odds, currentPoint) }
      : bets;

  const payouts = calculateBasePayouts(effectiveDice, rollResult, activePoint, effectiveBets);

  return {
    // ── Dice state ──────────────────────────────────────────────────────
    dice:       effectiveDice,
    diceTotal,
    isHardway,

    // ── Roll classification ─────────────────────────────────────────────
    rollResult,
    activePoint,

    // ── Bets reference (read-only for crew) ────────────────────────────
    bets: effectiveBets,

    // ── Base payouts — profit only (stake tracked separately) ──────────
    basePassLinePayout: payouts.passLine,
    baseOddsPayout:     payouts.odds,
    baseHardwaysPayout: payouts.hardways,

    // ── Stake returned — for winning bets only, not amplified ───────────
    baseStakeReturned: payouts.stakeReturned,

    // ── Cascade modifiers — identity values (crew will mutate these) ────
    additives:   0,   // No flat bonuses yet
    multipliers: [],  // No multipliers yet (product of [] = 1.0)

    // ── Hype — carried in from GameState, crew may boost it ─────────────
    hype,

    // ── Flags — all false until a crew member or boss rule explicitly sets one ─
    flags: {
      sevenOutBlocked:   false,
      passLineProtected: false,
      hardwayProtected:  false,
      instantLoss:       false,
    },

    // ── Resolved bets — zeroed for any bet that won or lost this roll ────
    resolvedBets: payouts.resolvedBets,

    // ── Mechanic freeze — non-null when die 0 was locked this roll ───────
    mechanicLockedValue,
  };
}

// ---------------------------------------------------------------------------
// EXPORTED CORE — settleTurn (the final accounting step)
// ---------------------------------------------------------------------------

/**
 * Computes the total bankroll addition from a fully cascaded TurnContext.
 *
 * This is the last step in the roll pipeline. It separates the winning stake
 * (returned 1:1, not amplified) from the profit (amplified by Hype × crew multipliers).
 *
 * Formula:
 *   StakeReturned = ctx.baseStakeReturned              (not amplified)
 *   GrossProfit   = sum of all positive base payouts   (profit only)
 *   BoostedProfit = GrossProfit + additives
 *   FinalMult     = ctx.hype × product(ctx.multipliers)
 *   Result        = StakeReturned + floor(BoostedProfit × FinalMult)
 *
 * Design decisions:
 *   - Stakes are returned to the bankroll at exactly 1:1 — Hype does NOT amplify
 *     the return of your own bet. Only the PROFIT is boosted by the hype stack.
 *   - Losing bets (CRAPS_OUT, SEVEN_OUT, soft hardway) return 0 here because the
 *     bankroll was already reduced when those bets were placed. The engine never
 *     double-debits a loss.
 *   - Additives (e.g., The Shark's +$100) are treated as bonus profit and ARE
 *     amplified by Hype. If Hype is 2.0x, The Shark's bonus becomes effectively +$200.
 *   - Math.floor is used to avoid ever paying out fractional cents.
 *   - If there is no profit and no stake to return, the result is 0 — skip the
 *     multiplication entirely for efficiency.
 *
 * @param ctx  The final TurnContext after the cascade has run.
 * @returns    Total amount to ADD to the bankroll, in cents. Always ≥ 0.
 *             (Losses are implicit — they were deducted at bet placement time.)
 */
export function settleTurn(ctx: TurnContext): number {
  const { basePassLinePayout, baseOddsPayout, baseHardwaysPayout, baseStakeReturned } = ctx;

  // Sum the profit components (all ≥ 0 in the new model).
  const grossProfit = basePassLinePayout + baseOddsPayout + baseHardwaysPayout;

  // No wins at all — return 0. (Losses were already charged at placement.)
  if (grossProfit === 0 && baseStakeReturned === 0) {
    return 0;
  }

  // Apply crew flat bonuses to the profit portion only.
  // Additives: e.g., The Shark adds 10000 cents ($100) on a Point Hit.
  const boostedProfit = grossProfit + ctx.additives;

  // Compute the final multiplier stack.
  // ctx.hype was already modified by HYPE crew during the cascade.
  // ctx.multipliers contains each PAYOUT crew's contribution (e.g., [1.2] for The Whale).
  const crewMultiplier = ctx.multipliers.reduce((acc, m) => acc * m, 1.0);

  // Round the combined multiplier to 4 decimal places BEFORE the final floor().
  // This neutralises IEEE-754 imprecision that accumulates through successive
  // hype mutations (e.g., 1.2 × 1.5 = 1.7999... → 1.8 after rounding).
  // Without this, Math.floor(20000 × 2.1599...) = 43199 instead of 43200.
  const finalMultiplier = Math.round(ctx.hype * crewMultiplier * 10_000) / 10_000;

  // Floor to the nearest whole dollar (100 cents).
  // Payouts are always expressed in whole dollars — odd-denomination bets against
  // fractional odds (e.g. $11 Odds on point 6 at 6:5) or non-round hype multipliers
  // (e.g. 1.35×) would otherwise produce cent-level remainders (e.g. $13.20, $19.80).
  // Flooring to the dollar (rather than rounding) is the casino-standard: the house
  // does not make change, and the engine never over-pays.
  const amplifiedProfit = Math.floor((boostedProfit * finalMultiplier) / 100) * 100;

  // Total = stake returned (1:1, not amplified) + amplified profit.
  // baseStakeReturned is always a whole-dollar amount because all chip denominations
  // ($1, $5, $10, $25, $50) are multiples of 100 cents.
  return baseStakeReturned + amplifiedProfit;
}

// ---------------------------------------------------------------------------
// EXPORTED HELPER — buildRollReceipt (QA Transaction Log)
// ---------------------------------------------------------------------------

/** Formats a cent amount as a dollar string, e.g. 1050 → "$10.50". */
function fmtCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/**
 * Computes the total bet stakes lost this roll (bets that were already deducted
 * from bankroll at placement and are now gone without any return).
 *
 * Used by buildRollReceipt to compute a signed Net delta that correctly shows
 * losses as negative even when crew abilities (e.g. Floor Walker) partially
 * compensate via additives — those additives are profit, not stake recovery.
 *
 * Respects crew protective flags:
 *   - passLineProtected: pass line is not lost on SEVEN_OUT
 *   - hardwayProtected:  all hardway stakes are not lost on SEVEN_OUT
 */
function calcLostBetsThisRoll(ctx: TurnContext): number {
  const { rollResult, bets, diceTotal, isHardway, flags } = ctx;
  let lost = 0;

  switch (rollResult) {
    case 'SEVEN_OUT':
      if (!flags.passLineProtected) lost += bets.passLine;
      lost += bets.odds;
      if (!flags.hardwayProtected) {
        lost += bets.hardways.hard4 + bets.hardways.hard6 +
                bets.hardways.hard8 + bets.hardways.hard10;
      }
      break;

    case 'NATURAL':
      // A come-out 7 clears all hardway bets; a come-out 11 does not
      if (diceTotal === 7) {
        lost += bets.hardways.hard4 + bets.hardways.hard6 +
                bets.hardways.hard8 + bets.hardways.hard10;
      }
      break;

    case 'CRAPS_OUT':
      lost += bets.passLine;
      break;

    default:
      // Soft (easy) roll on a hardway number — that specific hardway is lost
      if (HARDWAY_NUMBERS.has(diceTotal) && !isHardway) {
        if (diceTotal === 4)  lost += bets.hardways.hard4;
        if (diceTotal === 6)  lost += bets.hardways.hard6;
        if (diceTotal === 8)  lost += bets.hardways.hard8;
        if (diceTotal === 10) lost += bets.hardways.hard10;
      }
      break;
  }

  return lost;
}

/**
 * Builds an itemized receipt for a single resolved roll.
 *
 * Called by the API route after settleTurn() so that every payout, cleared
 * bet, and modifier is captured in a structured, colour-coded log entry.
 *
 * Amounts shown for wins are the BASE profits (pre-Hype multiplier).
 * A separate 'info' line records the multiplier when it differs from 1.0,
 * allowing QA reviewers to verify: floor(sum(base profits) × mult) = net.
 *
 * netDelta = amplifiedProfit − lostBets
 *          = (settleTurn(ctx) − baseStakeReturned) − calcLostBetsThisRoll(ctx)
 *
 * This is always negative on a pure loss (even when crew add flat bonuses),
 * and positive only when winnings exceed losses.
 *
 * @param ctx  The FINAL TurnContext after the full cascade.
 */
export function buildRollReceipt(ctx: TurnContext): RollReceipt {
  const { dice, diceTotal, isHardway, rollResult, activePoint, bets } = ctx;
  const lines: RollReceiptLine[] = [];

  // ── Roll headline ─────────────────────────────────────────────────────────
  const hardLabel = HARDWAY_NUMBERS.has(diceTotal)
    ? (isHardway ? ' — Hard' : ' — Easy')
    : '';

  const resultLabel: Record<RollResult, string> = {
    NATURAL:       'Natural',
    CRAPS_OUT:     'Craps Out',
    POINT_SET:     `Point Set: ${diceTotal}`,
    POINT_HIT:     `Point Hit! (${activePoint})`,
    SEVEN_OUT:     'Seven Out',
    NO_RESOLUTION: `No Resolution (Point: ${activePoint ?? '?'})`,
  };

  lines.push({
    kind: 'roll',
    text: `Roll: ${diceTotal} [${dice[0]}, ${dice[1]}]${hardLabel} — ${resultLabel[rollResult]}`,
  });

  // ── Compute final multiplier (mirrors settleTurn) ─────────────────────────
  const crewMultiplier = ctx.multipliers.reduce((acc, m) => acc * m, 1.0);
  const finalMultiplier = Math.round(ctx.hype * crewMultiplier * 10_000) / 10_000;

  // ── Pass Line ─────────────────────────────────────────────────────────────
  if (bets.passLine > 0) {
    if (rollResult === 'NATURAL' || rollResult === 'POINT_HIT') {
      lines.push({
        kind: 'win',
        text: `Pass Line Won: ${fmtCents(ctx.basePassLinePayout)} (1:1)`,
      });
    } else if (rollResult === 'CRAPS_OUT') {
      lines.push({
        kind: 'loss',
        text: `Pass Line Lost: ${fmtCents(bets.passLine)} cleared`,
      });
    } else if (rollResult === 'SEVEN_OUT') {
      lines.push({
        kind: 'loss',
        text: `Pass Line Lost: ${fmtCents(bets.passLine)} cleared by Seven Out`,
      });
    }
    // POINT_SET / NO_RESOLUTION → bet stays frozen, no receipt line needed
  }

  // ── Odds ──────────────────────────────────────────────────────────────────
  if (bets.odds > 0) {
    if (rollResult === 'POINT_HIT' && activePoint !== null) {
      const ratio = ODDS_PAYOUT_RATIO[activePoint];
      const ratioStr = ratio !== undefined ? `${ratio[0]}:${ratio[1]}` : '?';
      lines.push({
        kind: 'win',
        text: `Odds Won: ${fmtCents(ctx.baseOddsPayout)} (${ratioStr} on Point ${activePoint})`,
      });
    } else if (rollResult === 'SEVEN_OUT') {
      lines.push({
        kind: 'loss',
        text: `Odds Lost: ${fmtCents(bets.odds)} cleared by Seven Out`,
      });
    }
    // NO_RESOLUTION → odds stay on the table, no receipt line needed
  }

  // ── Hardways ──────────────────────────────────────────────────────────────
  const hardwayEntries: [keyof HardwayBets, number][] = [
    ['hard4', 4], ['hard6', 6], ['hard8', 8], ['hard10', 10],
  ];

  if (rollResult === 'SEVEN_OUT' || (rollResult === 'NATURAL' && diceTotal === 7)) {
    // All active hardway bets are wiped simultaneously on a seven-out or come-out 7.
    const clearReason = rollResult === 'SEVEN_OUT' ? 'Seven Out' : 'Natural 7';
    for (const [key, num] of hardwayEntries) {
      const bet = bets.hardways[key];
      if (bet > 0) {
        lines.push({
          kind: 'loss',
          text: `Hard ${num} Lost: ${fmtCents(bet)} cleared by ${clearReason}`,
        });
      }
    }
  } else if (HARDWAY_NUMBERS.has(diceTotal)) {
    // Only the hardway matching the dice total can resolve this roll.
    for (const [key, num] of hardwayEntries) {
      if (num !== diceTotal) continue;
      const bet = bets.hardways[key];
      if (bet === 0) continue;

      if (isHardway) {
        // Paired dice → this hardway wins.
        const ratio = HARDWAY_PAYOUT_RATIO[num] ?? 0;
        lines.push({
          kind: 'win',
          text: `Hard ${num} Won: ${fmtCents(bet * ratio)} (${ratio}:1)`,
        });
      } else {
        // Soft ("easy") number → this hardway is cleared.
        lines.push({
          kind: 'loss',
          text: `Hard ${num} Lost: ${fmtCents(bet)} cleared by Easy ${num}`,
        });
      }
    }
  }

  // ── Crew flat bonus ───────────────────────────────────────────────────────
  if (ctx.additives > 0) {
    lines.push({
      kind: 'win',
      text: `Crew Bonus: +${fmtCents(ctx.additives)}`,
    });
  }

  // ── Mechanic freeze note ──────────────────────────────────────────────────
  if (ctx.mechanicLockedValue !== null) {
    lines.push({
      kind: 'info',
      text: `Mechanic: die locked at ${ctx.mechanicLockedValue}`,
    });
  }

  // ── Hype / multiplier note ────────────────────────────────────────────────
  if (finalMultiplier !== 1.0) {
    lines.push({
      kind: 'info',
      text: `Hype Applied: ${finalMultiplier.toFixed(2)}× (profits boosted)`,
    });
  }

  // Net delta: amplified profit minus lost stakes.
  // settleTurn(ctx) = baseStakeReturned + amplifiedProfit, so subtracting
  // baseStakeReturned isolates the profit. Then subtract lost stakes to get
  // the true signed net for this roll.
  const amplifiedProfit = settleTurn(ctx) - ctx.baseStakeReturned;
  const netDelta = amplifiedProfit - calcLostBetsThisRoll(ctx);

  return {
    timestamp: new Date().toISOString(),
    lines,
    netDelta,
  };
}
