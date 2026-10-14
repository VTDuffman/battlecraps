// =============================================================================
// BATTLECRAPS — POST /runs/:id/roll
// apps/api/src/routes/rolls.ts
//
// The critical-path endpoint. One request = one dice roll = one full cascade.
//
// Pipeline (in order):
//   1. Auth guard — verify the run belongs to the requesting user.
//   2. State guard — run must be in a rollable status (IDLE_TABLE | POINT_ACTIVE).
//   3. Bet validation — accept new bets from the request body, validate against bankroll.
//   4. RNG — generate dice server-side (crypto.getRandomValues).
//   5. resolveRoll() — classify outcome, compute base payouts.
//   6. resolveCascade() — run crew abilities left-to-right, collect events.
//   7. WebSocket emissions — emit each CascadeEvent to the run's room so the
//      client can animate portraits sequentially.
//   8. settleTurn() — apply Hype × multiplier stack, compute net bankroll delta.
//   9. State machine — advance run status, phase, point, shooters, hype.
//  10. Persist — write updated run to Postgres.
//  11. HTTP response — return the settled run state.
// =============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, lt } from 'drizzle-orm';

import {
  resolveRoll,
  resolveCascade,
  settleTurn,
  validateOddsBet,
  buildRollReceipt,
  MARKER_TARGETS,
  GAUNTLET,
  BOSS_RULE_HOOKS,
  COMP_PERK_IDS,
  getMaxBet,
  getMinBet,
  isBossMarker,
  getBossEntryCounter,
  getBossPayoffCents,
  getBaseHypeTick,
  OLD_PRO_ID,
  type CascadeEvent,
  type CrewMember,
  type Bets,
  type GamePhase,
  type RollResult,
  type TurnContext,
  type BossRuleParams,
  type BossRuleState,
} from '@battlecraps/shared';

import { db } from '../db/client.js';
import { runs, users, type RunRow, type UserRow, type StoredCrewSlots, type StoredCrewSlot } from '../db/schema.js';
import { rollDice, randomBelow } from '../lib/rng.js';
import { getIO } from '../lib/io.js';
import { hydrateCrewMember } from '../lib/crewRegistry.js';
import { evaluateUnlocks } from '../lib/unlocks.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { isDevClerkId } from '../lib/devAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';
import { submitLeaderboardEntry } from './leaderboard.js';

// ---------------------------------------------------------------------------
// Marker targets (gauntlet cash goals, in cents)
// ---------------------------------------------------------------------------

// MARKER_TARGETS is imported from @battlecraps/shared — single source of truth.
// See packages/shared/src/config.ts for the canonical values and documentation.

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Request / Response schemas (Fastify JSON Schema validation)
// ---------------------------------------------------------------------------

