// =============================================================================
// BATTLECRAPS — ZUSTAND GAME STORE
// apps/web/src/store/useGameStore.ts
//
// Single source of truth for all client-side game state.
//
// Responsibilities:
//   - Mirror the run state received from the server (bankroll, hype, point, bets).
//   - Manage the Socket.IO connection lifecycle (connect → subscribe:run).
//   - Own the animation queue: 'cascade:trigger' events are pushed into a FIFO
//     queue. The UI dequeues one at a time, waits for the animation to complete,
//     then calls `dequeueEvent()` to advance to the next. This guarantees the
//     portrait-flash sequence is always left-to-right and never overlaps.
//   - Track pending roll state (is a roll in flight? what were the last dice?).
//
// DESIGN NOTE — Immer is NOT used here. All state updates use explicit spreads.
// Zustand's `set()` merges at the top level so nested objects need full spreads.
// =============================================================================

import { create } from 'zustand';
import { socket } from '../lib/socket.js';
import type {
  Bets,
  RunStatus,
  GamePhase,
  CascadeEvent,
  RollResult,
  RollReceipt,
} from '@battlecraps/shared';
import { validateOddsBet } from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// Bet field type — identifies a single wager within the Bets structure
// ---------------------------------------------------------------------------

export type BetField = 'passLine' | 'odds' | 'hard4' | 'hard6' | 'hard8' | 'hard10';

function getBetField(bets: Bets, field: BetField): number {
  switch (field) {
    case 'passLine': return bets.passLine;
    case 'odds':     return bets.odds;
    case 'hard4':    return bets.hardways.hard4;
    case 'hard6':    return bets.hardways.hard6;
    case 'hard8':    return bets.hardways.hard8;
    case 'hard10':   return bets.hardways.hard10;
  }
}

function withBetField(bets: Bets, field: BetField, value: number): Bets {
  switch (field) {
    case 'passLine': return { ...bets, passLine: value };
    case 'odds':     return { ...bets, odds: value };
    default:         return { ...bets, hardways: { ...bets.hardways, [field]: value } };
  }
}

// ---------------------------------------------------------------------------
// Stored crew slot shape (mirrors apps/api/src/db/schema.ts)
// Re-declared here so the web package has no hard dependency on the api package.
// ---------------------------------------------------------------------------

export interface StoredCrewSlot {
  crewId:        number;
  cooldownState: number;
}

export type StoredCrewSlots = [
  StoredCrewSlot | null,
  StoredCrewSlot | null,
  StoredCrewSlot | null,
  StoredCrewSlot | null,
  StoredCrewSlot | null,
];

// ---------------------------------------------------------------------------
// Animation queue entry
//
// The queue holds CascadeEvents as emitted by the server. Each entry maps
// directly to one portrait flash + optional text bark in the UI. The UI
// renders the *head* of the queue (index 0). When the animation finishes,
// the UI calls `dequeueEvent()` to pop it and expose the next entry.
// ---------------------------------------------------------------------------

export interface QueuedCascadeEvent extends CascadeEvent {
  /**
   * Unique sequence number assigned when the event is enqueued.
   * React uses this as the `key` on the bark element so the animation
   * re-triggers even if the same crew fires twice in rapid succession.
   */
  seq: number;
}

// ---------------------------------------------------------------------------
// WS payload types (must match apps/api/src/routes/rolls.ts)
// ---------------------------------------------------------------------------

interface TurnSettledPayload {
  runId:            string;
  dice:             [number, number];
  diceTotal:        number;
  rollResult:       RollResult;
  bankrollDelta:    number;
  newBankroll:      number;
  newShooters:      number;
  newHype:          number;
  newPhase:         GamePhase;
  newPoint:         number | null;
  runStatus:        RunStatus;
  newMarkerIndex:   number;
  newBets:          Bets;
}

// ---------------------------------------------------------------------------
// Connection status
// ---------------------------------------------------------------------------

