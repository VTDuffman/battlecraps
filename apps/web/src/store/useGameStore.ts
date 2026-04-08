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

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';
import type {
  Bets,
  RunStatus,
  GamePhase,
  CascadeEvent,
  RollResult,
  RollReceipt,
} from '@battlecraps/shared';
import { validateOddsBet, getMaxBet, getBossMinBet, isBossMarker } from '@battlecraps/shared';

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
  newBets:                 Bets;
  newConsecutivePointHits: number;
  newBossPointHits:        number;
  payoutBreakdown:         { passLine: number; odds: number; hardways: number };
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

  /** Consecutive point hits by the current shooter. Resets on Seven Out or marker clear. */
  consecutivePointHits: number;

  /** Remaining shooter lives. */
  shooters: number;

  /** Active bets for the current roll (in cents). */
  bets: Bets;

  /**
   * Bets locked in as of the last completed roll.
   * This is the floor — right-clicking a bet zone can only reduce bets
   * down to the committed amount, never below it.
   * Synced from `newBets` on every `turn:settled` event.
   */
  committedBets: Bets;

  /** The currently selected chip denomination in cents (e.g. 500 = $5). */
  activeChip: number;

  /** Index into MARKER_TARGETS — how many markers have been cleared so far. */
  currentMarkerIndex: number;

  /**
   * Point hits scored so far in the current boss fight segment.
   * 0 outside boss fights. Drives getBossMinBet() for the RISING_MIN_BETS rule.
   * Synced from the server via turn:settled and recruit responses.
   */
  bossPointHits: number;

  // ── Crew ──────────────────────────────────────────────────────────────────
  crewSlots: StoredCrewSlots;

  /**
   * Active Mechanic freeze. null when no freeze is in effect.
   * Set by setMechanicFreeze(); updated from roll responses.
   */
  mechanicFreeze: { lockedValue: number; rollsRemaining: number } | null;

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

  // ── Deferred settlement ───────────────────────────────────────────────────
  /**
   * Buffered turn:settled payload waiting for the dice animation + result
   * popup to complete before the visible game state is updated.
   * Null when no roll is in flight or after applyPendingSettlement() is called.
   */
  pendingSettlement: TurnSettledPayload | null;

  // ── Back-wall flash (dice hit the far wall) ───────────────────────────────
  /** True for the duration of the wall-flash animation (~300ms). */
  wallFlash: boolean;
  /** Increments each throw so the CSS animation re-fires on every roll. */
  _wallFlashKey: number;

  // ── Screen flash ──────────────────────────────────────────────────────────
  /** Which flash colour to show: 'win' (gold) | 'lose' (red) | null (none). */
  flashType: 'win' | 'lose' | null;
  /**
   * Increments on every applyPendingSettlement() call that produces a flash.
   * Used as the React key on the overlay so the CSS animation re-fires even
   * when the same flashType occurs on consecutive rolls.
   */
  _flashKey: number;

  // ── Payout pops ───────────────────────────────────────────────────────────
  /**
   * Per-zone win amounts (cents) to display as floating "+$X.XX" pops.
   * Null between rolls. Set by applyPendingSettlement(), cleared next roll.
   * hardwayField identifies WHICH hardway zone shows the pop (null if none won).
   */
  payoutPops: {
    passLine:     number;
    odds:         number;
    hardways:     number;
    hardwayField: BetField | null;
  } | null;
  /** Increments on each winning reveal — React key to re-fire pop animations. */
  _popsKey: number;

  // ── Point ring animation ──────────────────────────────────────────────────
  /** 'set' while POINT_SET ring is playing; 'hit' for POINT_HIT; null otherwise. */
  pointRingType: 'set' | 'hit' | null;
  /** Increments each time triggerPointRing() fires — React key to re-fire. */
  _pointRingKey: number;

  // ── Cascade animation queue ───────────────────────────────────────────────
  /**
   * Holding buffer for cascade events received BEFORE the dice result is
   * revealed. 'cascade:trigger' WS events are pushed here immediately so we
   * know which crew fired, but portrait animations must not start until the
   * player has seen the dice outcome. applyPendingSettlement() flushes this
   * into cascadeQueue at the reveal moment.
   */
  pendingCascadeQueue: QueuedCascadeEvent[];

  /**
   * FIFO queue of cascade events waiting to be animated.
   * The head (index 0) is the currently-animating event.
   * An empty array means no animation is running.
   * Only populated from pendingCascadeQueue during applyPendingSettlement().
   */
  cascadeQueue: QueuedCascadeEvent[];

  /**
   * True during the ~1.5 s win-animation window that follows a marker clear
   * (TRANSITION result). Keeps TableBoard mounted so ChipRain, screen-flash,
   * and payout pops all play to completion before the celebration screen
   * appears. Cleared when the delayed status flip to 'TRANSITION' fires.
   */
  pendingTransition: boolean;

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
   * Remove any bet added since the last roll on `field`, returning the
   * pending amount to bankroll. Bets at or below the committed floor
   * (locked in from the previous roll) are untouched.
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
   * Apply the buffered turn:settled payload to visible game state.
   *
   * Called by DiceZone after the dice animation completes and the result
   * popup begins to fade — this is the "reveal" moment. Clears isRolling
   * so the Roll button re-enables only after the full sequence is done.
   */
  applyPendingSettlement(): void;

  /**
   * Fires the back-wall flash for ~300ms. Called by DiceZone when the throw
   * animation ends and the dice "hit" the far wall of the table.
   */
  triggerWallFlash(): void;

  /**
   * Fires the point puck ring animation for ~750ms. Called by DiceZone at
   * dice-landing time on POINT_SET or POINT_HIT results.
   */
  triggerPointRing(type: 'set' | 'hit'): void;

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

  /**
   * Fire (remove) a crew member from the given slot index (0–4).
   *
   * Allowed in any status except GAME_OVER, including at the pub (TRANSITION).
   * No bankroll refund. Updates crewSlots in the store on success.
   * Throws on network or server error so the caller can surface it.
   */
  fireCrew(slotIndex: number): Promise<void>;

  /**
   * Activate The Mechanic's freeze: lock a die face (1–6) for the next 4 rolls.
   * Once per shooter. Takes effect starting from the next roll.
   * Throws on network or server error so the caller can surface it.
   */
  setMechanicFreeze(lockedValue: number): Promise<void>;
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
  consecutivePointHits: 0,
  shooters:            5,
  currentMarkerIndex:  0,
  bossPointHits:       0,
  bets:                DEFAULT_BETS,
  committedBets:       DEFAULT_BETS,
  activeChip:          500,  // $5 default
  crewSlots:           DEFAULT_CREW_SLOTS,
  mechanicFreeze:      null,
  lastDice:       null,
  lastRollResult: null,
  lastDelta:      null,
  lastBetDelta:   null,
  _betDeltaKey:   0,
  isRolling:          false,
  pendingSettlement:  null,
  wallFlash:          false,
  _wallFlashKey:      0,
  flashType:          null,
  _flashKey:          0,
  payoutPops:         null,
  _popsKey:           0,
  pointRingType:      null,
  _pointRingKey:      0,
  pendingCascadeQueue: [],
  cascadeQueue:        [],
  pendingTransition:   false,
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
      socketStatus:        'connecting',
      pendingCascadeQueue: [],
      cascadeQueue:        [],
      pendingTransition:   false,
      // Explicitly clear all last-roll display state so a new run never
      // inherits stale dice, result labels, or delta animations from the
      // previous run. initialState may also set these, but we zero them
      // first so any missing key in initialState doesn't leave stale data.
      lastDice:          null,
      lastRollResult:    null,
      lastDelta:         null,
      lastBetDelta:      null,
      isRolling:         false,
      pendingSettlement: null,
      wallFlash:         false,
      _wallFlashKey:     0,
      flashType:         null,
      _flashKey:         0,
      payoutPops:        null,
      _popsKey:          0,
      pointRingType:     null,
      _pointRingKey:     0,
      // Reset bets to zero so a new run never inherits a live bet from the
      // previous run. initialState.bets (present when reloading an existing
      // run via /runs/:id) will override this via the spread below.
      bets:           DEFAULT_BETS,
      ...initialState,
      // Always sync committedBets to the server's confirmed bet state so
      // that right-click undo has the correct floor when reconnecting.
      // initialState may spread its own committedBets, but we always override
      // to ensure the floor matches the server's last-settled bets.
      committedBets:  initialState.bets ?? DEFAULT_BETS,
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

      // Buffer into pendingCascadeQueue — NOT cascadeQueue.
      // Portrait animations must not start until applyPendingSettlement()
      // reveals the dice result. The flush happens there.
      set((state) => ({
        pendingCascadeQueue: [...state.pendingCascadeQueue, queued],
        _seqCounter:         counter,
      }));
    });

    // ── turn:settled ──────────────────────────────────────────────────────
    //
    // Arrives after ALL cascade events have been emitted. We split the
    // payload into two parts:
    //   • Immediate  — lastDice / lastRollResult: the animation uses these
    //                  to know when to advance from tumbling → landing.
    //   • Deferred   — everything else (bankroll, bets, hype, phase, …):
    //                  stored in pendingSettlement and applied by
    //                  applyPendingSettlement() after the dice animation
    //                  completes and the result popup begins to fade.
    //                  This prevents the "spoiler" where chips clear, the
    //                  bankroll changes, and the phase flips before the
    //                  player has seen the dice result.
    socket.on('turn:settled', (payload: TurnSettledPayload) => {
      // HTTP response already applied the settlement — skip to avoid overwriting.
      // The WS event is kept as a fallback for cases where the HTTP response
      // parsing fails or is otherwise skipped.
      set((state) => {
        if (state.pendingSettlement !== null) return {};
        return {
          lastDice:          payload.dice,
          lastRollResult:    payload.rollResult,
          pendingSettlement: payload,
        };
      });
    });

    // ── Connect ───────────────────────────────────────────────────────────
    // Pass userId in the auth payload so the server can verify ownership
    // on both connection and room subscription.
    socket.auth = { userId };

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
      consecutivePointHits: 0,
      shooters:            5,
      currentMarkerIndex:  0,
      bossPointHits:       0,
      bets:                DEFAULT_BETS,
      committedBets:       DEFAULT_BETS,
      crewSlots:           DEFAULT_CREW_SLOTS,
      mechanicFreeze:      null,
      lastDice:            null,
      lastRollResult:      null,
      lastDelta:           null,
      lastBetDelta:        null,
      _betDeltaKey:        0,
      isRolling:           false,
      pendingSettlement:   null,
      flashType:           null,
      _flashKey:           0,
      payoutPops:          null,
      _popsKey:            0,
      pendingCascadeQueue: [],
      cascadeQueue:        [],
      pendingTransition:   false,
      rollHistory:         [],
      socketStatus:        'disconnected',
    });
  },

  setActiveChip(cents) {
    set({ activeChip: cents });
  },

  placeBet(field, amount) {
    set((state) => {
      // ── Compute effective amount — clamped to remaining room under the cap ──
      // Rather than rejecting a chip click that would exceed a cap, we top the
      // bet out at the maximum. E.g. $25 chip on a $30 max with $25 already
      // placed → places $5, not a no-op.
      let effectiveAmount: number;

      if (field !== 'odds') {
        // Table max: 10% of the current marker target (Pass Line & hardways).
        const maxBet     = getMaxBet(state.currentMarkerIndex);
        const currentBet = getBetField(state.bets, field);
        const room       = maxBet - currentBet;
        if (room <= 0) return state; // already at table max — no-op
        effectiveAmount  = Math.min(amount, room);
      } else {
        // Odds: capped by the 3-4-5x rule relative to pass line and point.
        const { point, bets } = state;
        if (point === null) {
          // No Odds allowed during the come-out phase.
          console.warn('[placeBet] Odds bet rejected: no point is established.');
          return state;
        }
        const proposedTotal = bets.odds + amount;
        const cappedTotal   = validateOddsBet(bets.passLine, proposedTotal, point);
        const room          = cappedTotal - bets.odds;
        if (room <= 0) return state; // already at odds cap — no-op
        effectiveAmount     = Math.min(amount, room);
      }

      // ── Bankroll check uses the clamped amount ───────────────────────────
      if (state.bankroll < effectiveAmount) return state;

      // ── Boss: Rising Min-Bets soft guard ─────────────────────────────────
      // Informational only — logs when the total would still fall below the
      // server-enforced floor so the player knows to keep adding chips.
      if (field === 'passLine' && isBossMarker(state.currentMarkerIndex)) {
        const minBet   = getBossMinBet(state.currentMarkerIndex, state.bossPointHits);
        const newTotal = getBetField(state.bets, 'passLine') + effectiveAmount;
        if (minBet !== null && newTotal < minBet) {
          console.info(
            `[placeBet] Boss min-bet is $${(minBet / 100).toFixed(0)}. Current total after chip: $${(newTotal / 100).toFixed(0)}. Keep adding chips before rolling.`,
          );
        }
      }

      return {
        bankroll:     state.bankroll - effectiveAmount,
        bets:         withBetField(state.bets, field, getBetField(state.bets, field) + effectiveAmount),
        // Drive an immediate chip-placement animation. Negative because money
        // is leaving the bankroll right now, not at roll time.
        lastBetDelta: -effectiveAmount,
        _betDeltaKey: state._betDeltaKey + 1,
      };
    });
  },

  removeBet(field) {
    set((state) => {
      const current = getBetField(state.bets, field);
      const floor   = getBetField(state.committedBets, field);
      const pending = current - floor;
      if (pending <= 0) return state; // nothing to undo above the committed floor
      return {
        bankroll: state.bankroll + pending,
        bets:     withBetField(state.bets, field, floor),
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

  applyPendingSettlement() {
    const {
      pendingSettlement: p,
      _flashKey,
      _popsKey,
      pendingCascadeQueue,
      status: currentStatus,
    } = get();
    if (!p) return;

    const flashType: 'win' | 'lose' | null =
      p.rollResult === 'NATURAL'   || p.rollResult === 'POINT_HIT'  ? 'win'  :
      p.rollResult === 'SEVEN_OUT' || p.rollResult === 'CRAPS_OUT'  ? 'lose' :
      null;

    // Derive which hardway zone gets the pop from the dice.
    // Hardways are paired dice totalling 4/6/8/10. Only one can resolve per roll.
    const [d1, d2] = p.dice;
    const hardwayField: BetField | null =
      p.payoutBreakdown.hardways > 0 && d1 === d2
        ? (`hard${d1 + d2}` as BetField)
        : null;

    const hasPops =
      p.payoutBreakdown.passLine > 0 ||
      p.payoutBreakdown.odds     > 0 ||
      p.payoutBreakdown.hardways > 0;

    const payoutPops = hasPops
      ? { ...p.payoutBreakdown, hardwayField }
      : null;

    // When a marker is cleared the server sends runStatus: 'TRANSITION'.
    // We hold that flip for ~1.5 s so TableBoard (ChipRain, screen-flash,
    // payout pops, crew portrait animations) can play to completion before
    // App.tsx swaps in the celebration screen.  The visible status stays at
    // its current value; pendingTransition=true tells App.tsx to keep
    // TableBoard mounted. A single setTimeout then commits the flip.
    const isTransition = p.runStatus === 'TRANSITION';

    set({
      bankroll:             p.newBankroll,
      bets:                 p.newBets,
      committedBets:        p.newBets,
      shooters:             p.newShooters,
      hype:                 p.newHype,
      consecutivePointHits: p.newConsecutivePointHits,
      bossPointHits:        p.newBossPointHits,
      phase:                p.newPhase,
      point:                p.newPoint,
      // Hold TRANSITION off screen until win animations complete.
      status:               isTransition ? currentStatus : p.runStatus,
      pendingTransition:    isTransition,
      currentMarkerIndex:   p.newMarkerIndex,
      lastDelta:            p.bankrollDelta,
      lastBetDelta:         null,
      isRolling:            false,
      pendingSettlement:    null,
      flashType,
      _flashKey:            flashType !== null ? _flashKey + 1 : _flashKey,
      payoutPops,
      _popsKey:             hasPops ? _popsKey + 1 : _popsKey,
      // ── Fix [15]: flush gated cascade events at the reveal moment ─────────
      // cascade:trigger events were buffered in pendingCascadeQueue so that
      // portrait animations never fire before the dice result is shown.
      // Now that the result is revealed, move them into the live queue.
      cascadeQueue:         pendingCascadeQueue,
      pendingCascadeQueue:  [],
    });

    if (isTransition) {
      // ── Fix [16]: commit the TRANSITION status after a short win-animation
      // window so ChipRain, screen-flash, and payout pops finish on screen.
      setTimeout(() => set({ status: 'TRANSITION', pendingTransition: false }), 1500);
    }
  },

  triggerWallFlash() {
    set((s) => ({ wallFlash: true, _wallFlashKey: s._wallFlashKey + 1 }));
    setTimeout(() => set({ wallFlash: false }), 300);
  },

  triggerPointRing(type) {
    set((s) => ({ pointRingType: type, _pointRingKey: s._pointRingKey + 1 }));
    setTimeout(() => set({ pointRingType: null }), 750);
  },

  async rollDice() {
    const { runId, userId, bets, isRolling } = get();
    if (isRolling || !runId || !userId) return;

    set({ isRolling: true });
    try {
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/roll`, {
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

      // Parse the full HTTP response — it contains everything needed to apply
      // the settlement without depending on the WebSocket turn:settled event.
      const data = await res.json() as {
        run: {
          bankrollCents:        number;
          shooters:             number;
          hype:                 number;
          phase:                GamePhase;
          status:               RunStatus;
          currentPoint:         number | null;
          currentMarkerIndex:   number;
          consecutivePointHits: number;
          bossPointHits:        number;
          bets:                 Bets;
        };
        roll: {
          dice:             [number, number];
          diceTotal:        number;
          rollResult:       RollResult;
          bankrollDelta:    number;
          receipt:          RollReceipt;
          resolvedBets:    Bets;
          payoutBreakdown: { passLine: number; odds: number; hardways: number };
          mechanicFreeze:  { lockedValue: number; rollsRemaining: number } | null;
        };
      };

      // Build the settlement payload from the HTTP response so the game
      // always advances even if the WebSocket turn:settled event is missed.
      const settlement: TurnSettledPayload = {
        runId:                   runId,
        dice:                    data.roll.dice,
        diceTotal:               data.roll.diceTotal,
        rollResult:              data.roll.rollResult,
        bankrollDelta:           data.roll.bankrollDelta,
        newBankroll:             data.run.bankrollCents,
        newShooters:             data.run.shooters,
        newHype:                 data.run.hype,
        newPhase:                data.run.phase,
        newPoint:                data.run.currentPoint,
        runStatus:               data.run.status,
        newMarkerIndex:          data.run.currentMarkerIndex,
        newBets:                 data.roll.resolvedBets,
        newConsecutivePointHits: data.run.consecutivePointHits,
        newBossPointHits:        data.run.bossPointHits,
        payoutBreakdown:         data.roll.payoutBreakdown,
      };

      set((state) => ({
        lastDice:          settlement.dice,
        lastRollResult:    settlement.rollResult,
        pendingSettlement: settlement,
        mechanicFreeze:    data.roll.mechanicFreeze ?? null,
        ...(data.roll.receipt && {
          rollHistory: [data.roll.receipt, ...state.rollHistory].slice(0, 50),
        }),
      }));
      // isRolling stays true — cleared in applyPendingSettlement() after the
      // dice animation completes. If the WS turn:settled also arrives, the
      // handler below skips it because pendingSettlement is already populated.
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

    const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/recruit`, {
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
      bankroll:      number;
      shooters:      number;
      hype:          number;
      phase:         GamePhase;
      status:        RunStatus;
      point:         number | null;
      crewSlots:     StoredCrewSlots;
      bossPointHits: number;
    };

    set({
      bankroll:      data.bankroll,
      shooters:      data.shooters,
      hype:          data.hype,
      phase:         data.phase,
      status:        data.status,
      point:         data.point,
      crewSlots:     data.crewSlots,
      bossPointHits: data.bossPointHits,
      // Clear last-roll display so the table starts fresh
      lastDice:       null,
      lastRollResult: null,
      lastDelta:      null,
      cascadeQueue:   [],
    });
  },

  async fireCrew(slotIndex) {
    const { runId, userId } = get();
    if (!runId || !userId) throw new Error('No active run.');

    const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/crew/${slotIndex}`, {
      method:  'DELETE',
      headers: { 'x-user-id': userId },
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Fire failed: ${res.status}`);
    }

    const data = (await res.json()) as { crewSlots: StoredCrewSlots };
    // If The Mechanic was fired while a freeze was active, the server clears it.
    // We don't know which crew was fired here, so always sync from the server state.
    // Check if The Mechanic (crewId 3) is still in any slot.
    const mechanicStillPresent = data.crewSlots.some((s) => s?.crewId === 3);
    set({
      crewSlots: data.crewSlots,
      ...(mechanicStillPresent ? {} : { mechanicFreeze: null }),
    });
  },

  async setMechanicFreeze(lockedValue) {
    const { runId, userId } = get();
    if (!runId || !userId) throw new Error('No active run.');

    const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/mechanic-freeze`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id':    userId,
      },
      body: JSON.stringify({ lockedValue }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(err.error ?? `Freeze failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      mechanicFreeze: { lockedValue: number; rollsRemaining: number } | null;
      crewSlots:      StoredCrewSlots;
    };
    set({
      mechanicFreeze: data.mechanicFreeze,
      crewSlots:      data.crewSlots,
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