const betsSchema = {
  type: 'object',
  required: ['passLine', 'odds', 'hardways'],
  properties: {
    passLine: { type: 'integer', minimum: 0 },
    odds:     { type: 'integer', minimum: 0 },
    hardways: {
      type: 'object',
      required: ['hard4', 'hard6', 'hard8', 'hard10'],
      properties: {
        hard4:  { type: 'integer', minimum: 0 },
        hard6:  { type: 'integer', minimum: 0 },
        hard8:  { type: 'integer', minimum: 0 },
        hard10: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const rollBodySchema = {
  type: 'object',
  required: ['bets'],
  properties: {
    /**
     * Bets the player wants to place for THIS roll, in cents.
     * The server replaces run.bets with this value, validates against bankroll,
     * then proceeds to resolve the roll.
     */
    bets: betsSchema,
    /**
     * Predetermined dice values [die1, die2]. Honoured only when the user has
     * not completed the tutorial, or (FB-028) when an allowlisted developer is
     * rolling on a dev run. Ignored otherwise to prevent rigging real runs.
     */
    cheat_dice: {
      type: 'array',
      items: { type: 'integer', minimum: 1, maximum: 6 },
      minItems: 2,
      maxItems: 2,
    },
  },
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RollBody {
  bets:        Bets;
  cheat_dice?: [number, number];
}

interface RollParams {
  id: string; // run UUID
}

// ---------------------------------------------------------------------------
// WebSocket event payloads
// The client listens for these on the socket after subscribing to the run room.
// ---------------------------------------------------------------------------

/**
 * Emitted once per crew member that actually changed the TurnContext.
 * The client plays the portrait flash animation for slotIndex,
 * then optionally shows the contextDelta as floating text.
 *
 * Event name: 'cascade:trigger'
 */
type WsCascadeTriggerPayload = CascadeEvent;

/**
 * Emitted after all cascade events and bankroll settlement are complete.
 * The client uses this to update the bankroll display and run state.
 *
 * Event name: 'turn:settled'
 */
interface BossCutPayload {
  amount:  number;
  total:   number;
  payoff:  number;
  paidOff: boolean;
}

/**
 * FB-036: crew-bonus escrow this roll (The Hierophant; The Emissary later).
 * heldCents — what's held after this roll; releasedCents — paid to the bankroll
 * from escrow this roll; seizedCents — taken this roll (tribute / evaporation).
 */
interface EscrowPayload {
  heldCents:     number;
  releasedCents: number;
  seizedCents:   number;
}

interface WsTurnSettledPayload {
  runId:            string;
  dice:             [number, number];
  diceTotal:        number;
  rollResult:       string;
  bankrollDelta:    number;  // signed cents — positive = win, negative = loss
  newBankroll:      number;  // absolute cents after settlement
  newShooters:      number;
  newHype:          number;
  newPhase:         GamePhase;
  newPoint:         number | null;
  runStatus:        string;
  newMarkerIndex:   number;  // currentMarkerIndex after this roll (may have advanced)
  newBets:                 Bets;    // bets remaining on the table after this roll
  newConsecutivePointHits: number; // streak counter — drives base hype tick + client UI
  newBossPointHits:        number; // point hits in this boss segment (0 outside boss fights)
  /**
   * Per-zone win amounts in cents (post-multiplier, pre-additives).
   * Used by the client to render floating payout pops over each bet zone.
   * All three are 0 on a losing roll.
   */
  payoutBreakdown:  { passLine: number; odds: number; hardways: number };
  /**
   * Present only when Lefty McGuffin blocked a seven-out.
   * The dice the player actually rolled (summing to 7) before the re-roll.
   * The client uses this for the two-stage dread→relief cinematic.
   */
  originalDice?: [number, number];
  /**
   * Present only when The Physics Professor nudged the dice.
   * The paired dice values before the nudge so the client can animate a
   * physical flip from original face to corrected face.
   */
  nudgedFrom?: [number, number];
  /**
   * Present when POSEIDONS_FAVOR suppressed a craps-out on the shooter's first roll.
   * The rollResult will be NO_RESOLUTION; this flag signals the client to skip the
   * craps-out animation and let the come-out phase continue.
   */
  crapsOutBlocked?: boolean;
  /** CONVERGENCE (The Architect): crew slot index permanently removed by this seven-out. */
  removedCrewSlot?: number;
  /**
   * @deprecated — FIRST_CONTACT_PROTOCOL retired in FB-026. Never emitted from FB-026 onwards.
   * Previously signalled that a come-out natural was suppressed by FCP.
   */
  naturalBlocked?: boolean;
  /**
   * The highest gauntlet marker index the player has ever reached, after this roll.
   * Updated when a marker is cleared; otherwise carries the user's previous best.
   */
  highestMarkerReached: number;
  /** Sarge's DOUBLE_TIME clock ran out: a blank on the last allowed roll became a SEVEN_OUT. */
  clockExpired?: boolean;
  /**
   * FB-032: The Foreman's Cut. Present on every roll of a payoff fight.
   * amount = skimmed this roll; total = running Cut (after this roll);
   * payoff = the Payoff; paidOff = this roll reached it (marker cleared).
   */
  bossCut?: BossCutPayload;
  /**
   * Index of the crew slot currently enchanted by Mme. Le Prix.
   * Present only during a DISABLE_CREW boss fight.
   * Client uses this to update the ❤️ indicator on the charmed portrait.
   */
  charmedCrewSlot?: number;
  /**
   * True when the enchanted crew's ability WOULD HAVE triggered on this roll but
   * was suppressed by the charm. The client fires the charm heartbeat
   * only when this is true — not on every roll in the boss fight.
   * Absent (not false) when the charm did not suppress an active ability.
   */
  charmFired?: boolean;
  /**
   * Present on every roll during a CROSS_CALIBRATION (The Executive) boss fight.
   * Describes the performance review rating state after this roll resolves.
   * `changed` is false when the rating was already clamped (0 or 4) or the outcome
   * was neutral (POINT_SET / NO_RESOLUTION). `direction` is null when unchanged.
   */
  bossRating?: {
    index: number;
    changed: boolean;
    direction: 'up' | 'down' | null;
  };
  /**
   * Present (and true) only when The Executive's Pink Slip fires — the rating was
   * at 0 (Action Required) and another Craps Out or Seven-Out occurred.
   * The client plays the PIP variant of his TERMINATED defeat cinematic (FB-035).
   */
  pipTermination?: true;
  /**
   * FB-035: the +15% Exceptional bonus actually paid on this roll (The
   * Executive at rating 4, winning roll). Omitted when 0.
   */
  exceptionalBonusCents?: number;
  /** FB-036: crew-bonus escrow facts (escrow fights only). */
  escrow?: EscrowPayload;
  /** FB-036: The Covenant kept the shooter on this Seven-Out. */
  covenantSaved?: true;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function rollsPlugin(app: FastifyInstance): Promise<void> {
  app.post<{ Params: RollParams; Body: RollBody }>(
    '/runs/:id/roll',
    { schema: { body: rollBodySchema }, preHandler: [requireClerkAuth] },
    rollHandler,
  );
}

// ---------------------------------------------------------------------------
// Core handler
// ---------------------------------------------------------------------------

async function rollHandler(
  request: FastifyRequest<{ Params: RollParams; Body: RollBody }>,
  reply: FastifyReply,
): Promise<void> {
  // ── 0. Identity ───────────────────────────────────────────────────────────
  // clerkId verified by requireClerkAuth preHandler; resolve to internal UUID.
  const user = await resolveUserByClerkId(request.clerkId);
  if (!user) {
    return reply.status(401).send({ error: 'User not found — please re-sign in.' });
  }
  const userId = user.id;

  const runId = request.params.id;

  // ── 1. Load run ───────────────────────────────────────────────────────────
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
  });

  if (run === undefined) {
    return reply.status(404).send({ error: 'Run not found.' });
  }

  // ── 2. Ownership guard ─────────────────────────────────────────────────────
  if (run.userId !== userId) {
    return reply.status(403).send({ error: 'Forbidden.' });
  }

  // FB-028: dev runs skip every side effect that outlives the run
  // (leaderboard, unlocks, users.maxBankrollCents / highestMarkerReached).
  const isDevRun = run.isDevRun === true;

  // ── 3. State guard ────────────────────────────────────────────────────────
  // Only allow rolling when the run is waiting for a roll.
  if (run.status !== 'IDLE_TABLE' && run.status !== 'POINT_ACTIVE') {
    return reply.status(409).send({
      error: `Cannot roll in status "${run.status}". Run must be IDLE_TABLE or POINT_ACTIVE.`,
    });
  }

  // ── 3b. Boss rule hooks (active during boss markers only) ─────────────────
  const bossMarkerConfig = GAUNTLET[run.currentMarkerIndex];
  const bossHooks        = bossMarkerConfig?.boss ? BOSS_RULE_HOOKS[bossMarkerConfig.boss.ruleParams.rule] : undefined;
  const bossParams       = bossMarkerConfig?.boss ? bossMarkerConfig.boss.ruleParams : undefined;
  const activeBossRule   = bossMarkerConfig?.boss?.rule ?? null;
  const isHierophantEscrow  = activeBossRule === 'TRIBUTE'             && isBossMarker(run.currentMarkerIndex);
  const isTransmissionDelay = activeBossRule === 'TRANSMISSION_DELAY'  && isBossMarker(run.currentMarkerIndex);
  const isOrbitalDecay      = activeBossRule === 'ORBITAL_DECAY'       && isBossMarker(run.currentMarkerIndex);
  const isCrossCalibrationBoss = activeBossRule === 'CROSS_CALIBRATION' && isBossMarker(run.currentMarkerIndex);
  const bossState: BossRuleState = { bossPointHits: run.bossPointHits, markerIndex: run.currentMarkerIndex };
  // FB-036: The Covenant ("The Order Protects") — once per marker, the first
  // Seven-Out doesn't cost a shooter. Available while it hasn't been used at
  // this marker. Earned after the Hierophant, so it applies from Floor 6 on.
  const hasTheCovenant      = (run.compPerkIds as number[]).includes(COMP_PERK_IDS.THE_COVENANT);
  const covenantAvailable   = hasTheCovenant && run.covenantSpentMarker !== run.currentMarkerIndex;

  // ── 3c. Stuck-state catch-all ─────────────────────────────────────────────
  // If the run has already drifted into an unrecoverable state (bankroll below
  // the minimum bet, no chips on the table to recover from), end it now rather
  // than producing a confusing 422 validation loop. This is a defensive guard
  // for any edge case where computeNextState's isBelowMinBet check was bypassed.
  if (isBelowMinBet(run.bankrollCents, run.bets as Bets, run.currentMarkerIndex)) {
    const stuckRun = await db
      .update(runs)
      .set({ status: 'GAME_OVER', updatedAt: new Date() })
      .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
      .returning();

    if (!stuckRun[0]) {
      return reply.status(409).send({ error: 'Conflict: run was modified by another request. Please retry.' });
    }

    if (!isDevRun) {
      void submitLeaderboardEntry(user as UserRow, stuckRun[0]).catch((err: unknown) => {
        request.log.error({ err }, '[leaderboard] submission error (stuck-state)');
      });
    }

    const stuckIO = getIO();
    const stuckPayload: WsTurnSettledPayload = {
      runId,
      dice:                    [1, 1],
      diceTotal:               2,
      rollResult:              'CRAPS_OUT',
      bankrollDelta:           0,
      newBankroll:             run.bankrollCents,
      newShooters:             run.shooters,
      newHype:                 run.hype,
      newPhase:                run.phase as GamePhase,
      newPoint:                run.currentPoint ?? null,
      runStatus:               'GAME_OVER',
      newMarkerIndex:          run.currentMarkerIndex,
      newBets:                 run.bets as Bets,
      newConsecutivePointHits: run.consecutivePointHits,
      newBossPointHits:        run.bossPointHits,
      payoutBreakdown:         { passLine: 0, odds: 0, hardways: 0 },
      highestMarkerReached:    user.highestMarkerReached,
    };
    stuckIO.to(`run:${runId}`).emit('turn:settled', stuckPayload);

    return reply.status(200).send({
      run: stuckRun[0],
      roll: {
        autoClear:       true,
        dice:            [1, 1] as [number, number],
        diceTotal:       2,
        rollResult:      'CRAPS_OUT' as const,
        bankrollDelta:   0,
        resolvedBets:    run.bets as Bets,
        payoutBreakdown: { passLine: 0, odds: 0, hardways: 0 },
        mechanicFreeze:  null,
      },
    });
  }

  // ── 4. Bet validation ──────────────────────────────────────────────────────
  //
  // Deduct-on-placement model: the DB bankroll already reflects bets placed in
  // prior rolls this turn (e.g., passLine deducted at POINT_SET). Only the
  // DELTA (newly added bets this roll) is validated against the current bankroll.
  //
  // Working bets (odds, hardways) are "off" by default and the player may take
  // them down at any time — betDelta can be negative when they do. Only the
  // Pass Line is locked once set; it cannot be reduced mid-roll.
  const incomingBets = request.body.bets;
  const betDelta = sumBets(incomingBets) - sumBets(run.bets);

  // ── 4b. Post-bet marker clear guard ──────────────────────────────────────
  // Check this BEFORE any bet validation so players whose bankroll already
  // meets the marker target can advance via the ADVANCE button regardless of
  // their current bet state (e.g., no passLine during COME_OUT phase).
  //
  // finalBankroll = postBetBankroll + sumBets(incomingBets)
  //              = run.bankrollCents + sumBets(run.bets)   [total player wealth]
  // No deductions apply — returned bets are not winnings.
  const postBetBankroll     = run.bankrollCents - betDelta;
  const postBetMarkerTarget = MARKER_TARGETS[run.currentMarkerIndex];
  // FB-032: a payoff marker (The Foreman) clears on his Cut reaching the
  // Payoff, never on bankroll. This also catches a Cut that crossed the Payoff
  // on a roll whose branch doesn't check for a clear (e.g. a crew bonus on craps).
  const payoffCents         = getBossPayoffCents(run.currentMarkerIndex);
  const alreadyClears       = payoffCents !== null
    ? run.bossProgressCents >= payoffCents
    : postBetMarkerTarget !== undefined && postBetBankroll >= postBetMarkerTarget;
  if (alreadyClears) {
    const remainingBets  = sumBets(incomingBets);
    const rawBankroll    = postBetBankroll + remainingBets;
    // FB-036: anything still held in escrow is paid out with the clear — the
    // Hierophant's offering with Hype (as on any win), the Emissary's flat.
    const escrowOnClear  = activeBossRule === 'TRIBUTE' && isBossMarker(run.currentMarkerIndex)
      ? Math.floor(run.pendingAdditiveCents * run.hype / 100) * 100
      : run.pendingAdditiveCents;
    const bankrollDelta  = sumBets(run.bets as Bets) + escrowOnClear;   // bets returned + escrow paid
    const isLastMarker   = run.currentMarkerIndex >= MARKER_TARGETS.length - 1;
    const nextStatus     = isLastMarker ? 'GAME_OVER' : 'TRANSITION';
    const nextMkrIndex   = run.currentMarkerIndex + 1;
    const finalBankroll  = rawBankroll + escrowOnClear;
    const zeroBets: Bets = { passLine: 0, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } };

    const autoRun = await db
      .update(runs)
      .set({
        status:                nextStatus,
        phase:                 'COME_OUT',
        bankrollCents:         finalBankroll,
        currentPoint:          null,
        bets:                  zeroBets,
        currentMarkerIndex:    nextMkrIndex,
        consecutivePointHits:  0,
        bossPointHits:         getBossEntryCounter(nextMkrIndex),
        bossProgressCents:     0,
        pendingAdditiveCents:  0,
        pointPhaseBlankStreak: 0,
        mechanicFreeze:        null,
        hype:                  run.hype,
        shooters:              run.shooters,
        highestRollAmplifiedCents: run.highestRollAmplifiedCents,
        updatedAt:             new Date(),
      })
      .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
      .returning();

    if (!autoRun[0]) {
      return reply.status(409).send({ error: 'Conflict: run was modified by another request. Please retry.' });
    }

    if (nextStatus === 'GAME_OVER' && !isDevRun) {
      void submitLeaderboardEntry(user as UserRow, autoRun[0]).catch((err: unknown) => {
        request.log.error({ err }, '[leaderboard] submission error (auto-clear)');
      });
    }

    return reply.status(200).send({
      run: autoRun[0],
      roll: {
        autoClear:       true,
        dice:            [1, 6] as [number, number],
        diceTotal:       7,
        rollResult:      'POINT_HIT' as const,
        bankrollDelta:   bankrollDelta,
        resolvedBets:    zeroBets,
        payoutBreakdown: { passLine: 0, odds: 0, hardways: 0 },
        mechanicFreeze:  null,
      },
    });
  }

  // Pass Line is locked once placed — it may not be reduced.
  if (incomingBets.passLine < run.bets.passLine) {
    return reply.status(422).send({
      error: 'Pass Line bets cannot be reduced.',
    });
  }

  // Newly added bets (positive delta) must be affordable. A negative delta
  // means working bets were taken down — the refund is always affordable.
  if (betDelta > run.bankrollCents) {
    return reply.status(422).send({
      error: `Insufficient funds: need ${betDelta}¢, have ${run.bankrollCents}¢.`,
    });
  }

  // ── Table max: 10 % of marker target (15 % with Old Pro), floored at 5× boss min ─
  const hasOldPro = (run.crewSlots as StoredCrewSlots).some((c) => c?.crewId === OLD_PRO_ID);
  const maxBet = getMaxBet(run.currentMarkerIndex, run.bossPointHits, hasOldPro ? 0.15 : 0.10);

  // ── Death Spiral: The Commander halves max bet when hype < 0.5× ──────────
  const isDeathSpiralHalving =
    activeBossRule === 'ORBITAL_DECAY' &&
    isBossMarker(run.currentMarkerIndex) &&
    run.hype < 0.5;
  const effectiveMaxBet = isDeathSpiralHalving
    ? Math.floor(maxBet / 2 / 500) * 500   // halved, snapped to nearest $5
    : maxBet;

  if (incomingBets.passLine > effectiveMaxBet) {
    return reply.status(422).send({
      error: `Pass Line bet of ${incomingBets.passLine}¢ exceeds the table maximum of ${effectiveMaxBet}¢ ($${effectiveMaxBet / 100}).`,
    });
  }

  const hwKeys = ['hard4', 'hard6', 'hard8', 'hard10'] as const;
  for (const key of hwKeys) {
    if (incomingBets.hardways[key] > effectiveMaxBet) {
      return reply.status(422).send({
        error: `${key} bet of ${incomingBets.hardways[key]}¢ exceeds the table maximum of ${effectiveMaxBet}¢ ($${effectiveMaxBet / 100}).`,
      });
    }
  }

  // Odds bets are only legal once a point is set.
  if (incomingBets.odds > 0 && run.phase !== 'POINT_ACTIVE') {
    return reply.status(422).send({
      error: 'Odds bets can only be placed during POINT_ACTIVE phase.',
    });
  }

  // Enforce the 3-4-5x Odds cap at placement time so the player gets an
  // immediate rejection rather than a silent adjustment at roll time.
  if (incomingBets.odds > 0 && run.phase === 'POINT_ACTIVE' && run.currentPoint !== null) {
    const maxOdds = validateOddsBet(incomingBets.passLine, incomingBets.odds, run.currentPoint);
    if (incomingBets.odds > maxOdds) {
      return reply.status(422).send({
        error: `Odds bet of ${incomingBets.odds}¢ exceeds the allowed limit for point ${run.currentPoint}. Maximum: ${maxOdds}¢.`,
      });
    }
  }

  // Minimum pass-line bet required to roll during come-out.
  if (run.phase === 'COME_OUT' && incomingBets.passLine === 0) {
    return reply.status(422).send({
      error: 'A Pass Line bet is required to roll during COME_OUT phase.',
    });
  }

  // ── Regular minimum bet (scales with marker difficulty) ────────────────
  // Enforced on come-out only — the player cannot change their passLine bet
  // once the point is set, so there is nothing to enforce during POINT_ACTIVE.
  const regularMinBet = getMinBet(run.currentMarkerIndex);
  if (run.phase === 'COME_OUT' && incomingBets.passLine < regularMinBet) {
    return reply.status(422).send({
      error: `Minimum Pass Line bet is $${regularMinBet / 100}. Add more chips before rolling.`,
    });
  }

  // ── Boss fight: bet-validation hook (The Sovereign's tide minimum) ────────
  // validateBet returns null (accept) or an error string (reject, 422).
  // Come-out only: the Pass Line is locked once the point is set, and boss
  // minimums only move at come-out resolution.
  if (bossHooks?.validateBet && run.phase === 'COME_OUT') {
    const bossError = bossHooks.validateBet(incomingBets, bossParams!, bossState);
    if (bossError !== null) {
      return reply.status(422).send({ error: bossError });
    }
  }

  // ── 5. Hydrate crew slots ─────────────────────────────────────────────────
  //
  // The database stores { crewId, cooldownState } pairs. We reconstruct full
  // CrewMember objects (with execute() methods) here before the cascade runs.
  const crewSlots = hydrateCrewSlots(run.crewSlots);

  // ── 6. Generate dice (server-side RNG, or tutorial predetermined values) ────
  // cheat_dice is honoured only (a) during the tutorial, or (b) for an
  // allowlisted developer on a dev run (FB-028). Requiring a dev run means even
  // the developer can never rig a real run. Forced dice replace the RNG before
  // the cascade, so dice-modifying crew still apply.
  const cheatDice = request.body.cheat_dice;
  const isDevForcedRoll = cheatDice !== undefined && isDevRun && isDevClerkId(request.clerkId);
  let dice: [number, number] =
    cheatDice !== undefined && (!user.tutorialCompleted || isDevForcedRoll)
      ? cheatDice
      : rollDice();
  if (isDevForcedRoll) {
    request.log.info({ runId, cheatDice }, '[dev] forced dice');
  }

  // ── 7. Resolve roll — classify outcome and compute base payouts ────────────
  // ── Death Spiral — cascade slot penalty at hype < 0.75× ──────────────────
  const isDeathSpiralSlotPenalty =
    activeBossRule === 'ORBITAL_DECAY' &&
    isBossMarker(run.currentMarkerIndex) &&
    run.hype < 0.75;
  const effectiveUnlockedSlots = isDeathSpiralSlotPenalty
    ? Math.max(1, (run.unlockedSlots as number) - 1) as 3 | 4 | 5
    : run.unlockedSlots as 3 | 4 | 5;

  const initialCtx = resolveRoll(dice, {
    phase:                 run.phase as 'COME_OUT' | 'POINT_ACTIVE',
    currentPoint:          run.currentPoint ?? null,
    bets:                  incomingBets,
    hype:                  run.hype,
    mechanicFreeze:        (run.mechanicFreeze as { lockedValue: number; rollsRemaining: number } | null | undefined) ?? null,
    previousRollTotal:     run.previousRollTotal ?? null,
    shooterRollCount:      run.shooterRollCount,
    pointPhaseBlankStreak: run.pointPhaseBlankStreak,
    markerTargetCents:     GAUNTLET[run.currentMarkerIndex]?.targetCents ?? 0,
    shooters:              run.shooters,
    unlockedSlots:         effectiveUnlockedSlots,
  });

  // ── 7b. Base-game Hype tick ────────────────────────────────────────────────
  //
  // Applied to initialCtx.hype BEFORE resolveCascade so crew HYPE bonuses
  // stack on top of the already-seeded excitement.
  //   POINT_HIT  → getBaseHypeTick(consecutivePointHits): 0.15→0.20→0.25→0.30 (streak-based)
  //   NATURAL    → +0.10
  //   CRAPS_OUT  → −0.05 (floored at 1.0) — skipped when Poseidon's Favor blocks it
  //
  // POSEIDONS_FAVOR: the shooter's first-roll craps-out doesn't count. Decided
  // here, before the hype tick, so a blocked roll costs no Hype.
  const hasPoseidonsFavor = (run.compPerkIds as number[]).includes(COMP_PERK_IDS.POSEIDONS_FAVOR);
  const poseidonBlocksCrapsOut =
    hasPoseidonsFavor &&
    run.shooterRollCount === 0 &&
    initialCtx.rollResult === 'CRAPS_OUT';
  const baseHypeTick =
    initialCtx.rollResult === 'POINT_HIT'   ? getBaseHypeTick(run.consecutivePointHits)
    : initialCtx.rollResult === 'NATURAL'   ?  0.10
    : initialCtx.rollResult === 'CRAPS_OUT' && !poseidonBlocksCrapsOut ? -0.05
    : 0;
  const seededHype = Math.max(
    1.0,
    Math.round((initialCtx.hype + baseHypeTick) * 10_000) / 10_000,
  );
  const seededCtx = baseHypeTick !== 0
    ? { ...initialCtx, hype: seededHype }
    : initialCtx;

  // ── 7c. Boss outcome modifier ─────────────────────────────────────────────
  const outcomeCtx = bossHooks?.modifyOutcome
    ? bossHooks.modifyOutcome(seededCtx, bossParams!, bossState)
    : seededCtx;

  // ── 7d. POSEIDONS_FAVOR — block craps-out on first shooter roll ───────────────
  // Applied BEFORE the cascade so crew never see the suppressed CRAPS_OUT. The
  // roll doesn't count: the Pass Line stays on the table (no stake lost) and
  // computeNextState keeps the shooter on the come-out (crapsOutBlocked flag).
  const poseidonCtx = poseidonBlocksCrapsOut && outcomeCtx.rollResult === 'CRAPS_OUT'
    ? {
        ...outcomeCtx,
        rollResult:   'NO_RESOLUTION' as const,
        resolvedBets: { ...outcomeCtx.resolvedBets, passLine: outcomeCtx.bets.passLine },
        flags:        { ...outcomeCtx.flags, crapsOutBlocked: true },
      }
    : outcomeCtx;

  // ── 8. Run the Clockwise Cascade ───────────────────────────────────────────
  //
  // Each crew member's execute() fires left-to-right (slot 0 → 4), each one
  // seeing the TurnContext as modified by all previous crew members.
  //
  // For CONVERGENCE: inject the PRE-roll seven-out count into TurnContext as
  // bossSevenOutCount (informational — no hook or crew reads it today).
  const isConvergenceBoss = activeBossRule === 'CONVERGENCE' && isBossMarker(run.currentMarkerIndex);
  const preCascadeCtx = isConvergenceBoss
    ? { ...poseidonCtx, bossSevenOutCount: run.bossPointHits }
    : poseidonCtx;

  const cascadeResult = resolveCascade(crewSlots, preCascadeCtx, rollDice, bossHooks, bossParams, bossState);
  const { finalContext: cascadeContext, events, updatedCrewSlots } = cascadeResult;

  // ── DOUBLE_TIME (Sarge): the roll clock — FB-030 ─────────────────────────
  // bossPointHits = point-phase rolls already used. If this roll is a blank on
  // the last allowed roll, time's up: convert it to a SEVEN_OUT AFTER the
  // cascade, so blank-roll crew (Grinder) still paid for it while crew that
  // react to a dice Seven-Out (Lefty, Floor Walker, Lucky Charm) did not fire.
  // Pass Line and Odds are lost and every Hardway clears; a Hardway that won on
  // this roll still pays (its payout and stake are already in the context).
  const isDoubleTime = activeBossRule === 'DOUBLE_TIME' && isBossMarker(run.currentMarkerIndex);
  const doubleTimeLimit = isDoubleTime
    ? (bossParams as Extract<BossRuleParams, { rule: 'DOUBLE_TIME' }>).rollLimit
    : 0;
  const clockExpired =
    isDoubleTime &&
    run.phase === 'POINT_ACTIVE' &&
    cascadeContext.rollResult === 'NO_RESOLUTION' &&
    run.bossPointHits + 1 >= doubleTimeLimit;
  const finalContext: TurnContext = clockExpired
    ? {
        ...cascadeContext,
        rollResult:   'SEVEN_OUT',
        resolvedBets: { passLine: 0, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
        // Clear any crew save flags: e.g. Lefty re-rolled a real 7 into a blank on
        // the last roll — the clock still runs out and the shooter is still lost.
        flags: {
          ...cascadeContext.flags,
          clockExpired:      true,
          sevenOutBlocked:   false,
          passLineProtected: false,
          hardwayProtected:  false,
        },
      }
    : cascadeContext;

  // ── CONVERGENCE: track the last crew slot that fired this roll ──────────────
  // Used by Targeted Demolition (step 8f / computeNextState) to identify which
  // slot to permanently remove on SEVEN_OUT.
  const lastTriggeredSlot = events.length > 0
    ? (events[events.length - 1]?.slotIndex ?? null)
    : null;

  // ── CROSS_CALIBRATION: PIP termination check ─────────────────────────────
  // When the rating is at 0 (Action Required) and another bad outcome lands,
  // the Pink Slip fires — GAME_OVER regardless of remaining shooters.
  // Uses the post-cascade rollResult so Lefty's save and Poseidon's block
  // are respected (they change the result before we check).
  //
  // bossPointHits is the stored rating. Every marker-entry write initializes it
  // via getBossEntryCounter() (2 = Strong), so a stored 0 always means Action Required.
  const effectiveRating = run.bossPointHits;
  const pipTermination = (
    isCrossCalibrationBoss &&
    effectiveRating === 0 &&
    (finalContext.rollResult === 'CRAPS_OUT' || finalContext.rollResult === 'SEVEN_OUT')
  );

  // ── DISABLE_CREW: reselect charmed slot after each come-out resolution ────
  // Fires on NATURAL, CRAPS_OUT, POINT_HIT, SEVEN_OUT (any result that ends
  // a come-out or point phase and starts a new come-out).
  // POINT_SET and NO_RESOLUTION hold the current charm — same slot persists
  // through the point phase.
  const isDisableCrewBoss =
    activeBossRule === 'DISABLE_CREW' && isBossMarker(run.currentMarkerIndex);
  const comesOutResolved =
    finalContext.rollResult === 'NATURAL'   ||
    finalContext.rollResult === 'CRAPS_OUT' ||
    finalContext.rollResult === 'POINT_HIT' ||
    finalContext.rollResult === 'SEVEN_OUT';

  // ── DISABLE_CREW: detect if charmed crew would have fired this roll ─────────
  // The charmed slot was excluded from slotOrder in the cascade. Check whether
  // that slot's crew member was ready to fire (non-null, within unlocked range,
  // cooldownState === 0). If so, the enchantment actively negated an ability —
  // triggers the charm heartbeat on the client.
  const currentCharmSlot  = bossState.bossPointHits;
  const charmedCrewMember = isDisableCrewBoss ? (crewSlots[currentCharmSlot] ?? null) : null;
  // Test whether the charmed crew member would have fired on this roll.
  // We call execute() with the pre-cascade context and a no-op rollDice that returns
  // the actual rolled dice (avoids consuming real RNG from crypto source). We then
  // compare the output context against the input to detect any game-affecting change.
  // Only when there is an observable change do we set charmFired: true so the client
  // plays the charm heartbeat — not on every roll in the boss fight.
  const charmedWouldHaveFired = (() => {
    if (!isDisableCrewBoss || charmedCrewMember === null) return false;
    if (currentCharmSlot >= (run.unlockedSlots as number)) return false;
    if (charmedCrewMember.cooldownState !== 0) return false;
    const noopRoll: () => [number, number] = () => dice;
    try {
      const { context: out } = charmedCrewMember.execute(preCascadeCtx, noopRoll);
      const inp = preCascadeCtx;
      return (
        out.additives          !== inp.additives          ||
        out.hype               !== inp.hype               ||
        out.rollResult         !== inp.rollResult         ||
        out.multipliers.length !== inp.multipliers.length ||
        out.dice[0]            !== inp.dice[0]            ||
        out.dice[1]            !== inp.dice[1]            ||
        out.resolvedBets.passLine        !== inp.resolvedBets.passLine        ||
        out.resolvedBets.hardways.hard4  !== inp.resolvedBets.hardways.hard4  ||
        out.resolvedBets.hardways.hard6  !== inp.resolvedBets.hardways.hard6  ||
        out.resolvedBets.hardways.hard8  !== inp.resolvedBets.hardways.hard8  ||
        out.resolvedBets.hardways.hard10 !== inp.resolvedBets.hardways.hard10
      );
    } catch {
      return false;
    }
  })();

  let nextCharmSlot: number | null = null;
  if (isDisableCrewBoss && comesOutResolved) {
    // Collect filled slot indices within the unlocked range.
    const filledSlots = crewSlots
      .slice(0, run.unlockedSlots as number)
      .map((slot, i) => (slot !== null ? i : -1))
      .filter((i): i is number => i >= 0);
    if (filledSlots.length > 0) {
      const pick = randomBelow(filledSlots.length);
      nextCharmSlot = filledSlots[pick] ?? 0;
    }
  }

  // ── 8b. The Vig comp — scale crew additive bonuses by 1.20 ─────────────────
  // Applied post-cascade so individual crew execute() functions stay unaware.
  // Rounds to the nearest dollar (100 cents) per project convention.
  const hasTheVig = (run.compPerkIds as number[]).includes(COMP_PERK_IDS.THE_VIG);
  const viggedContext = hasTheVig && finalContext.additives > 0
    ? { ...finalContext, additives: Math.round(finalContext.additives * 1.2 / 100) * 100 }
    : finalContext;

  // ── 8f. CONVERGENCE (Load-Bearing) — cumulative 15% additive penalty per removed slot ─
  // bossPointHits = number of slots already removed this boss fight (0–5).
  // Each removed slot compounds a further 15% reduction: additives × 0.85^N.
  // Rounds to the nearest dollar (100 cents) per project convention.
  // Applied after Vig so the +20% bonus is penalised alongside base additives.
  const loadPenaltyFactor = isConvergenceBoss
    ? Math.pow(0.85, run.bossPointHits)
    : 1.0;
  const loadBearingContext = isConvergenceBoss && viggedContext.additives > 0
    ? { ...viggedContext, additives: Math.floor(viggedContext.additives * loadPenaltyFactor / 100) * 100 }
    : viggedContext;

  // ── 8d. TRIBUTE (Hierophant Escrow) — hold additives; don't pass to settleTurn ─
  // When Hierophant escrow is active, zero out additives before settlement —
  // they accumulate in pendingAdditiveCents until a winning roll (FB-036, 9e/9f).
  const escrowHeld = isHierophantEscrow ? loadBearingContext.additives : 0;
  const escrowContext = isHierophantEscrow
    ? { ...loadBearingContext, additives: 0 }
    : loadBearingContext;

  // ── 8e. TRANSMISSION_DELAY (Emissary) — hold additives; don't pass to settleTurn ─
  // Additives are zeroed for settlement this roll; stored in pendingAdditiveCents
  // for release next roll. Unlike Hierophant (held until a win), TD evaporates
  // 100% of the escrow when the shooter dies. Hierophant and TD are mutually exclusive
  // (different floors) so chaining escrowContext here is safe.
  const tdEscrowHeld = isTransmissionDelay ? escrowContext.additives : 0;
  const tdEscrowContext = isTransmissionDelay
    ? { ...escrowContext, additives: 0 }
    : escrowContext;

  // ── 9. Settle the turn ─────────────────────────────────────────────────────
  //
  // Deduct-on-placement model:
  //   payout    = stake returned + amplified profit (0 on losses)
  //   newBankroll = run.bankrollCents - betDelta + payout
  //   bankrollDelta = newBankroll - run.bankrollCents = payout - betDelta
  //
  // Examples:
  //   NATURAL  ($10 bet): payout=2000, betDelta=1000 → delta=+1000 (+$10 profit)
  //   CRAPS_OUT($10 bet): payout=0,    betDelta=1000 → delta=-1000 (-$10 loss)
  //   SEVEN_OUT (bets already deducted at POINT_SET): betDelta=0 → delta=0
  //   POINT_SET (bets frozen): payout=0, betDelta=passLine → delta=-passLine
  const rawPayout = settleTurn(tdEscrowContext);
  const bossModifiedPayout = bossHooks?.modifyPayout
    ? bossHooks.modifyPayout(rawPayout, tdEscrowContext.baseStakeReturned, bossParams!, bossState)
    : rawPayout;

  // ── FB-032: The Foreman's Cut → Payoff ────────────────────────────────────
  // His Cut is exactly what modifyPayout skimmed. It accumulates over the fight;
  // reaching the Payoff is the ONLY way to clear his room (see computeNextState).
  const cutThisRoll       = payoffCents !== null ? Math.max(0, rawPayout - bossModifiedPayout) : 0;
  const newBossProgress   = payoffCents !== null ? run.bossProgressCents + cutThisRoll : 0;
  const payoffReached     = payoffCents !== null && newBossProgress >= payoffCents;
  // ── CROSS_CALIBRATION: Exceptional rating (4) → 1.15× gross profit ────────
  // Applied at the same layer as the Foreman's extortion tax, but in the player's
  // favor. Rounds to the nearest dollar (100 cents) per project convention.
  const crossCalibrationExceptionalBonus = (isCrossCalibrationBoss && effectiveRating === 4)
    ? (() => {
        const stake = tdEscrowContext.baseStakeReturned;
        const grossProfit = bossModifiedPayout - stake;
        return grossProfit > 0 ? Math.round(grossProfit * 0.15 / 100) * 100 : 0;
      })()
    : 0;
  const payout = bossModifiedPayout + crossCalibrationExceptionalBonus;
  const newBankroll = run.bankrollCents - betDelta + payout;

  // ── 9b. TRIBUTE has no modifySevenOut hook — its escrow logic is inline below (9e/9f) ──
  const tributedBankroll = newBankroll;

  // ── 9c. THE_FREQUENCY comp — flat bonus on come-out naturals ──────────────
  // Awards 3% of marker target (rounded to nearest $1) on any real NATURAL
  // during COME_OUT. Applied before computeNextState so the marker-clear check
  // uses the fully settled bankroll.
  const hasTheFrequency = (run.compPerkIds as number[]).includes(COMP_PERK_IDS.THE_FREQUENCY);
  const frequencyBonus = (
    hasTheFrequency &&
    finalContext.rollResult === 'NATURAL' &&
    run.phase === 'COME_OUT'
  ) ? Math.round(GAUNTLET[run.currentMarkerIndex]!.targetCents * 0.03 / 100) * 100
    : 0;
  const postFrequencyBankroll = tributedBankroll + frequencyBonus;

  // ── 9e/9f. Crew-bonus escrow (Hierophant TRIBUTE / Emissary TRANSMISSION_DELAY) ─
  // Hierophant (FB-036): "the offering" — crew bonuses pile up in escrow until
  // a WINNING roll (Natural / Point Hit), which releases all of it multiplied
  // by the Hype; a 7-out seizes escrowSeizurePct of it (with Hype), the rest paid.
  // Emissary: each roll releases the PREVIOUS roll's bonuses and holds this
  // roll's; on a 7-out the whole escrow (previous AND this roll's) evaporates.
  // Hierophant and TD are mutually exclusive (different floors).
  const isEscrowSevenOut  = finalContext.rollResult === 'SEVEN_OUT';
  const heldThisRoll      = isTransmissionDelay ? tdEscrowHeld : escrowHeld;
  const escrowWithHype    = (cents: number): number => Math.floor(cents * finalContext.hype / 100) * 100;
  let escrowRelease: number;
  let escrowCarried: number;
  let escrowSeized:  number;
  if (isHierophantEscrow) {
    const offering   = run.pendingAdditiveCents + heldThisRoll;
    const isWin      = finalContext.rollResult === 'NATURAL' || finalContext.rollResult === 'POINT_HIT';
    if (isEscrowSevenOut || isWin) {
      const p = GAUNTLET[run.currentMarkerIndex]!.boss!.ruleParams as Extract<BossRuleParams, { rule: 'TRIBUTE' }>;
      const seizurePct = isEscrowSevenOut ? p.escrowSeizurePct : 0;
      const pot        = escrowWithHype(offering);
      escrowRelease = Math.floor(pot * (1 - seizurePct) / 100) * 100;
      escrowSeized  = pot - escrowRelease;
      escrowCarried = 0;
    } else {
      escrowRelease = 0;
      escrowSeized  = 0;
      escrowCarried = offering;
    }
  } else {
    // Emissary (and a stray pending balance anywhere else, so it's never stranded).
    const escrowOnTable = run.pendingAdditiveCents + (isEscrowSevenOut ? heldThisRoll : 0);
    const seizurePct    = isEscrowSevenOut && isTransmissionDelay ? 1 : 0;
    escrowRelease = Math.floor(escrowOnTable * (1 - seizurePct) / 100) * 100;
    escrowSeized  = escrowOnTable - escrowRelease;
    // Carried to the next roll — nothing carries past a 7-out.
    escrowCarried = isEscrowSevenOut ? 0 : heldThisRoll;
  }
  const postEscrowBankroll = postFrequencyBankroll + escrowRelease;

  const rollAmplifiedProfit = payout - viggedContext.baseStakeReturned;
  const newHighestRollAmplifiedCents = Math.max(
    run.highestRollAmplifiedCents,
    rollAmplifiedProfit,
  );

  // Build the QA receipt with per-crew attribution and boss deduction breakdown.
  const bossDeductionAmount = rawPayout - payout;
  const bossDeductions: Array<{ amount: number; source: string; label: string }> = [];
  if (bossDeductionAmount > 0 && bossMarkerConfig?.boss) {
    bossDeductions.push({ amount: bossDeductionAmount, source: bossMarkerConfig.boss.name, label: 'extortion fee' });
  }
  // ── 11. Advance state machine ─────────────────────────────────────────────
  const hasSeaLegs = (run.compPerkIds as number[]).includes(COMP_PERK_IDS.SEA_LEGS);
  // FB-036: The Covenant saves this shooter (a real Seven-Out Lefty didn't block).
  const covenantSaved = covenantAvailable && viggedContext.rollResult === 'SEVEN_OUT' && !viggedContext.flags.sevenOutBlocked;
  const nextState = computeNextState(run, viggedContext, postEscrowBankroll, incomingBets, hasSeaLegs, lastTriggeredSlot, payoffReached, covenantSaved);

  // ── DISABLE_CREW: override bossPointHits with the newly selected charm slot ─
  const charmAdjustedState = nextCharmSlot !== null
    ? { ...nextState, bossPointHits: nextCharmSlot }
    : nextState;
  // ── CROSS_CALIBRATION: PIP termination overrides status to GAME_OVER ──────
  const pipAdjustedState = pipTermination
    ? { ...charmAdjustedState, status: 'GAME_OVER' as const }
    : charmAdjustedState;

  // ── Escrow: a roll that clears the marker pays out what it just held ──────
  // The next marker has no escrow rule, so held bonuses would otherwise be lost.
  // (The Hierophant's offering pays with Hype, as on any win.)
  const clearsMarkerNow   = pipAdjustedState.currentMarkerIndex > run.currentMarkerIndex;
  const escrowPaidOnClear = clearsMarkerNow
    ? (isHierophantEscrow ? escrowWithHype(escrowCarried) : escrowCarried)
    : 0;
  const pendingAdditiveToPersist = clearsMarkerNow ? 0 : escrowCarried;
  const finalNextState = escrowPaidOnClear > 0
    ? { ...pipAdjustedState, bankrollCents: pipAdjustedState.bankrollCents + escrowPaidOnClear }
    : pipAdjustedState;

  // Settled bankroll for this roll, including escrow paid out on a marker clear.
  const settledBankroll = postEscrowBankroll + escrowPaidOnClear;
  const bankrollDelta   = settledBankroll - run.bankrollCents;

  // ── CROSS_CALIBRATION: compute bossRating for socket payload ──────────────
  // Emitted on every roll in the boss fight. `changed` and `direction` tell the
  // client whether to animate a rating transition. On PIP (clamp at 0), changed
  // is false and direction is null — the client infers termination from pipTermination.
  const bossRatingPayload = isCrossCalibrationBoss
    ? (() => {
        const oldRating = effectiveRating;
        const newRating = finalNextState.bossPointHits;
        const changed = newRating !== oldRating;
        return {
          index: newRating,
          changed,
          direction: changed ? (newRating > oldRating ? 'up' as const : 'down' as const) : null,
        };
      })()
    : undefined;

  const hitMarker      = finalNextState.currentMarkerIndex > run.currentMarkerIndex;
  const newMarkerIndex = finalNextState.currentMarkerIndex;

  const bossCutPayload: BossCutPayload | undefined = payoffCents !== null
    ? { amount: cutThisRoll, total: newBossProgress, payoff: payoffCents, paidOff: payoffReached && hitMarker }
    : undefined;

  const escrowPayload: EscrowPayload | undefined = (isHierophantEscrow || isTransmissionDelay)
    ? {
        heldCents:     pendingAdditiveToPersist,
        releasedCents: escrowRelease + escrowPaidOnClear,
        seizedCents:   escrowSeized,
      }
    : undefined;

  // The persisted bossPointHits for this roll.
  // For DISABLE_CREW: on come-out resolution, this is the newly selected charm
  // slot (nextCharmSlot overrode finalNextState.bossPointHits). On POINT_SET /
  // NO_RESOLUTION, it preserves the current charm. The initial entry charm is
  // chosen at recruit time (recruit.ts), not here, so the first boss come-out
  // always fires against the crew the player actually recruited.
  const persistedBossPointHits = finalNextState.bossPointHits;

  // ── Hype reset note for roll log ──────────────────────────────────────────
  let hypeResetNote: string | undefined;
  if (hitMarker) {
    hypeResetNote = 'Marker Cleared — Hype resets to 1.00×';
  } else if (finalContext.rollResult === 'SEVEN_OUT') {
    if (isOrbitalDecay && isBossMarker(run.currentMarkerIndex)) {
      const decayParams = GAUNTLET[run.currentMarkerIndex]!.boss!.ruleParams as
        Extract<BossRuleParams, { rule: 'ORBITAL_DECAY' }>;
      const decayAmount =
        run.hype >= 2.5 ? decayParams.onFireDecay
        : run.hype >= 1.5 ? decayParams.heatingUpDecay
        : decayParams.baseDecay;
      const cascadeHypeDelta = Math.max(0, finalContext.hype - run.hype);
      const nextHype = Math.max(
        decayParams.hypeFloor,
        Math.round((run.hype - decayAmount + cascadeHypeDelta) * 10_000) / 10_000,
      );
      const tier = run.hype >= 2.5 ? 'On Fire' : run.hype >= 1.5 ? 'Heating Up' : 'Below 1.5×';
      hypeResetNote = `Commander: −${decayAmount.toFixed(2)}× (${tier}) → ${nextHype.toFixed(2)}×`;
    } else if (hasSeaLegs) {
      const nextHype = Math.round((1.0 + (finalContext.hype - 1.0) / 2) * 10_000) / 10_000;
      hypeResetNote = `Seven Out — The Keepsake: Hype holds at ${nextHype.toFixed(2)}×`;
    } else {
      hypeResetNote = 'Seven Out — Hype resets to 1.00×';
    }
    if (clockExpired) hypeResetNote = `Time's up! ${hypeResetNote}`;
    if (covenantSaved) hypeResetNote = `The Covenant — the order protects: your shooter stays. ${hypeResetNote}`;
  }

  const receipt = buildRollReceipt(
    loadBearingContext,
    events,
    bossDeductions.length > 0 ? bossDeductions : undefined,
    { prevHype: run.hype, seededHype, resetNote: hypeResetNote },
    // FB-036: escrow fights — crew cash goes to the escrow; show what it paid / lost.
    escrowPayload !== undefined && bossMarkerConfig?.boss
      ? {
          releasedCents: escrowPayload.releasedCents,
          seizedCents:   escrowPayload.seizedCents,
          label:         isHierophantEscrow ? 'The offering' : 'The transmission',
          seizedBy:      bossMarkerConfig.boss.name,
          seizeLabel:    isHierophantEscrow ? 'tribute' : 'lost in transmission',
        }
      : undefined,
  );

  // ── CONVERGENCE: Targeted Demolition — persist the removed slot as null ───
  // nextState.removedSlotIndex is non-null only on a CONVERGENCE SEVEN_OUT.
  // The cascade ran with the pre-removal crew; the DB write permanently zeroes
  // the targeted slot so it is absent from all future cascade runs.
  const removedSlotIndex = finalNextState.removedSlotIndex;
  const finalUpdatedCrewSlots: (CrewMember | null)[] = removedSlotIndex !== null
    ? updatedCrewSlots.map((slot, i) => i === removedSlotIndex ? null : slot)
    : [...updatedCrewSlots];

  // ── 11c. Mechanic freeze lifecycle ───────────────────────────────────────
  // If a freeze was applied this roll, decrement rollsRemaining.
  // Clear on seven-out (shooter ends) or when the count reaches 0.
  const currentFreeze = (run.mechanicFreeze as { lockedValue: number; rollsRemaining: number } | null | undefined) ?? null;
  let nextMechanicFreeze: { lockedValue: number; rollsRemaining: number } | null = currentFreeze;

  if (finalContext.rollResult === 'SEVEN_OUT') {
    // Shooter ends — freeze always clears regardless of remaining count.
    nextMechanicFreeze = null;
  } else if (currentFreeze !== null && finalContext.mechanicLockedValue !== null) {
    // A locked roll just happened — tick down.
    const remaining = currentFreeze.rollsRemaining - 1;
    nextMechanicFreeze = remaining > 0 ? { ...currentFreeze, rollsRemaining: remaining } : null;
  }

  // ── 12. Persist (with optimistic locking) ─────────────────────────────────
  // Include updatedAt in the WHERE clause so that a concurrent request that
  // modified the run between our read and this write will cause 0 rows to be
  // updated, which we detect and return 409 Conflict.
  const updatedRun = await db
    .update(runs)
    .set({
      status:             finalNextState.status,
      phase:              finalNextState.phase,
      bankrollCents:      finalNextState.bankrollCents,
      shooters:           finalNextState.shooters,
      currentPoint:       finalNextState.currentPoint,
      hype:                 finalNextState.hype,
      consecutivePointHits: finalNextState.consecutivePointHits,
      bossPointHits:        persistedBossPointHits,
      // FB-032: running Cut toward the Payoff; resets when the marker changes.
      bossProgressCents:    hitMarker ? 0 : newBossProgress,
      bets:                 finalNextState.bets,
      crewSlots:          serialiseCrewSlots(
                            finalUpdatedCrewSlots,
                            finalNextState.shooters < run.shooters, // new shooter → reset per_shooter cooldowns
                          ),
      mechanicFreeze:        nextMechanicFreeze,
      currentMarkerIndex:    finalNextState.currentMarkerIndex,
      previousRollTotal:     finalNextState.previousRollTotal,
      shooterRollCount:      finalNextState.shooterRollCount,
      pointPhaseBlankStreak: finalNextState.pointPhaseBlankStreak,
      highestRollAmplifiedCents: newHighestRollAmplifiedCents,
      pendingAdditiveCents: pendingAdditiveToPersist,
      // FB-036: remember where The Covenant's save was used (once per marker).
      covenantSpentMarker:  covenantSaved ? run.currentMarkerIndex : run.covenantSpentMarker,
      updatedAt:             new Date(),
    })
    .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
    .returning();

  const persistedRun = updatedRun[0];
  if (persistedRun === undefined) {
    return reply.status(409).send({
      error: 'Conflict: run was modified by another request. Please retry.',
    });
  }

  // ── 12b. Unlock evaluation (fire-and-forget) ──────────────────────────────
  if (!isDevRun) {
    void evaluateUnlocks(
      userId,
      user as UserRow,
      finalContext,
      nextState,
      persistedRun,
      events,
      runId,
    ).catch((err: unknown) => {
      request.log.error({ err }, '[unlocks] evaluation error');
    });
  }

  // ── 12c. Leaderboard submission (fire-and-forget) ─────────────────────────
  // submitLeaderboardEntry is idempotent via ON CONFLICT (run_id) DO NOTHING.
  // Uses finalNextState.status so PIP termination (CROSS_CALIBRATION) is captured.
  if (finalNextState.status === 'GAME_OVER' && !isDevRun) {
    void submitLeaderboardEntry(user as UserRow, persistedRun).catch((err: unknown) => {
      request.log.error({ err }, '[leaderboard] submission error');
    });
  }

  // ── 12d. Update personal-best bankroll (fire-and-forget) ──────────────────
  // Conditional update: the WHERE clause ensures this only writes to the DB
  // when newBankroll actually exceeds the stored max. On most rolls this is a
  // no-op (0 rows matched). Fire-and-forget so it doesn't add latency to the
  // hot path; the client also tracks this locally for immediate display.
  if (!isDevRun) {
    void db
      .update(users)
      .set({ maxBankrollCents: settledBankroll })
      .where(and(eq(users.id, userId), lt(users.maxBankrollCents, settledBankroll)))
      .catch((err: unknown) => {
        request.log.error({ err }, '[roll] Failed to update maxBankrollCents');
      });
  }

  void db
    .update(runs)
    .set({ peakBankrollCents: settledBankroll })
    .where(and(eq(runs.id, runId), lt(runs.peakBankrollCents, settledBankroll)))
    .catch((err: unknown) => {
      request.log.error({ err }, '[roll] Failed to update peakBankrollCents');
    });

  if (hitMarker && newMarkerIndex > user.highestMarkerReached && !isDevRun) {
    void db
      .update(users)
      .set({ highestMarkerReached: newMarkerIndex })
      .where(eq(users.id, userId))
      .catch((err: unknown) => {
        request.log.error({ err }, '[roll] Failed to update highestMarkerReached');
      });
  }

  // ── 13. WebSocket — emit cascade events + settlement summary ────────────────
  //
  // Emitted AFTER persistence so the client never receives events for a roll
  // that failed to persist (e.g., due to optimistic lock conflict).
  //
  // Room: 'run:{runId}' — the client subscribes on connect.
  const io = getIO();
  const runRoom = `run:${runId}`;

  for (const event of events) {
    const payload: WsCascadeTriggerPayload = event;
    io.to(runRoom).emit('cascade:trigger', payload);
  }
  // Per-zone win amounts for the client's floating payout pops.
  // Apply the same final multiplier as settleTurn() but per-zone so each
  // bet zone can show its own "+$X.XX" pop. Crew additives (flat bonuses)
  // are not included — they are not attributable to a specific zone.
  const finalMultiplier =
    Math.round(
      finalContext.hype *
      finalContext.multipliers.reduce((acc, m) => acc * m, 1.0) *
      10_000,
    ) / 10_000;
  const payoutBreakdown = {
    passLine: Math.floor(finalContext.basePassLinePayout * finalMultiplier),
    odds:     Math.floor(finalContext.baseOddsPayout     * finalMultiplier),
    hardways: Math.floor(finalContext.baseHardwaysPayout * finalMultiplier),
  };

  const settledPayload: WsTurnSettledPayload = {
    runId,
    dice:            finalContext.dice,
    diceTotal:       finalContext.diceTotal,
    rollResult:      finalContext.rollResult,
    bankrollDelta,
    newBankroll:     persistedRun.bankrollCents,
    newShooters:     persistedRun.shooters,
    newHype:         persistedRun.hype,
    newPhase:        persistedRun.phase as GamePhase,
    newPoint:        persistedRun.currentPoint ?? null,
    runStatus:       persistedRun.status,
    newMarkerIndex:  persistedRun.currentMarkerIndex,
    newBets:                 finalNextState.bets,
    newConsecutivePointHits: finalNextState.consecutivePointHits,
    newBossPointHits:        persistedBossPointHits,
    payoutBreakdown,
    ...(finalContext.flags.sevenOutBlocked && { originalDice: dice }),
    ...(finalContext.flags.nudgedFrom !== undefined && { nudgedFrom: finalContext.flags.nudgedFrom }),
    ...(finalContext.flags.crapsOutBlocked && { crapsOutBlocked: true }),
    ...(removedSlotIndex !== null && { removedCrewSlot: removedSlotIndex }),
    highestMarkerReached: (hitMarker && !isDevRun)
      ? Math.max(user.highestMarkerReached, newMarkerIndex)
      : user.highestMarkerReached,
    ...(finalContext.flags.clockExpired && { clockExpired: true }),
    ...(bossCutPayload !== undefined && { bossCut: bossCutPayload }),
    ...(escrowPayload !== undefined && { escrow: escrowPayload }),
    ...(covenantSaved && { covenantSaved: true as const }),
    ...(isDisableCrewBoss && { charmedCrewSlot: persistedBossPointHits }),
    ...(charmedWouldHaveFired && { charmFired: true }),
    ...(bossRatingPayload !== undefined && { bossRating: bossRatingPayload }),
    ...(pipTermination && { pipTermination: true as const }),
    ...(crossCalibrationExceptionalBonus > 0 && { exceptionalBonusCents: crossCalibrationExceptionalBonus }),
  };
  io.to(runRoom).emit('turn:settled', settledPayload);

  // ── 14. HTTP response ──────────────────────────────────────────────────────
  return reply.status(200).send({
    run: {
      ...persistedRun,
      highestMarkerReached: (hitMarker && !isDevRun)
        ? Math.max(user.highestMarkerReached, newMarkerIndex)
        : user.highestMarkerReached,
    },
    roll: {
      dice:          finalContext.dice,
      diceTotal:     finalContext.diceTotal,
      rollResult:    finalContext.rollResult,
      cascadeEvents: events,
      bankrollDelta,
      receipt,
      // The fully resolved bet state after all wipes and clears.
      // The store uses this to immediately sync the table — the server
      // is the single source of truth for what chips are on the felt.
      resolvedBets:    finalNextState.bets,
      // Included here so the client can apply the full settlement from the
      // HTTP response without depending on the WebSocket turn:settled event.
      payoutBreakdown,
      // Updated freeze state so the client knows how many rolls remain.
      mechanicFreeze:  nextMechanicFreeze,
      ...(finalContext.flags.sevenOutBlocked && { originalDice: dice }),
      ...(finalContext.flags.nudgedFrom !== undefined && { nudgedFrom: finalContext.flags.nudgedFrom }),
      // Charmed crew slot for Mme. Le Prix (DISABLE_CREW boss) — mirrors WsTurnSettledPayload
      // so the HTTP path can update the store without depending on the WebSocket event.
      ...(isDisableCrewBoss && { charmedCrewSlot: persistedBossPointHits }),
      ...(charmedWouldHaveFired && { charmFired: true }),
      ...(bossRatingPayload !== undefined && { bossRating: bossRatingPayload }),
      ...(pipTermination && { pipTermination: true as const }),
      ...(crossCalibrationExceptionalBonus > 0 && { exceptionalBonusCents: crossCalibrationExceptionalBonus }),
      ...(finalContext.flags.crapsOutBlocked && { crapsOutBlocked: true as const }),
      ...(finalContext.flags.clockExpired && { clockExpired: true as const }),
      ...(bossCutPayload !== undefined && { bossCut: bossCutPayload }),
      ...(escrowPayload !== undefined && { escrow: escrowPayload }),
      ...(covenantSaved && { covenantSaved: true as const }),
      ...(removedSlotIndex !== null && { removedCrewSlot: removedSlotIndex }),
    },
  });
}

// ---------------------------------------------------------------------------
// State Machine — computeNextState
// ---------------------------------------------------------------------------

/**
 * Derives the next run state from the final TurnContext after cascade + settlement.
 *
 * Handles all RollResult transitions:
 *   NATURAL       → bankroll += delta; reset bets (passLine resolved); stay COME_OUT
 *   CRAPS_OUT     → bankroll += delta (negative); reset passLine; stay COME_OUT
 *   POINT_SET     → set currentPoint; transition to POINT_ACTIVE phase; bets freeze
 *   POINT_HIT     → bankroll += delta; clear point; return to COME_OUT; reset bets
 *                    → check for TRANSITION (marker hit)
 *   SEVEN_OUT     → bankroll += delta (negative); lose shooter (unless blocked);
 *                    reset hype to 1.0; return to COME_OUT; check GAME_OVER
 *   NO_RESOLUTION → no bankroll change; bets persist; phase unchanged
 *
 * Per-shooter cooldown reset: any crew with cooldownType === 'per_shooter' has
 * their cooldown reset to 0 when a new shooter starts (after SEVEN_OUT or POINT_HIT
 * transitions back to COME_OUT). This is handled in serialiseCrewSlots via the
 * updatedCrewSlots from the cascade, so the reset logic lives HERE for new-shooter
 * transitions.
 */
function computeNextState(
  run:                 RunRow,
  finalCtx:            ReturnType<typeof resolveRoll>,
  newBankroll:         number,
  incomingBets:        Bets,
  hasSeaLegs:          boolean = false,
  lastTriggeredSlot?:  number | null,
  /** FB-032: this roll's Cut brought the boss Payoff total to/over the Payoff. */
  payoffReached:       boolean = false,
  /** FB-036: The Covenant keeps the shooter on this Seven-Out. */
  covenantSaved:       boolean = false,
): {
  status:               RunRow['status'];
  phase:                RunRow['phase'];
  bankrollCents:        number;
  shooters:             number;
  currentPoint:         number | null;
  hype:                 number;
  bets:                 Bets;
  currentMarkerIndex:    number;
  consecutivePointHits:  number;
  bossPointHits:         number;
  previousRollTotal:     number | null;
  shooterRollCount:      number;
  pointPhaseBlankStreak: number;
  removedSlotIndex:      number | null;
} {
  const { rollResult, flags } = finalCtx;
  const currentMarkerIndex = run.currentMarkerIndex;

  // ── Marker clear check — the single source of truth for every branch ──────
  // Normal markers clear when the bankroll reaches the target. A payoff marker
  // (FB-032, The Foreman) clears ONLY when his Cut reaches the Payoff; bankroll
  // never clears it.
  const isPayoffMarker = getBossPayoffCents(currentMarkerIndex) !== null;
  const clearsMarker = (bankroll: number): boolean => {
    if (isPayoffMarker) return payoffReached;
    const target = MARKER_TARGETS[currentMarkerIndex];
    return target !== undefined && bankroll >= target;
  };

  // ── Boss counter (bossPointHits) — meaning depends on the active rule ─────
  //   DOUBLE_TIME:       Sarge's clock — point-phase rolls used (+1 per blank, 0 otherwise).
  //   TIDAL_SURGE:       tide stage — advances on every come-out resolution.
  //   CROSS_CALIBRATION: Executive's rating (0–4).
  //   DISABLE_CREW:      Le Prix's charmed slot (overridden in the roll handler).
  //   CONVERGENCE:       Architect's seven-out count (handled in the SEVEN_OUT branch).
  // nextBossCounter() keeps this consistent across all result branches.
  const activeBossRule     = GAUNTLET[currentMarkerIndex]?.boss?.rule ?? null;
  const isTidalSurge       = activeBossRule === 'TIDAL_SURGE';
  const isDoubleTime       = activeBossRule === 'DOUBLE_TIME'         && isBossMarker(currentMarkerIndex);
  const isOrbitalDecay     = activeBossRule === 'ORBITAL_DECAY'       && isBossMarker(currentMarkerIndex);
  const isConvergence      = activeBossRule === 'CONVERGENCE'         && isBossMarker(currentMarkerIndex);
  const isCrossCalibration = activeBossRule === 'CROSS_CALIBRATION'   && isBossMarker(currentMarkerIndex);
  const effectiveBossPointHits = run.bossPointHits;
  const tidalCycleTotal = isTidalSurge && isBossMarker(currentMarkerIndex)
    ? (() => {
        const p = GAUNTLET[currentMarkerIndex]!.boss!.ruleParams as
          Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
        return p.stageMultipliers.length;
      })()
    : 0;

  const nextBossCounter = (current: number, result: RollResult, hitMarker: boolean): number => {
    if (hitMarker) {
      // Clearing a marker: initialize the destination marker's boss counter.
      return getBossEntryCounter(currentMarkerIndex + 1);
    }
    if (isTidalSurge) {
      if (!isBossMarker(currentMarkerIndex)) return 0;
      const advancesToComeOut =
        result === 'NATURAL'    ||
        result === 'CRAPS_OUT'  ||
        result === 'POINT_HIT'  ||
        result === 'SEVEN_OUT';
      return advancesToComeOut ? (current + 1) % tidalCycleTotal : current;
    }
    if (isCrossCalibration) {
      // Rating movement: Natural/Point Hit → +1 (cap 4); Craps Out/Seven-Out → −1 (floor 0).
      // POINT_SET and NO_RESOLUTION are neutral — no change.
      if (result === 'NATURAL' || result === 'POINT_HIT') return Math.min(4, current + 1);
      if (result === 'CRAPS_OUT' || result === 'SEVEN_OUT') return Math.max(0, current - 1);
      return current;
    }
    if (isDoubleTime) {
      // Clock ticks on each blank point-phase roll; any other result (a new
      // come-out, point set, or the point resolving) resets it.
      return result === 'NO_RESOLUTION' ? current + 1 : 0;
    }
    return current;
  };

  // Use the resolved bets from the final TurnContext — this is the authoritative
  // post-roll bet state, including any crew modifications (e.g. Mathlete restoring
  // a hardway bet that would have been cleared by a soft roll).
  const clearedBets = finalCtx.resolvedBets;

  switch (rollResult) {
    // ── Come-out wins / losses ──────────────────────────────────────────────

    case 'NATURAL': {
      // A Natural pays out immediately — the bankroll can cross a marker threshold
      // on a come-out win just as easily as on a POINT_HIT. Check here too.
      const hitMarker     = clearsMarker(newBankroll);
      const naturalStatus = hitMarker
        ? (currentMarkerIndex >= MARKER_TARGETS.length - 1 ? 'GAME_OVER' : 'TRANSITION')
        : isBelowMinBet(newBankroll, clearedBets, currentMarkerIndex)
          ? 'GAME_OVER'
          : 'IDLE_TABLE';

      return {
        status:               naturalStatus,
        phase:                'COME_OUT',
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         null,
        hype:                 hitMarker ? 1.0 : finalCtx.hype,  // Reset to 1.0× on marker clear; otherwise accumulates
        bets:                 clearedBets,
        currentMarkerIndex:   hitMarker ? currentMarkerIndex + 1 : currentMarkerIndex,
        consecutivePointHits: run.consecutivePointHits, // streak unaffected by naturals
        bossPointHits:         nextBossCounter(effectiveBossPointHits, rollResult, hitMarker),
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
        removedSlotIndex:      null,
      };
    }

    case 'CRAPS_OUT':
      return {
        status:               isBelowMinBet(newBankroll, clearedBets, currentMarkerIndex)
                                ? 'GAME_OVER'
                                : 'IDLE_TABLE',
        phase:                'COME_OUT',
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         null,
        hype:                 finalCtx.hype,  // Hype is NOT reset on craps-out (only 7-out)
        bets:                 clearedBets,
        currentMarkerIndex,
        consecutivePointHits:  run.consecutivePointHits, // streak unaffected by craps-out
        bossPointHits:         nextBossCounter(effectiveBossPointHits, rollResult, false),
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
        removedSlotIndex:      null,
      };

    // ── Point established ───────────────────────────────────────────────────

    case 'POINT_SET':
      // No payout. PassLine/odds bets freeze — hardways that won or soft-lost on
      // this same roll are already zeroed in clearedBets (resolvedBets). Using
      // clearedBets here ensures a hardway that hit its number on the point-setting
      // roll is properly cleared rather than silently carried over.
      return {
        status:               'POINT_ACTIVE',
        phase:                'POINT_ACTIVE',
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         finalCtx.diceTotal,
        hype:                 finalCtx.hype,
        bets:                 clearedBets,
        currentMarkerIndex,
        consecutivePointHits:  run.consecutivePointHits, // unchanged until the point resolves
        bossPointHits:         nextBossCounter(effectiveBossPointHits, rollResult, false),
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
        removedSlotIndex:      null,
      };

    // ── Point hit — check for marker / game completion ─────────────────────

    case 'POINT_HIT': {
      // Did the player hit a gauntlet marker?
      const hitMarker    = clearsMarker(newBankroll);

      let nextStatus: RunRow['status'];
      if (hitMarker) {
        // Check if the player just hit the FINAL marker (boss gauntlet clear)
        nextStatus = currentMarkerIndex >= MARKER_TARGETS.length - 1
          ? 'GAME_OVER'
          : 'TRANSITION';  // → "Seven-Proof Pub" recruitment
      } else if (isBelowMinBet(newBankroll, clearedBets, currentMarkerIndex)) {
        nextStatus = 'GAME_OVER';
      } else {
        nextStatus = 'IDLE_TABLE';
      }

      return {
        status:               nextStatus,
        phase:                'COME_OUT',     // New come-out after point resolved
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         null,
        hype:                 hitMarker ? 1.0 : finalCtx.hype, // Reset to 1.0× on marker clear; otherwise persists
        bets:                 clearedBets,
        currentMarkerIndex:   hitMarker ? currentMarkerIndex + 1 : currentMarkerIndex,
        // Streak resets on marker clear (new chapter); otherwise increments.
        consecutivePointHits:  hitMarker ? 0 : run.consecutivePointHits + 1,
        // CONVERGENCE: counter only changes on SEVEN_OUT; hold steady on POINT_HIT.
        // hitMarker path uses nextBossCounter so CROSS_CALIBRATION initializes to 2
        // when the player clears a non-boss marker on their way into the boss fight.
        bossPointHits: hitMarker
          ? nextBossCounter(effectiveBossPointHits, rollResult, true)
          : isConvergence
            ? run.bossPointHits
            : nextBossCounter(effectiveBossPointHits, rollResult, false),
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
        removedSlotIndex:      null,
      };
    }

    // ── Seven-out — shooter life lost ──────────────────────────────────────

    case 'SEVEN_OUT': {
      // Lefty's sevenOutBlocked (he re-rolls the dice) and The Covenant's
      // once-per-marker save (FB-036) keep the shooter. Floor Walker's
      // passLineProtected only saves the bet — the shooter still dies. Either
      // way hype still resets and the point still clears.

      const shooterLost = !flags.sevenOutBlocked && !covenantSaved;
      const newShooters = shooterLost ? run.shooters - 1 : run.shooters;

      let nextStatus: RunRow['status'];
      let nextMarkerIndex = currentMarkerIndex;

      if (newShooters <= 0) {
        // Last shooter gone — evaluate vs current marker target.
        // If the player still has enough bankroll, they survive and go to The Pub.
        // If not, they bust.
        const meetsTarget  = clearsMarker(newBankroll);

        if (meetsTarget) {
          const isLastMarker = currentMarkerIndex >= MARKER_TARGETS.length - 1;
          nextStatus      = isLastMarker ? 'GAME_OVER' : 'TRANSITION';
          nextMarkerIndex = currentMarkerIndex + 1;
        } else {
          nextStatus = 'GAME_OVER';
        }
      } else if (newBankroll <= 0 || isBelowMinBet(newBankroll, clearedBets, currentMarkerIndex)) {
        // Shooter lives remain, but the bankroll is empty or below the minimum
        // bet — the player cannot place a valid bet and is permanently stuck.
        // Trigger GAME_OVER rather than leaving them on a table they can't use.
        nextStatus = 'GAME_OVER';
      } else {
        // Shooters remain and bankroll is healthy — but the marker may have
        // already been crossed by a hardway win on a prior NO_RESOLUTION roll.
        // The seven-out resolves the point phase, so check now.
        const meetsTarget  = clearsMarker(newBankroll);

        if (meetsTarget) {
          const isLastMarker = currentMarkerIndex >= MARKER_TARGETS.length - 1;
          nextStatus      = isLastMarker ? 'GAME_OVER' : 'TRANSITION';
          nextMarkerIndex = currentMarkerIndex + 1;
        } else {
          nextStatus = 'IDLE_TABLE';
        }
      }

      // Preserve any hype the crew injected during this cascade (e.g. Holly
      // firing on a Seven-Out gives the next shooter a head start).
      // The Keepsake (Floor 3 boss comp) preserves half the accumulated hype above 1.0
      // so a high-hype run isn't completely reset on seven-out.
      // cascadeHypeDelta captures crew head-start above pre-roll level and stacks on top.
      const cascadeHypeDelta = Math.max(0, finalCtx.hype - run.hype);
      let nextHype: number;
      if (isOrbitalDecay) {
        const decayParams = GAUNTLET[currentMarkerIndex]!.boss!.ruleParams as
          Extract<BossRuleParams, { rule: 'ORBITAL_DECAY' }>;
        const decayAmount =
          run.hype >= 2.5 ? decayParams.onFireDecay
          : run.hype >= 1.5 ? decayParams.heatingUpDecay
          : decayParams.baseDecay;
        nextHype = Math.max(
          decayParams.hypeFloor,
          Math.round((run.hype - decayAmount + cascadeHypeDelta) * 10_000) / 10_000,
        );
      } else {
        const seaLegsBaseline = hasSeaLegs ? 1.0 + (run.hype - 1.0) / 2 : 1.0;
        nextHype = Math.max(1.0, seaLegsBaseline + cascadeHypeDelta);
      }

      const markerCleared = nextMarkerIndex !== currentMarkerIndex;

      // Hype resets to 1.0× at every marker boundary — within-marker resource, not carried forward.
      // The Keepsake and Commander decay operate on seven-out, not on marker advance; both are unaffected.
      if (markerCleared) {
        nextHype = 1.0;
      }

      // ── CONVERGENCE: Targeted Demolition — determine which slot to remove ──
      // The most recently triggered slot (last CascadeEvent.slotIndex) takes the
      // hit. If no crew fired this roll, fall back to the highest occupied active
      // slot. null when the player has no crew left to remove.
      const highestOccupiedSlot = (() => {
        const stored = run.crewSlots as StoredCrewSlots;
        for (let i = Math.min(run.unlockedSlots, stored.length) - 1; i >= 0; i--) {
          if (stored[i] != null) return i;
        }
        return null;
      })();
      const convergenceDemolitionTarget = (isConvergence && !markerCleared)
        ? (lastTriggeredSlot ?? highestOccupiedSlot)
        : null;

      return {
        status:               nextStatus,
        phase:                'COME_OUT',
        bankrollCents:        newBankroll,
        shooters:             Math.max(0, newShooters),
        currentPoint:         null,
        hype:                 nextHype,
        bets:                 clearedBets,
        currentMarkerIndex:   nextMarkerIndex,
        consecutivePointHits:  0,  // Seven Out kills the streak
        // CONVERGENCE: increment the seven-out counter on SEVEN_OUT (cap at 5).
        // All other rules: delegate to nextBossCounter (resets on marker clear).
        bossPointHits: (isConvergence && !markerCleared)
          ? Math.min(5, run.bossPointHits + 1)
          : nextBossCounter(effectiveBossPointHits, rollResult, markerCleared),
        // New shooter: counters reset. Blocked seven-out: shooter survives, counters continue.
        previousRollTotal:     shooterLost ? null : finalCtx.diceTotal,
        shooterRollCount:      shooterLost ? 0 : run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
        removedSlotIndex:      convergenceDemolitionTarget,
      };
    }

    // ── No resolution — bets stay, bankroll unchanged ──────────────────────

    case 'NO_RESOLUTION': {
      // No payout. Pass line and odds stay locked on the table.
      // However, if the dice showed a hardway number (4/6/8/10), that specific
      // hardway bet resolves independently — a soft loss clears it even though
      // the main point is unresolved. clearedBets handles this correctly while
      // leaving passLine and odds untouched.

      // ── Marker check: hardway wins (or crew bonuses) may have pushed the
      // bankroll over the marker threshold mid-point. If so, treat this as a
      // marker clear: refund all remaining table bets and advance.
      //
      // IMPORTANT: check (newBankroll + refund) not just newBankroll.
      // Pass line and odds are still locked on the table (clearedBets is
      // non-zero). The final bankroll on a marker clear is newBankroll + refund,
      // so that is what must meet the target — not the cash-only snapshot.
      const refund       = sumBets(clearedBets);
      const hitMarker    = clearsMarker(newBankroll + refund);

      if (hitMarker) {
        const zeroBets: Bets = {
          passLine: 0,
          odds:     0,
          hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
        };
        return {
          status:               currentMarkerIndex >= MARKER_TARGETS.length - 1 ? 'GAME_OVER' : 'TRANSITION',
          phase:                'COME_OUT',
          bankrollCents:        newBankroll + refund,
          shooters:             run.shooters,
          currentPoint:         null,
          hype:                 1.0, // Reset to 1.0× at marker boundary
          bets:                 zeroBets,
          currentMarkerIndex:   currentMarkerIndex + 1,
          consecutivePointHits:  0,
          bossPointHits:         nextBossCounter(effectiveBossPointHits, rollResult, true),
          previousRollTotal:     finalCtx.diceTotal,
          shooterRollCount:      run.shooterRollCount + 1,
          pointPhaseBlankStreak: 0,
          removedSlotIndex:      null,
        };
      }

      // Poseidon's Favor blocked a come-out craps-out: the roll doesn't count,
      // so the shooter stays on the come-out with the Pass Line still up.
      if (flags.crapsOutBlocked) {
        return {
          status:               'IDLE_TABLE',
          phase:                'COME_OUT',
          bankrollCents:        newBankroll,
          shooters:             run.shooters,
          currentPoint:         null,
          hype:                 finalCtx.hype,
          bets:                 clearedBets,
          currentMarkerIndex,
          consecutivePointHits:  run.consecutivePointHits,
          bossPointHits:         nextBossCounter(effectiveBossPointHits, rollResult, false),
          previousRollTotal:     finalCtx.diceTotal,
          shooterRollCount:      run.shooterRollCount + 1,
          pointPhaseBlankStreak: 0,
          removedSlotIndex:      null,
        };
      }

      return {
        status:               'POINT_ACTIVE',
        phase:                'POINT_ACTIVE',
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         run.currentPoint ?? null,
        hype:                 finalCtx.hype,
        bets:                 clearedBets,
        currentMarkerIndex,
        consecutivePointHits:  run.consecutivePointHits, // no change on non-resolving roll
        bossPointHits:         nextBossCounter(effectiveBossPointHits, rollResult, false),
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        // The Pressure Cooker fires on the 5th blank in a row (4 prior blanks);
        // reset the count then so it fires again on blanks 10, 15, …
        pointPhaseBlankStreak: run.pointPhaseBlankStreak >= 4 ? 0 : run.pointPhaseBlankStreak + 1,
        removedSlotIndex:      null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Bet helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the player cannot afford to place another minimum bet
 * and has no chips remaining on the table that could recover the situation.
 *
 * Both conditions must hold simultaneously:
 *   - bankroll < getMinBet(markerIndex): can't meet the table floor next roll.
 *   - sumBets(remainingBets) === 0: no active wagers left to potentially win back.
 *
 * This is the "soft broke" condition that triggers GAME_OVER independently of
 * the shooter count — a player with shooters remaining but sub-minimum funds
 * and a clean table has no path forward.
 */
function isBelowMinBet(bankroll: number, remainingBets: Bets, markerIndex: number): boolean {
  return bankroll < getMinBet(markerIndex) && sumBets(remainingBets) === 0;
}

/** Total wager for a given Bets object, in cents. */
function sumBets(bets: Bets): number {
  return (
    bets.passLine +
    bets.odds +
    bets.hardways.hard4 +
    bets.hardways.hard6 +
    bets.hardways.hard8 +
    bets.hardways.hard10
  );
}


// ---------------------------------------------------------------------------
// Crew slot serialisation / hydration
// ---------------------------------------------------------------------------

/**
 * Converts the live CrewMember array (from cascade output) back into the
 * StoredCrewSlots shape for database persistence.
 *
 * Only cooldownState needs to be written — it's the only mutable field.
 *
 * @param resetPerShooter  When true, resets cooldownState to 0 for any crew
 *                         with cooldownType === 'per_shooter'. Pass true when
 *                         a new shooter begins (i.e., a shooter life was lost
 *                         on SEVEN_OUT and the next shooter is stepping up).
 */
function serialiseCrewSlots(
  slots: (CrewMember | null)[],
  resetPerShooter = false,
): StoredCrewSlots {
  const result: (StoredCrewSlot | null)[] = slots.slice(0, 5).map((slot) => {
    if (slot === null) return null;
    const cooldown = resetPerShooter && slot.cooldownType === 'per_shooter'
      ? 0
      : slot.cooldownState;
    return { crewId: slot.id, cooldownState: cooldown };
  });

  // Pad to exactly 5 slots if the array is shorter (shouldn't happen in prod).
  while (result.length < 5) result.push(null);

  return result as StoredCrewSlots;
}

/**
 * Converts StoredCrewSlots from the database into live CrewMember objects
 * (with execute() methods) by looking each crewId up in the registry.
 */
function hydrateCrewSlots(stored: StoredCrewSlots): [
  CrewMember | null,
  CrewMember | null,
  CrewMember | null,
  CrewMember | null,
  CrewMember | null,
] {
  return stored.map((slot) => {
    if (slot === null) return null;
    return hydrateCrewMember(slot.crewId, slot.cooldownState);
  }) as [CrewMember | null, CrewMember | null, CrewMember | null, CrewMember | null, CrewMember | null];
}