export type SocketStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'subscribed'
  | 'error';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface GameState {
  // ── Run identity ──────────────────────────────────────────────────────────
  runId:    string | null;
  userId:   string | null;
  status:   RunStatus | null;
  phase:    GamePhase | null;

  // ── Financials ────────────────────────────────────────────────────────────
  /** Current bankroll in cents. */
  bankroll: number;

  /** The established point number, or null in COME_OUT phase. */
  point:    number | null;

  /** Current Hype multiplier. 1.0 = baseline. */
  hype:     number;

  /** Remaining shooter lives. */
  shooters: number;

  /** Active bets for the current roll (in cents). */
  bets: Bets;

  /** The currently selected chip denomination in cents (e.g. 500 = $5). */
  activeChip: number;

  /** Index into MARKER_TARGETS — how many markers have been cleared so far. */
  currentMarkerIndex: number;

  // ── Crew ──────────────────────────────────────────────────────────────────
  crewSlots: StoredCrewSlots;

  // ── Last roll result ──────────────────────────────────────────────────────
  lastDice:       [number, number] | null;
  lastRollResult: RollResult | null;
  lastDelta:      number | null;        // signed cents — net bankroll change after roll

  // ── Bet placement animation ───────────────────────────────────────────────
  /**
   * Negative cents applied to the bankroll on the most recent placeBet() call.
   * Used to drive an immediate loss-flash animation at the moment the chip lands,
   * rather than waiting for the post-roll turn:settled event.
   * Cleared to null when turn:settled arrives (the roll has resolved).
   */
  lastBetDelta:   number | null;

  /**
   * Monotonically increments on every placeBet() call.
   * Used as the React `key` for the bet-placement animation element so the
   * animation re-fires even when the same chip size is placed twice in a row.
   */
  _betDeltaKey:   number;

  // ── Roll in-flight ────────────────────────────────────────────────────────
  /** True while the POST /runs/:id/roll request is pending. */
  isRolling: boolean;

  // ── Cascade animation queue ───────────────────────────────────────────────
  /**
   * FIFO queue of cascade events waiting to be animated.
   * The head (index 0) is the currently-animating event.
   * An empty array means no animation is running.
   */
  cascadeQueue: QueuedCascadeEvent[];

  /** Monotonically increasing counter used to generate `seq` values. */
  _seqCounter: number;

  // ── QA Transaction Log ────────────────────────────────────────────────────
  /**
   * Ordered history of the last 50 roll receipts, newest first (index 0).
   * Populated by rollDice() from the HTTP response.
   */
  rollHistory: RollReceipt[];

  // ── Socket connection ─────────────────────────────────────────────────────
  socketStatus: SocketStatus;
}

// ---------------------------------------------------------------------------
// Store actions
// ---------------------------------------------------------------------------

export interface GameActions {
  /**
   * Initialise the store for a given run. Connects the socket, subscribes
   * to the run room, and registers all WS event listeners.
   * Safe to call multiple times — existing listeners are removed first.
   */
  connectToRun(runId: string, userId: string, initialState: Partial<GameState>): void;

  /** Gracefully disconnect the socket and clear the run state. */
  disconnect(): void;

  /** Set the active chip denomination (in cents). */
  setActiveChip(cents: number): void;

  /**
   * Add `amount` cents to a specific bet field and deduct from bankroll.
   * No-op if bankroll < amount (caller should guard against this).
   */
  placeBet(field: BetField, amount: number): void;

  /**
   * Remove the entire bet on `field` and return the amount to bankroll.
   */
  removeBet(field: BetField): void;

  /**
   * Optimistically mark a roll as in-flight (called immediately before POST).
   * Cleared when 'turn:settled' arrives or if the HTTP request errors.
   */
  setRolling(rolling: boolean): void;

  /**
   * Pop the head of the cascade queue.
   * Called by CrewPortrait after its flash animation completes.
   */
  dequeueEvent(): void;

  /**
   * Submit the current bets and trigger a dice roll.
   *
   * Sets isRolling=true optimistically. On HTTP success, waits for the
   * 'turn:settled' WS event to clear it. On any error (network or engine
   * validation), logs to the console and clears isRolling so the UI never
   * locks up.
   */
  rollDice(): Promise<void>;

