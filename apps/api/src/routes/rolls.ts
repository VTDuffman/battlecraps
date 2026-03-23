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
import { eq, and } from 'drizzle-orm';

import {
  resolveRoll,
  resolveCascade,
  settleTurn,
  validateOddsBet,
  buildRollReceipt,
  MARKER_TARGETS,
  getMaxBet,
  getBaseHypeTick,
  OLD_PRO_ID,
  LUCKY_CHARM_ID,
  type CascadeEvent,
  type CrewMember,
  type Bets,
  type GamePhase,
} from '@battlecraps/shared';

import { db } from '../db/client.js';
import { runs, type RunRow, type StoredCrewSlots, type StoredCrewSlot } from '../db/schema.js';
import { rollDice } from '../lib/rng.js';
import { getIO } from '../lib/io.js';
import { hydrateCrewMember } from '../lib/crewRegistry.js';

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
  },
  additionalProperties: false,
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RollBody {
  bets: Bets;
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
  newBets:                Bets;    // bets remaining on the table after this roll
  newConsecutivePointHits: number; // streak counter — drives base hype tick + client UI
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
    { schema: { body: rollBodySchema } },
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
  // In production this comes from a verified JWT. For now we read a header.
  // TODO: Replace with @fastify/jwt once auth is wired up.
  const userId = request.headers['x-user-id'];
  if (typeof userId !== 'string' || userId.length === 0) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }

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

  // ── 4. Bet validation ──────────────────────────────────────────────────────
  //
  // Deduct-on-placement model: the DB bankroll already reflects bets placed in
  // prior rolls this turn (e.g., passLine deducted at POINT_SET). Only the
  // DELTA (newly added bets this roll) is validated against the current bankroll.
  const incomingBets = request.body.bets;
  const betDelta = sumBets(incomingBets) - sumBets(run.bets);

  // Bets can only be increased, never reduced once on the table.
  if (betDelta < 0) {
    return reply.status(422).send({
      error: 'Existing bets cannot be reduced.',
    });
  }

  // Must be able to afford the newly placed bets from the current bankroll.
  if (betDelta > run.bankrollCents) {
    return reply.status(422).send({
      error: `Insufficient funds: need ${betDelta}¢, have ${run.bankrollCents}¢.`,
    });
  }

  // ── Table max: 10 % of the current marker target ───────────────────────
  const maxBet = getMaxBet(run.currentMarkerIndex);

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

  // ── 5. Hydrate crew slots ─────────────────────────────────────────────────
  //
  // The database stores { crewId, cooldownState } pairs. We reconstruct full
  // CrewMember objects (with execute() methods) here before the cascade runs.
  const crewSlots = hydrateCrewSlots(run.crewSlots);

  // ── 6. Generate dice (server-side RNG) ─────────────────────────────────────
  const dice = rollDice();

  // ── 7. Resolve roll — classify outcome and compute base payouts ────────────
  const initialCtx = resolveRoll(dice, {
    phase:        run.phase as 'COME_OUT' | 'POINT_ACTIVE',
    currentPoint: run.currentPoint ?? null,
    bets:         incomingBets,
    hype:         run.hype,
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

  // ── 8. Run the Clockwise Cascade ───────────────────────────────────────────
  //
  // Each crew member's execute() fires left-to-right (slot 0 → 4), each one
  // seeing the TurnContext as modified by all previous crew members.
  const cascadeResult = resolveCascade(crewSlots, seededCtx, rollDice);
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

  // Build the QA receipt now that we have the final delta.
  const receipt = buildRollReceipt(finalContext, bankrollDelta);

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
      bets:                 nextState.bets,
      crewSlots:          serialiseCrewSlots(
                            updatedCrewSlots,
                            nextState.shooters < run.shooters, // new shooter → reset per_shooter cooldowns
                          ),
      currentMarkerIndex: nextState.currentMarkerIndex,
      updatedAt:          new Date(),
    })
    .where(and(eq(runs.id, runId), eq(runs.updatedAt, run.updatedAt)))
    .returning();

  const persistedRun = updatedRun[0];
  if (persistedRun === undefined) {
    return reply.status(409).send({
      error: 'Conflict: run was modified by another request. Please retry.',
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
    newBets:                 nextState.bets,
    newConsecutivePointHits: nextState.consecutivePointHits,
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
      resolvedBets:  nextState.bets,
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
  currentMarkerIndex:   number;
  consecutivePointHits: number;
} {
  const { rollResult, flags } = finalCtx;
  const currentMarkerIndex = run.currentMarkerIndex;

  // Use the resolved bets from the final TurnContext — this is the authoritative
  // post-roll bet state, including any crew modifications (e.g. Mathlete restoring
  // a hardway bet that would have been cleared by a soft roll).
  const clearedBets = finalCtx.resolvedBets;

  switch (rollResult) {
    // ── Come-out wins / losses ──────────────────────────────────────────────

    case 'NATURAL':
      return {
        status:               'IDLE_TABLE',
        phase:                'COME_OUT',
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         null,
        hype:                 finalCtx.hype,  // Hype accumulates on a NATURAL
        bets:                 clearedBets,
        currentMarkerIndex,
        consecutivePointHits: run.consecutivePointHits, // streak unaffected by naturals
      };

    case 'CRAPS_OUT':
      return {
        status:               'IDLE_TABLE',
        phase:                'COME_OUT',
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         null,
        hype:                 finalCtx.hype,  // Hype is NOT reset on craps-out (only 7-out)
        bets:                 clearedBets,
        currentMarkerIndex,
        consecutivePointHits: run.consecutivePointHits, // streak unaffected by craps-out
      };

    // ── Point established ───────────────────────────────────────────────────

    case 'POINT_SET':
      // No payout. Bets freeze — passLine stays, odds can now be added.
      // Bankroll reflects the deduction of bets placed this come-out roll.
      return {
        status:               'POINT_ACTIVE',
        phase:                'POINT_ACTIVE',
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         finalCtx.diceTotal,
        hype:                 finalCtx.hype,
        bets:                 incomingBets,       // Bets are now locked/frozen
        currentMarkerIndex,
        consecutivePointHits: run.consecutivePointHits, // unchanged until the point resolves
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
        consecutivePointHits: hitMarker ? 0 : run.consecutivePointHits + 1,
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
      } else if (newBankroll <= 0) {
        // Shooter lives remain, but the bankroll is empty — the player cannot
        // place any more bets and is permanently stuck. Trigger GAME_OVER now
        // rather than leaving them on a table they can never interact with.
        nextStatus = 'GAME_OVER';
      } else {
        nextStatus = 'IDLE_TABLE';
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
        consecutivePointHits: 0,  // Seven Out kills the streak
      };
    }

    // ── No resolution — bets stay, bankroll unchanged ──────────────────────

    case 'NO_RESOLUTION':
      // No payout. Pass line and odds stay locked on the table.
      // However, if the dice showed a hardway number (4/6/8/10), that specific
      // hardway bet resolves independently — a soft loss clears it even though
      // the main point is unresolved. clearedBets handles this correctly while
      // leaving passLine and odds untouched.
      return {
        status:               'POINT_ACTIVE',
        phase:                'POINT_ACTIVE',
        bankrollCents:        newBankroll,
        shooters:             run.shooters,
        currentPoint:         run.currentPoint ?? null,
        hype:                 finalCtx.hype,
        bets:                 clearedBets,
        currentMarkerIndex,
        consecutivePointHits: run.consecutivePointHits, // no change on non-resolving roll
      };
  }
}

// ---------------------------------------------------------------------------
// Bet helpers
// ---------------------------------------------------------------------------

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
