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
  getMaxBet,
  getMinBet,
  isBossMarker,
  getBaseHypeTick,
  OLD_PRO_ID,
  LUCKY_CHARM_ID,
  type CascadeEvent,
  type CrewMember,
  type Bets,
  type GamePhase,
  type BossRuleParams,
  type BossRuleState,
} from '@battlecraps/shared';

import { db } from '../db/client.js';
import { runs, users, type RunRow, type UserRow, type StoredCrewSlots, type StoredCrewSlot } from '../db/schema.js';
import { rollDice } from '../lib/rng.js';
import { getIO } from '../lib/io.js';
import { hydrateCrewMember } from '../lib/crewRegistry.js';
import { evaluateUnlocks } from '../lib/unlocks.js';
import { requireClerkAuth } from '../lib/clerkAuth.js';
import { resolveUserByClerkId } from '../lib/resolveUser.js';
import { submitLeaderboardEntry } from './leaderboard.js';

// ---------------------------------------------------------------------------
// Marker targets (gauntlet cash goals, in cents)
// ---------------------------------------------------------------------------

// MARKER_TARGETS is imported from @battlecraps/shared — single source of truth.
// See packages/shared/src/config.ts for the canonical values and documentation.

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
     * Tutorial-only: predetermined dice values [die1, die2].
     * Only honoured when the requesting user's tutorialCompleted flag is false.
     * Ignored for any other user to prevent exploit use in real runs.
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
  const bossState: BossRuleState = { bossPointHits: run.bossPointHits, markerIndex: run.currentMarkerIndex };

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

  // ── Table max: 10 % of marker target, floored at 5× boss min in boss rooms ─
  const maxBet = getMaxBet(run.currentMarkerIndex, run.bossPointHits);

  if (incomingBets.passLine > maxBet) {
    return reply.status(422).send({
      error: `Pass Line bet of ${incomingBets.passLine}¢ exceeds the table maximum of ${maxBet}¢ ($${maxBet / 100}).`,
    });
  }

  const hwKeys = ['hard4', 'hard6', 'hard8', 'hard10'] as const;
  for (const key of hwKeys) {
    if (incomingBets.hardways[key] > maxBet) {
      return reply.status(422).send({
        error: `${key} bet of ${incomingBets.hardways[key]}¢ exceeds the table maximum of ${maxBet}¢ ($${maxBet / 100}).`,
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

  // ── Boss fight: bet-validation hook (e.g. Sarge's Rising Min-Bets rule) ──
  if (bossHooks?.validateBet) {
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
  // cheat_dice is only honoured when the requesting user has not yet completed
  // the tutorial. This prevents the field being used to rig rolls in real runs.
  const cheatDice = request.body.cheat_dice;
  const dice: [number, number] =
    cheatDice !== undefined && !user.tutorialCompleted
      ? cheatDice
      : rollDice();

  // ── 7. Resolve roll — classify outcome and compute base payouts ────────────
  const initialCtx = resolveRoll(dice, {
    phase:                 run.phase as 'COME_OUT' | 'POINT_ACTIVE',
    currentPoint:          run.currentPoint ?? null,
    bets:                  incomingBets,
    hype:                  run.hype,
    mechanicFreeze:        (run.mechanicFreeze as { lockedValue: number; rollsRemaining: number } | null | undefined) ?? null,
    previousRollTotal:     run.previousRollTotal ?? null,
    shooterRollCount:      run.shooterRollCount,
    pointPhaseBlankStreak: run.pointPhaseBlankStreak,
  });

  // ── 7b. Base-game Point Streak Hype tick ───────────────────────────────────
  //
  // On a POINT_HIT, the crowd's excitement escalates before any crew fire.
  // The tick is applied to initialCtx.hype BEFORE resolveCascade so Holly and
  // other HYPE crew layer their bonuses on top of the already-seeded excitement.
  //   Streak entering → tick: 0→+0.05, 1→+0.10, 2→+0.15, 3+→+0.20 (cap)
  const baseHypeTick = initialCtx.rollResult === 'POINT_HIT'
    ? getBaseHypeTick(run.consecutivePointHits)
    : 0;
  const seededCtx = baseHypeTick > 0
    ? { ...initialCtx, hype: Math.round((initialCtx.hype + baseHypeTick) * 10_000) / 10_000 }
    : initialCtx;

  // ── 7c. Boss outcome modifier (e.g. The Executive: 4s set instantLoss) ────
  const outcomeCtx = bossHooks?.modifyOutcome
    ? bossHooks.modifyOutcome(seededCtx, bossParams!, bossState)
    : seededCtx;

  // ── 7d. Instant-loss check — early GAME_OVER before cascade fires ──────────
  if (outcomeCtx.flags.instantLoss) {
    const lossBankroll = run.bankrollCents - betDelta;
    const zeroBets: Bets = {
      passLine: 0, odds: 0,
      hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
    };

    const lossRun = await db
      .update(runs)
      .set({ status: 'GAME_OVER', bankrollCents: lossBankroll, bets: zeroBets, updatedAt: new Date() })
      .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
      .returning();

    if (lossRun[0] === undefined) {
      return reply.status(409).send({ error: 'Conflict: run was modified by another request. Please retry.' });
    }

    // Leaderboard: submit entry for this instant-loss GAME_OVER (fire-and-forget).
    void submitLeaderboardEntry(user as UserRow, lossRun[0]).catch((err: unknown) => {
      request.log.error({ err }, '[leaderboard] submission error (instant-loss)');
    });

    const io = getIO();
    const lossPayload: WsTurnSettledPayload = {
      runId,
      dice:                    outcomeCtx.dice,
      diceTotal:               outcomeCtx.diceTotal,
      rollResult:              outcomeCtx.rollResult,
      bankrollDelta:           -betDelta,
      newBankroll:             lossBankroll,
      newShooters:             run.shooters,
      newHype:                 run.hype,
      newPhase:                run.phase as GamePhase,
      newPoint:                null,
      runStatus:               'GAME_OVER',
      newMarkerIndex:          run.currentMarkerIndex,
      newBets:                 zeroBets,
      newConsecutivePointHits: 0,
      newBossPointHits:        run.bossPointHits,
      payoutBreakdown:         { passLine: 0, odds: 0, hardways: 0 },
    };
    io.to(`run:${runId}`).emit('turn:settled', lossPayload);

    return reply.status(200).send({
      run: lossRun[0],
      roll: {
        dice:            outcomeCtx.dice,
        diceTotal:       outcomeCtx.diceTotal,
        rollResult:      outcomeCtx.rollResult,
        cascadeEvents:   [],
        bankrollDelta:   -betDelta,
        receipt:         buildRollReceipt(outcomeCtx),
        resolvedBets:    zeroBets,
        payoutBreakdown: { passLine: 0, odds: 0, hardways: 0 },
        mechanicFreeze:  null,
      },
    });
  }

  // ── 8. Run the Clockwise Cascade ───────────────────────────────────────────
  //
  // Each crew member's execute() fires left-to-right (slot 0 → 4), each one
  // seeing the TurnContext as modified by all previous crew members.
  const cascadeResult = resolveCascade(crewSlots, outcomeCtx, rollDice, bossHooks, bossParams);
  const { finalContext, events, updatedCrewSlots } = cascadeResult;

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
  const payout = settleTurn(finalContext);
  const newBankroll = run.bankrollCents - betDelta + payout;
  const bankrollDelta = newBankroll - run.bankrollCents;

  const rollAmplifiedProfit = payout - finalContext.baseStakeReturned;
  const newHighestRollAmplifiedCents = Math.max(
    run.highestRollAmplifiedCents,
    rollAmplifiedProfit,
  );

  // Build the QA receipt (net delta computed internally from TurnContext).
  const receipt = buildRollReceipt(finalContext);

  // ── 11. Advance state machine ─────────────────────────────────────────────
  const nextState = computeNextState(run, finalContext, newBankroll, incomingBets);

  // ── 11b. Old Pro — +1 shooter on marker clear ─────────────────────────────
  // The Old Pro's execute() is a no-op; his ability is a meta-progression
  // effect applied here when the run transitions to a new marker segment.
  if (nextState.status === 'TRANSITION') {
    const hasOldPro = updatedCrewSlots.some((c) => c?.id === OLD_PRO_ID);
    if (hasOldPro) {
      nextState.shooters += 1;
    }
  }

  // ── 11c. Mechanic freeze lifecycle ────────────────────────────────────────
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
      status:             nextState.status,
      phase:              nextState.phase,
      bankrollCents:      nextState.bankrollCents,
      shooters:           nextState.shooters,
      currentPoint:       nextState.currentPoint,
      hype:                 nextState.hype,
      consecutivePointHits: nextState.consecutivePointHits,
      bossPointHits:        nextState.bossPointHits,
      bets:                 nextState.bets,
      crewSlots:          serialiseCrewSlots(
                            updatedCrewSlots,
                            nextState.shooters < run.shooters, // new shooter → reset per_shooter cooldowns
                          ),
      mechanicFreeze:        nextMechanicFreeze,
      currentMarkerIndex:    nextState.currentMarkerIndex,
      previousRollTotal:     nextState.previousRollTotal,
      shooterRollCount:      nextState.shooterRollCount,
      pointPhaseBlankStreak: nextState.pointPhaseBlankStreak,
      highestRollAmplifiedCents: newHighestRollAmplifiedCents,
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

  // ── 12c. Leaderboard submission (fire-and-forget) ─────────────────────────
  // submitLeaderboardEntry is idempotent via ON CONFLICT (run_id) DO NOTHING.
  if (nextState.status === 'GAME_OVER') {
    void submitLeaderboardEntry(user as UserRow, persistedRun).catch((err: unknown) => {
      request.log.error({ err }, '[leaderboard] submission error');
    });
  }

  // ── 12d. Update personal-best bankroll (fire-and-forget) ──────────────────
  // Conditional update: the WHERE clause ensures this only writes to the DB
  // when newBankroll actually exceeds the stored max. On most rolls this is a
  // no-op (0 rows matched). Fire-and-forget so it doesn't add latency to the
  // hot path; the client also tracks this locally for immediate display.
  void db
    .update(users)
    .set({ maxBankrollCents: newBankroll })
    .where(and(eq(users.id, userId), lt(users.maxBankrollCents, newBankroll)))
    .catch((err: unknown) => {
      request.log.error({ err }, '[roll] Failed to update maxBankrollCents');
    });

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
    newBets:                 nextState.bets,
    newConsecutivePointHits: nextState.consecutivePointHits,
    newBossPointHits:        nextState.bossPointHits,
    payoutBreakdown,
  };
  io.to(runRoom).emit('turn:settled', settledPayload);

  // ── 14. HTTP response ──────────────────────────────────────────────────────
  return reply.status(200).send({
    run:           persistedRun,
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
      resolvedBets:    nextState.bets,
      // Included here so the client can apply the full settlement from the
      // HTTP response without depending on the WebSocket turn:settled event.
      payoutBreakdown,
      // Updated freeze state so the client knows how many rolls remain.
      mechanicFreeze:  nextMechanicFreeze,
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
  run:          RunRow,
  finalCtx:     ReturnType<typeof resolveRoll>,
  newBankroll:  number,
  incomingBets: Bets,
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
} {
  const { rollResult, flags } = finalCtx;
  const currentMarkerIndex = run.currentMarkerIndex;

  // Use the resolved bets from the final TurnContext — this is the authoritative
  // post-roll bet state, including any crew modifications (e.g. Mathlete restoring
  // a hardway bet that would have been cleared by a soft roll).
  const clearedBets = finalCtx.resolvedBets;

  switch (rollResult) {
    // ── Come-out wins / losses ──────────────────────────────────────────────

    case 'NATURAL': {
      // A Natural pays out immediately — the bankroll can cross a marker threshold
      // on a come-out win just as easily as on a POINT_HIT. Check here too.
      const markerTarget  = MARKER_TARGETS[currentMarkerIndex];
      const hitMarker     = markerTarget !== undefined && newBankroll >= markerTarget;
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
        hype:                 finalCtx.hype,  // Hype accumulates on a NATURAL
        bets:                 clearedBets,
        currentMarkerIndex:   hitMarker ? currentMarkerIndex + 1 : currentMarkerIndex,
        consecutivePointHits: run.consecutivePointHits, // streak unaffected by naturals
        // Boss: reset on marker clear; hold on natural (only Point Hits escalate).
        bossPointHits:         hitMarker ? 0 : run.bossPointHits,
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
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
        // Boss: min-bet holds on craps-out (only Point Hits escalate the ante).
        bossPointHits:         run.bossPointHits,
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
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
        // Boss: min-bet holds on point-set (only Point Hits escalate the ante).
        bossPointHits:         run.bossPointHits,
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
      };

    // ── Point hit — check for marker / game completion ─────────────────────

    case 'POINT_HIT': {
      // Did the player hit a gauntlet marker?
      const markerTarget = MARKER_TARGETS[currentMarkerIndex];
      const hitMarker    = markerTarget !== undefined && newBankroll >= markerTarget;

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
        hype:                 finalCtx.hype, // Hype persists (already ticked above)
        bets:                 clearedBets,
        currentMarkerIndex:   hitMarker ? currentMarkerIndex + 1 : currentMarkerIndex,
        // Streak resets on marker clear (new chapter); otherwise increments.
        consecutivePointHits:  hitMarker ? 0 : run.consecutivePointHits + 1,
        // Boss: reset on marker clear (boss defeated); increment on mid-fight Point Hit.
        bossPointHits:         hitMarker ? 0 : isBossMarker(currentMarkerIndex) ? run.bossPointHits + 1 : 0,
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
      };
    }

    // ── Seven-out — shooter life lost ──────────────────────────────────────

    case 'SEVEN_OUT': {
      // Only Lefty's sevenOutBlocked prevents a shooter death (he re-rolls
      // the dice). Floor Walker's passLineProtected only saves the bet —
      // the shooter still dies, hype still resets, point still clears.

      // Lucky Charm solo check: if she is the only crew, her 2.0× floor
      // must be re-applied AFTER the hype reset so it survives the seven-out.
      const activeSlots = (run.crewSlots as StoredCrewSlots).filter(Boolean);
      const isLuckyCharmSolo =
        activeSlots.length === 1 && activeSlots[0]?.crewId === LUCKY_CHARM_ID;

      const shooterLost = !flags.sevenOutBlocked;
      const newShooters = shooterLost ? run.shooters - 1 : run.shooters;

      let nextStatus: RunRow['status'];
      let nextMarkerIndex = currentMarkerIndex;

      if (newShooters <= 0) {
        // Last shooter gone — evaluate vs current marker target.
        // If the player still has enough bankroll, they survive and go to The Pub.
        // If not, they bust.
        const markerTarget = MARKER_TARGETS[currentMarkerIndex];
        const meetsTarget  = markerTarget !== undefined && newBankroll >= markerTarget;

        if (meetsTarget) {
          const isLastMarker = currentMarkerIndex >= MARKER_TARGETS.length - 1;
          nextStatus      = isLastMarker ? 'GAME_OVER' : 'TRANSITION';
          nextMarkerIndex = isLastMarker ? currentMarkerIndex : currentMarkerIndex + 1;
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
        const markerTarget = MARKER_TARGETS[currentMarkerIndex];
        const meetsTarget  = markerTarget !== undefined && newBankroll >= markerTarget;

        if (meetsTarget) {
          const isLastMarker = currentMarkerIndex >= MARKER_TARGETS.length - 1;
          nextStatus      = isLastMarker ? 'GAME_OVER' : 'TRANSITION';
          nextMarkerIndex = isLastMarker ? currentMarkerIndex : currentMarkerIndex + 1;
        } else {
          nextStatus = 'IDLE_TABLE';
        }
      }

      return {
        status:               nextStatus,
        phase:                'COME_OUT',
        bankrollCents:        newBankroll,
        shooters:             Math.max(0, newShooters),
        currentPoint:         null,
        hype:                 isLuckyCharmSolo ? 2.0 : 1.0,  // SEVEN_OUT resets Hype; Lucky Charm re-floors to 2.0 if solo
        bets:                 clearedBets,
        currentMarkerIndex:   nextMarkerIndex,
        consecutivePointHits:  0,  // Seven Out kills the streak
        // Boss: min-bet HOLDS on Seven Out (run.bossPointHits unchanged).
        // Reset only on TRANSITION or GAME_OVER (when nextMarkerIndex advanced).
        bossPointHits:         nextMarkerIndex !== currentMarkerIndex ? 0 : run.bossPointHits,
        // New shooter: counters reset. Blocked seven-out: shooter survives, counters continue.
        previousRollTotal:     shooterLost ? null : finalCtx.diceTotal,
        shooterRollCount:      shooterLost ? 0 : run.shooterRollCount + 1,
        pointPhaseBlankStreak: 0,
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
      // marker clear: refund all remaining table bets and advance. ───────────
      const markerTarget = MARKER_TARGETS[currentMarkerIndex];
      const hitMarker    = markerTarget !== undefined && newBankroll >= markerTarget;

      if (hitMarker) {
        const refund = sumBets(clearedBets);
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
          hype:                 finalCtx.hype,
          bets:                 zeroBets,
          currentMarkerIndex:   currentMarkerIndex + 1,
          consecutivePointHits:  0,
          bossPointHits:         0,
          previousRollTotal:     finalCtx.diceTotal,
          shooterRollCount:      run.shooterRollCount + 1,
          pointPhaseBlankStreak: 0,
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
        // Boss: min-bet holds on no-resolution rolls (only Point Hits escalate).
        bossPointHits:         run.bossPointHits,
        previousRollTotal:     finalCtx.diceTotal,
        shooterRollCount:      run.shooterRollCount + 1,
        pointPhaseBlankStreak: run.pointPhaseBlankStreak + 1,
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