  /**
   * Hire a crew member at the Seven-Proof Pub, or skip (pass null).
   *
   * - crewId=null → skip/rest: no purchase, just advance to IDLE_TABLE.
   * - crewId+slotIndex → buy: deducts cost, seats crew, returns to IDLE_TABLE.
   *
   * Updates bankroll, shooters, crewSlots, status, phase, and point in the
   * store on success. Throws on network or server error.
   */
  recruitCrew(crewId: number | null, slotIndex?: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_BETS: Bets = {
  passLine: 0,
  odds:     0,
  hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
};

const DEFAULT_CREW_SLOTS: StoredCrewSlots = [null, null, null, null, null];

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useGameStore = create<GameState & GameActions>((set, get) => ({
  // ── Initial state ─────────────────────────────────────────────────────────
  runId:          null,
  userId:         null,
  status:         null,
  phase:          null,
  bankroll:            0,
  point:               null,
  hype:                1.0,
  shooters:            5,
  currentMarkerIndex:  0,
  bets:                DEFAULT_BETS,
  activeChip:          500,  // $5 default
  crewSlots:           DEFAULT_CREW_SLOTS,
  lastDice:       null,
  lastRollResult: null,
  lastDelta:      null,
  lastBetDelta:   null,
  _betDeltaKey:   0,
  isRolling:      false,
  cascadeQueue:   [],
  _seqCounter:    0,
  rollHistory:    [],
  socketStatus:   'disconnected',

  // ── Actions ───────────────────────────────────────────────────────────────

  connectToRun(runId, userId, initialState) {
    // Remove any stale listeners before re-registering (handles hot reconnects).
    socket.off('cascade:trigger');
    socket.off('turn:settled');
    socket.off('connect');
    socket.off('connect_error');
    socket.off('disconnect');

    set({
      runId,
      userId,
      socketStatus: 'connecting',
      cascadeQueue: [],
      // Explicitly clear all last-roll display state so a new run never
      // inherits stale dice, result labels, or delta animations from the
      // previous run. initialState may also set these, but we zero them
      // first so any missing key in initialState doesn't leave stale data.
      lastDice:       null,
      lastRollResult: null,
      lastDelta:      null,
      lastBetDelta:   null,
      isRolling:      false,
      ...initialState,
    });

    // ── Socket event handlers ─────────────────────────────────────────────

    socket.on('connect', () => {
      set({ socketStatus: 'connected' });

      // Subscribe to the run's room immediately on (re)connect.
      socket.emit('subscribe:run', { runId });
    });

    socket.on('subscribed', () => {
      set({ socketStatus: 'subscribed' });
    });

    socket.on('connect_error', (err) => {
      console.error('[socket] connection error:', err.message);
      set({ socketStatus: 'error' });
    });

    socket.on('disconnect', (reason) => {
      set({ socketStatus: 'disconnected' });
      if (reason === 'io server disconnect') {
        // Server intentionally disconnected — do NOT auto-reconnect.
        socket.disconnect();
      }
      // Otherwise socket.io will auto-reconnect per the reconnection config.
    });

    // ── cascade:trigger ───────────────────────────────────────────────────
    //
    // The server emits one of these for each crew member that changed the
    // TurnContext. We enqueue all events as they arrive; the UI dequeues
    // them one-by-one as each portrait-flash animation completes.
    socket.on('cascade:trigger', (event: CascadeEvent) => {
      const counter = get()._seqCounter + 1;
      const queued: QueuedCascadeEvent = { ...event, seq: counter };

      set((state) => ({
        cascadeQueue: [...state.cascadeQueue, queued],
        _seqCounter:  counter,
      }));
    });

    // ── turn:settled ──────────────────────────────────────────────────────
    //
    // Arrives after ALL cascade events have been emitted. We update the
    // persistent run state here. The animation queue may still have events
    // in it — the UI continues draining it while showing the updated bankroll.
    socket.on('turn:settled', (payload: TurnSettledPayload) => {
      set({
        bankroll:           payload.newBankroll,
        bets:               payload.newBets,
        shooters:           payload.newShooters,
        hype:               payload.newHype,
        phase:              payload.newPhase,
        point:              payload.newPoint,
        status:             payload.runStatus,
        currentMarkerIndex: payload.newMarkerIndex,
        lastDice:           payload.dice,
        lastRollResult:     payload.rollResult,
        lastDelta:          payload.bankrollDelta,
        // Roll has resolved — clear the bet-placement delta so the
        // placement animation doesn't re-fire on any future re-render.
        lastBetDelta:       null,
        isRolling:          false,
      });
    });

    // ── Connect ───────────────────────────────────────────────────────────
    if (!socket.connected) {
      socket.connect();
    } else {
      // Already connected from a previous run — re-subscribe immediately.
      set({ socketStatus: 'connected' });
      socket.emit('subscribe:run', { runId });
    }
  },

  disconnect() {
    socket.off('cascade:trigger');
    socket.off('turn:settled');
    socket.off('connect');
    socket.off('connect_error');
    socket.off('disconnect');
    socket.off('subscribed');
    socket.disconnect();

    set({
      runId:               null,
      userId:              null,
      status:              null,
      phase:               null,
      bankroll:            0,
      point:               null,
      hype:                1.0,
      shooters:            5,
      currentMarkerIndex:  0,
      bets:                DEFAULT_BETS,
      crewSlots:           DEFAULT_CREW_SLOTS,
      lastDice:            null,
      lastRollResult:      null,
      lastDelta:           null,
      lastBetDelta:        null,
      _betDeltaKey:        0,
      isRolling:           false,
      cascadeQueue:        [],
      rollHistory:         [],
      socketStatus:        'disconnected',
    });
  },

  setActiveChip(cents) {
    set({ activeChip: cents });
  },

  placeBet(field, amount) {
    set((state) => {
      if (state.bankroll < amount) return state; // insufficient funds — no-op

      // ── 3-4-5x Odds cap (front-door validation) ──────────────────────────
      // Reject the entire chip placement if it would push the Odds bet past
      // the allowed multiplier for the current point.  This mirrors the
      // server-side validateOddsBet() check so the engine never sees an
      // illegal bet, preventing the silent-crash / locked-UI bug.
      if (field === 'odds') {
        const { point, bets } = state;
        if (point === null) {
          // No Odds allowed during the come-out phase.
          console.warn('[placeBet] Odds bet rejected: no point is established.');
          return state;
        }
        const proposedTotal = bets.odds + amount;
        const cappedTotal   = validateOddsBet(bets.passLine, proposedTotal, point);
        if (cappedTotal < proposedTotal) {
          console.warn(
            `[placeBet] Odds bet rejected: $${(proposedTotal / 100).toFixed(2)} exceeds` +
            ` 3-4-5x limit for point ${point}` +
            ` (max $${(cappedTotal / 100).toFixed(2)}).`,
          );
          return state; // REJECT — bankroll and bets unchanged
        }
      }

      return {
        bankroll:     state.bankroll - amount,
        bets:         withBetField(state.bets, field, getBetField(state.bets, field) + amount),
        // Drive an immediate chip-placement animation. Negative because money
        // is leaving the bankroll right now, not at roll time.
        lastBetDelta: -amount,
        _betDeltaKey: state._betDeltaKey + 1,
      };
    });
  },

  removeBet(field) {
    set((state) => {
      const current = getBetField(state.bets, field);
      if (current === 0) return state;
      return {
        bankroll: state.bankroll + current,
        bets: withBetField(state.bets, field, 0),
      };
    });
  },

  setRolling(rolling) {
    set({ isRolling: rolling });
  },

  dequeueEvent() {
    set((state) => ({
      cascadeQueue: state.cascadeQueue.slice(1),
    }));
  },

  async rollDice() {
    const { runId, userId, bets, isRolling } = get();
    if (isRolling || !runId || !userId) return;

    set({ isRolling: true });
    try {
      const res = await fetch(`/api/v1/runs/${runId}/roll`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id':    userId,
        },
        body: JSON.stringify({ bets }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
        throw new Error(body.error ?? `Roll failed: ${res.status}`);
      }

      // Sync bet state and QA receipt immediately from the HTTP response.
      // The server is the source of truth for which chips are still on the
      // table — applying this before turn:settled eliminates the window where
      // cleared bets (e.g., a soft-loss hardway) still show as live chips.
      const data = await res.json() as {
        roll: { receipt: RollReceipt; resolvedBets: Bets };
      };
      const { receipt, resolvedBets } = data.roll;
      set((state) => ({
        ...(resolvedBets && { bets: resolvedBets }),
        ...(receipt && { rollHistory: [receipt, ...state.rollHistory].slice(0, 50) }),
      }));
      // On success: 'turn:settled' WS event clears isRolling (and re-confirms bets).
    } catch (err) {
      console.error('[rollDice] engine error:', err);
      set({ isRolling: false });
    }
  },

  async recruitCrew(crewId, slotIndex) {
    const { runId, userId } = get();
    if (!runId || !userId) throw new Error('No active run to recruit into.');

    const body =
      crewId !== null && slotIndex !== undefined
        ? { crewId, slotIndex }
        : {};

    const res = await fetch(`/api/v1/runs/${runId}/recruit`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id':    userId,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Recruit failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      bankroll:  number;
      shooters:  number;
      hype:      number;
      phase:     GamePhase;
      status:    RunStatus;
      point:     number | null;
      crewSlots: StoredCrewSlots;
    };

    set({
      bankroll:  data.bankroll,
      shooters:  data.shooters,
      hype:      data.hype,
      phase:     data.phase,
      status:    data.status,
      point:     data.point,
      crewSlots: data.crewSlots,
      // Clear last-roll display so the table starts fresh
      lastDice:       null,
      lastRollResult: null,
      lastDelta:      null,
      cascadeQueue:   [],
    });
  },
}));

// ---------------------------------------------------------------------------
// Selectors (memoised via shallow comparison in components)
// ---------------------------------------------------------------------------

/** True while any cascade event is pending animation. */
export const selectIsCascading = (s: GameState) => s.cascadeQueue.length > 0;

/** The slot index that should currently be animating (head of queue), or -1. */
export const selectActiveSlot = (s: GameState): number =>
  s.cascadeQueue[0]?.slotIndex ?? -1;

/** The bark text for the currently-animating crew member, or null. */
export const selectActiveBark = (s: GameState): { seq: number; crewName: string } | null => {
  const head = s.cascadeQueue[0];
  return head ? { seq: head.seq, crewName: head.crewName } : null;
};

/** Formatted bankroll string: "$12.50" */
export const selectBankrollDisplay = (s: GameState): string =>
  `$${(s.bankroll / 100).toFixed(2)}`;

/** Formatted hype string: "1.4×" */
export const selectHypeDisplay = (s: GameState): string =>
  `${s.hype.toFixed(2)}×`;
