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
  CelebrationSnapshot,
  TransitionType,
} from '@battlecraps/shared';
import { validateOddsBet, getMaxBet, getBossMinBet, isBossMarker, GAUNTLET } from '@battlecraps/shared';

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
// Crew roster entry shape (mirrors GET /api/v1/crew-roster response)
// Re-declared here so the web package has no hard dependency on the api package.
// ---------------------------------------------------------------------------

export interface CrewRosterEntry {
  id:                  number;
  name:                string;
  abilityCategory:     string;
  cooldownType:        string;
  baseCostCents:       number;
  visualId:            string;
  rarity:              string;
  briefDescription:    string | null;
  detailedDescription: string | null;
  unlockDescription:   string;
  isAvailable:         boolean;
  unlockProgress:      number | null;
  unlockThreshold:     number | null;
}

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
  /** Present when Lefty McGuffin blocked a seven-out — the original 7 dice before re-roll. */
  originalDice?:           [number, number];
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

  /**
   * Set to the original 7-dice when Lefty McGuffin fires his save, cleared once
   * the dread→relief cinematic completes. Non-null triggers the two-phase
   * applyPendingSettlement delay and the "SEVEN OUT?" overlay in DiceZone.
   */
  dreadDice: [number, number] | null;

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

  // ── Hype flash ────────────────────────────────────────────────────────────
  /** Hype streak tier to animate: 'heating-up' (≥1.5×) | 'on-fire' (≥2.5×) | 'nuclear' (≥5.0×) | null. */
  hypeFlash: 'heating-up' | 'on-fire' | 'nuclear' | null;
  /** Increments each time a hype flash is triggered — React key to re-fire. */
  _hypeFlashKey: number;

  // ── Hype particle flow ────────────────────────────────────────────────────
  /**
   * Source of the most recent hype increase for the particle flow animation.
   * 'dice' = caused by a roll result (POINT_HIT / NATURAL).
   * number = slotIndex of the crew member whose ability caused the boost.
   * null  = no hype increase on the last roll, or not yet set.
   */
  lastHypeSource: number | 'dice' | null;
  /**
   * Increments each time hype increases. React key for the HypeFlow particle
   * system — each increment spawns a new spark that flies from source to meter.
   */
  _hypeKey: number;

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
   * appears. Cleared when the orchestrator transitions to the celebration phase.
   */
  pendingTransition: boolean;

  // ── Transition orchestrator state ─────────────────────────────────────────

  /**
   * Frozen snapshot of the marker state at the moment it was cleared.
   * Non-null during MARKER_CLEAR and BOSS_VICTORY celebration phases.
   *
   * Phase components read from this instead of currentMarkerIndex so they
   * display the marker that was just BEATEN, not the next target. This is
   * the core fix for the chip-rain race condition.
   *
   * Cleared by clearTransition() when the player clicks through to the pub.
   */
  celebrationSnapshot: CelebrationSnapshot | null;

  /**
   * The transition type currently being orchestrated, or null when no
   * transition is in progress (normal gameplay).
   *
   * Set by applyPendingSettlement() (for MARKER_CLEAR / BOSS_VICTORY) or
   * by the TransitionOrchestrator's boss-entry detection effect (BOSS_ENTRY).
   */
  activeTransition: TransitionType | null;

  /**
   * 0-based index into the current transition's phase sequence array.
   * Incremented by advanceTransitionPhase(). Reset to 0 by clearTransition().
   */
  transitionPhaseIndex: number;

  /**
   * The marker index for which a BOSS_ENTRY transition has already been shown.
   * The TransitionOrchestrator checks this to prevent re-triggering the boss
   * introduction modal on every render while the player is mid-boss-fight.
   * null = never shown. Resets on connectToRun (fresh or reconnect).
   */
  bossEntryShownForMarker: number | null;

  /**
   * The marker index for which a MARKER_INTRO transition has already been shown.
   * Prevents the orientation card from re-triggering on every render while
   * the player is at the table on that marker.
   * null = never shown. Resets on connectToRun (fresh or reconnect).
   */
  markerIntroShownForMarker: number | null;

  /**
   * The floor id (1-indexed) for which a FLOOR_REVEAL transition has already
   * been shown. The TransitionOrchestrator checks this to prevent re-triggering
   * the cinematic on every render after the player enters a new floor.
   * null = never shown. Resets on connectToRun (fresh or reconnect).
   */
  floorRevealShownForFloor: number | null;

  /**
   * True once the TITLE transition has been shown and dismissed.
   * Initialized from localStorage ('bc_title_shown') so it persists across
   * page refreshes and new runs. Never reset by connectToRun — this is a
   * player-level flag, not a run-level flag. Once seen, never seen again.
   */
  titleShown: boolean;

  /**
   * The highest bankroll the player has ever achieved, in cents, across all runs.
   * Loaded from the server on connect (users.max_bankroll_cents).
   * Updated client-side in applyPendingSettlement() when newBankroll exceeds
   * the stored value, giving immediate feedback before the next page load.
   * Server is the source of truth; client tracks optimistically for display.
   */
  maxBankrollCents: number;

  /**
   * Crew IDs (original 15) the player has permanently unlocked.
   * Populated from POST /runs or GET /runs/:id responses via connectToRun initialState.
   * Updated in real time by the `unlocks:granted` WebSocket event.
   */
  unlockedCrewIds: number[];

  /**
   * Pending unlock notification to show the player.
   * Set by the `unlocks:granted` WebSocket listener. Cleared by clearUnlockNotification().
   * null = no notification to show.
   */
  unlockNotification: { crewNames: string[] } | null;

  /**
   * Full 30-crew roster with per-user unlock status.
   * null = not yet fetched (loading). Populated by fetchCrewRoster(), which is
   * called automatically by clearTransition() when the pub screen is about to mount.
   * Cleared to null on connectToRun (new/refreshed run) so it re-fetches each visit.
   */
  crewRoster: CrewRosterEntry[] | null;

  /**
   * True once the VICTORY transition has been triggered for the current run.
   * Prevents the 3-phase cinematic from re-triggering on re-renders while it
   * is playing. Resets to false on connectToRun (new run).
   */
  victoryShown: boolean;

  /**
   * Set to true by clearTransition('VICTORY') when all victory phases complete.
   * The TransitionOrchestrator watches this flag in a useEffect and calls
   * onPlayAgain() to bootstrap a fresh run. Routing returns null while this
   * is true so there is no flash of GameOverScreen between cinematic and new game.
   * Resets to false on connectToRun.
   */
  victoryComplete: boolean;

  /**
   * Unix timestamp (ms) set by connectToRun() on every load or resume.
   * TransitionOrchestrator includes this in its dependency array so the
   * transition-detection effect re-runs immediately on hydration — even
   * when currentMarkerIndex and status haven't changed relative to the
   * previous render snapshot.
   */
  lastHydratedAt: number;

  /** Monotonically increasing counter used to generate `seq` values. */
  _seqCounter: number;

  /** Increments on every rollDice() call — React key to re-fire dice animations. */
  _rollKey: number;

  /**
   * Increments each time a Lefty save ends the 1500ms dread window.
   * DiceZone watches this to restart the full throw animation so the player
   * sees the saved dice tumble in rather than an instant static flip.
   */
  _reRollKey: number;

  // ── Tutorial ──────────────────────────────────────────────────────────────
  /**
   * Predetermined dice outcome to be consumed on the next rollDice() call.
   * Set by setTutorialCheatDice() before the player hits Roll on a manual-roll
   * beat. Consumed (used + cleared) automatically inside rollDice() when no
   * explicit cheatDice argument is provided.
   */
  tutorialCheatDice: [number, number] | null;

  // ── Auth ──────────────────────────────────────────────────────────────────
  /**
   * Function that returns a fresh Clerk JWT. Injected by App.tsx after sign-in.
   * Not stored as a token value — the function is called fresh on every request
   * so Clerk's auto-refresh is always used.
   */
  getToken: (() => Promise<string | null>) | null;

  // ── QA Transaction Log ────────────────────────────────────────────────────
  /**
   * Ordered history of the last 50 roll receipts, newest first (index 0).
   * Populated by rollDice() from the HTTP response.
   */
  rollHistory: RollReceipt[];

  // ── Socket connection ─────────────────────────────────────────────────────
  socketStatus: SocketStatus;

  // ── Comp card HUD animation ───────────────────────────────────────────────
  /**
   * Count of comp cards that have already played their deal-in animation.
   * Compared against earnedComps.length in CompCardFan to detect newly earned
   * cards after returning from a boss victory transition (component remounts).
   * Resets to 0 only on a new run (not on reconnect to the same run).
   */
  seenCompCount: number;
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
  connectToRun(runId: string, initialState: Partial<GameState>): void;

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
   *
   * Returns true on success, false on any server/network error so the caller
   * (DiceZone) can abort the throw animation before it gets stuck.
   */
  rollDice(cheatDice?: [number, number]): Promise<boolean>;

  /**
   * Apply the buffered turn:settled payload to visible game state.
   *
   * Called by DiceZone after the dice animation completes and the result
   * popup begins to fade — this is the "reveal" moment. Clears isRolling
   * so the Roll button re-enables only after the full sequence is done.
   */
  applyPendingSettlement(): void;

  // ── Transition orchestrator actions ───────────────────────────────────────

  /**
   * Advance the active transition to the next phase by incrementing
   * transitionPhaseIndex. The TransitionOrchestrator calls this after
   * confirming there is a next phase; for the last phase it calls
   * clearTransition() instead.
   */
  advanceTransitionPhase(): void;

  /**
   * Complete the active transition sequence. Executes type-specific teardown:
   *
   * MARKER_CLEAR / BOSS_VICTORY → sets status='TRANSITION' (shows pub screen),
   *   clears celebrationSnapshot and activeTransition.
   * BOSS_ENTRY and all others   → clears activeTransition only (returns to table).
   *
   * @param type  The TransitionType that just completed all its phases.
   */
  clearTransition(type: TransitionType): void;

  /**
   * Directly set the active transition type. Used by the TransitionOrchestrator
   * to inject the BOSS_ENTRY transition when a boss marker is detected.
   */
  setActiveTransition(type: TransitionType | null): void;

  /**
   * Buffer a predetermined dice outcome for the next player-triggered roll.
   * Called by the tutorial on manual-roll beats before the player hits Roll.
   * Pass null to clear without rolling.
   */
  setTutorialCheatDice(dice: [number, number] | null): void;

  /**
   * Inject the Clerk getToken function from the React auth context.
   * Called by App.tsx after the user signs in. Pass null on sign-out.
   */
  setGetToken(fn: (() => Promise<string | null>) | null): void;

  /**
   * Fetch the full crew roster from GET /api/v1/crew-roster and store it in
   * crewRoster. Called automatically by clearTransition() when the pub screen
   * is about to mount. Safe to call concurrently — subsequent calls are no-ops
   * while a fetch is already in progress.
   */
  fetchCrewRoster(): Promise<void>;

  /**
   * Dismiss the current unlock notification. Called by UnlockNotification
   * after the auto-dismiss timer fires or the player clicks close.
   */
  clearUnlockNotification(): void;

  /** Clear the hype flash after the animation completes. */
  clearHypeFlash(): void;

  /**
   * Record that the BOSS_ENTRY transition has been shown for the given marker.
   * Prevents the modal from re-triggering on every render while in a boss fight.
   */
  setBossEntryShownForMarker(markerIndex: number): void;

  /**
   * Record that the MARKER_INTRO transition has been shown for the given marker.
   * Prevents the orientation card from re-triggering on every render.
   */
  setMarkerIntroShownForMarker(markerIndex: number): void;

  /**
   * Record that the FLOOR_REVEAL transition has been shown for the given floor.
   * Prevents the floor reveal cinematic from re-triggering on every render.
   */
  setFloorRevealShownForFloor(floorId: number): void;

  /**
   * Record that the VICTORY transition has been triggered for this run.
   * Prevents the 3-phase cinematic from re-triggering on re-renders.
   */
  setVictoryShown(): void;

  /**
   * Called by ChipRain's onComplete callback when all chip animations finish.
   * Replaces the previous hardcoded 1500ms setTimeout in applyPendingSettlement
   * with animation-precise timing. No-ops if pendingTransition is false
   * (i.e. this is a regular win roll, not a marker clear).
   */
  triggerChipRainComplete(): void;

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

  /**
   * Record that N comp cards have played their deal-in animation.
   * Called by CompCardFan after the newest card's animation ends.
   */
  markCompsAnimated(count: number): void;
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
  dreadDice:      null,
  lastBetDelta:   null,
  _betDeltaKey:   0,
  isRolling:          false,
  pendingSettlement:  null,
  wallFlash:          false,
  _wallFlashKey:      0,
  flashType:          null,
  _flashKey:          0,
  hypeFlash:          null,
  _hypeFlashKey:      0,
  lastHypeSource:     null,
  _hypeKey:           0,
  payoutPops:         null,
  _popsKey:           0,
  pointRingType:      null,
  _pointRingKey:      0,
  pendingCascadeQueue: [],
  cascadeQueue:        [],
  pendingTransition:   false,
  celebrationSnapshot:      null,
  activeTransition:         null,
  transitionPhaseIndex:     0,
  bossEntryShownForMarker:  null,
  markerIntroShownForMarker: null,
  floorRevealShownForFloor:  null,
  // titleShown persists across runs — read from localStorage once at init.
  titleShown: localStorage.getItem('bc_title_shown') === '1',
  maxBankrollCents: 0,
  unlockedCrewIds:      [],
  crewRoster:           null,
  unlockNotification:   null,
  victoryShown:     false,
  victoryComplete:  false,
  lastHydratedAt: 0,
  _seqCounter:    0,
  _rollKey:       0,
  _reRollKey:     0,
  rollHistory:    [],
  socketStatus:   'disconnected',
  getToken:       null,
  tutorialCheatDice: null,
  seenCompCount:     0,

  // ── Actions ───────────────────────────────────────────────────────────────

  connectToRun(runId, initialState) {
    // Remove any stale listeners before re-registering (handles hot reconnects).
    socket.off('cascade:trigger');
    socket.off('turn:settled');
    socket.off('unlocks:granted');
    socket.off('connect');
    socket.off('connect_error');
    socket.off('disconnect');

    const isNewRun = runId !== get().runId;

    set({
      runId,
      socketStatus:        'connecting',
      lastHydratedAt:      Date.now(),
      ...(isNewRun && { rollHistory: [], seenCompCount: 0 }),
      pendingCascadeQueue:       [],
      cascadeQueue:              [],
      pendingTransition:         false,
      celebrationSnapshot:       null,
      activeTransition:          null,
      transitionPhaseIndex:      0,
      bossEntryShownForMarker:   null,
      markerIntroShownForMarker: null,
      floorRevealShownForFloor:  null,
      victoryShown:              false,
      victoryComplete:           false,
      crewRoster:                null,
      // Explicitly clear all last-roll display state so a new run never
      // inherits stale dice, result labels, or delta animations from the
      // previous run. initialState may also set these, but we zero them
      // first so any missing key in initialState doesn't leave stale data.
      lastDice:          null,
      lastRollResult:    null,
      lastDelta:         null,
      dreadDice:         null,
      lastBetDelta:      null,
      isRolling:         false,
      pendingSettlement: null,
      wallFlash:         false,
      _wallFlashKey:     0,
      flashType:         null,
      _flashKey:         0,
      hypeFlash:         null,
      _hypeFlashKey:     0,
      lastHypeSource:    null,
      _hypeKey:          0,
      payoutPops:        null,
      _popsKey:          0,
      pointRingType:     null,
      _pointRingKey:     0,
      _reRollKey:        0,
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
        const isLeftySave = payload.originalDice !== undefined;
        return {
          lastDice:          isLeftySave ? payload.originalDice! : payload.dice,
          lastRollResult:    payload.rollResult,
          dreadDice:         isLeftySave ? payload.originalDice! : null,
          pendingSettlement: payload,
        };
      });
    });

    // ── unlocks:granted ───────────────────────────────────────────────────
    //
    // Emitted by the server (lib/unlocks.ts) after a roll grants one or more
    // new crew unlocks. Updates unlockedCrewIds in-place and surfaces a
    // toast notification so the player sees what they just earned.
    // Also invalidates crewRoster so the next pub visit re-fetches fresh data.
    socket.on('unlocks:granted', (payload: { newUnlockIds: number[]; crewNames: string[] }) => {
      set((state) => ({
        unlockedCrewIds:    [...new Set([...state.unlockedCrewIds, ...payload.newUnlockIds])],
        unlockNotification: { crewNames: payload.crewNames },
        // Invalidate the cached roster — availability has changed.
        crewRoster:         null,
      }));
    });

    // ── Connect ───────────────────────────────────────────────────────────
    // Use function form so Socket.IO calls getToken() fresh on every
    // connect/reconnect attempt — Clerk auto-refresh keeps it valid.
    socket.auth = (cb: (data: { token: string }) => void) => {
      void (get().getToken?.() ?? Promise.resolve(null)).then((token) => {
        cb({ token: token ?? '' });
      });
    };

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
    socket.off('unlocks:granted');
    socket.off('connect');
    socket.off('connect_error');
    socket.off('disconnect');
    socket.off('subscribed');
    socket.disconnect();

    set({
      runId:               null,
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
      hypeFlash:           null,
      _hypeFlashKey:       0,
      lastHypeSource:      null,
      _hypeKey:            0,
      payoutPops:          null,
      _popsKey:            0,
      _reRollKey:          0,
      pendingCascadeQueue:       [],
      cascadeQueue:              [],
      pendingTransition:         false,
      celebrationSnapshot:       null,
      activeTransition:          null,
      transitionPhaseIndex:      0,
      bossEntryShownForMarker:   null,
      markerIntroShownForMarker: null,
      floorRevealShownForFloor:  null,
      victoryShown:              false,
      victoryComplete:           false,
      rollHistory:               [],
      socketStatus:              'disconnected',
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
        // Table max: scales with boss minimum in boss rooms, 10% of target otherwise.
        const maxBet     = getMaxBet(state.currentMarkerIndex, state.bossPointHits);
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
      // If the chip is larger than remaining bankroll, go all-in rather than
      // blocking. The effectiveAmount is already capped to the table/odds max
      // above, so this final clamp just handles the bankroll edge case.
      if (state.bankroll <= 0) return state;
      effectiveAmount = Math.min(effectiveAmount, state.bankroll);

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
      _hypeFlashKey,
      _hypeKey,
      _popsKey,
      pendingCascadeQueue,
      status: currentStatus,
    } = get();
    if (!p) return;

    // ── Dread phase (Lefty McGuffin save) ─────────────────────────────────────
    // On first call after a Lefty save: dice are showing the original 7.
    // Flush the cascade so Lefty's portrait fires, hold for 1500ms so the
    // player experiences dread, then signal DiceZone to throw the dice again.
    // The second throw lands on the saved result; onLandEnd calls
    // applyPendingSettlement() as normal to complete settlement.
    if (p.originalDice !== undefined && get().dreadDice !== null) {
      set({
        cascadeQueue:        pendingCascadeQueue,
        pendingCascadeQueue: [],
        // isRolling intentionally stays true — prevents re-roll during dread window
      });
      setTimeout(() => {
        const cur = get().pendingSettlement;
        if (!cur) return; // guard: run was reset (NEW RUN) during the dread window
        set((s) => ({
          lastDice:       cur.dice,
          lastRollResult: cur.rollResult,
          dreadDice:      null,
          // Increment to tell DiceZone to start a full re-throw animation.
          // applyPendingSettlement() will be called by onLandEnd after that throw.
          _reRollKey:     s._reRollKey + 1,
        }));
      }, 1500);
      return;
    }

    // Lose results always take priority. Win fires for canonical win results AND
    // any roll where the player nets money (e.g. NO_RESOLUTION with a hardway
    // payout or a crew flat bonus — KI-019 / KI-021).
    const flashType: 'win' | 'lose' | null =
      p.rollResult === 'SEVEN_OUT' || p.rollResult === 'CRAPS_OUT'  ? 'lose' :
      p.rollResult === 'NATURAL'   || p.rollResult === 'POINT_HIT' || p.bankrollDelta > 0 ? 'win' :
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
    // the celebration phase appears.
    const isTransition = p.runStatus === 'TRANSITION';

    // Build a frozen snapshot of the marker being cleared BEFORE the state
    // update advances currentMarkerIndex. This prevents the race condition
    // where UI components read the already-incremented new target during
    // the chip-rain / celebration window.
    const {
      currentMarkerIndex: oldMarkerIndex,
      bankroll:           oldBankroll,
      maxBankrollCents:   oldMaxBankrollCents,
    } = get();

    const celebrationSnapshot: CelebrationSnapshot | null = isTransition
      ? {
          markerIndex:   oldMarkerIndex,
          targetCents:   GAUNTLET[oldMarkerIndex]?.targetCents ?? 0,
          floorId:       Math.floor(oldMarkerIndex / 3) + 1,
          bankrollBefore: oldBankroll,
          bankrollAfter:  p.newBankroll,
          isBossVictory:  GAUNTLET[oldMarkerIndex]?.isBoss === true,
        }
      : null;

    const oldHype = get().hype;
    const newHype = p.newHype;

    // Hype particle source detection.
    // POINT_HIT and NATURAL are the only roll results that tick hype from the
    // dice outcome itself — everything else must have been crew-driven.
    let hypeSource: number | 'dice' | null = null;
    if (newHype > oldHype) {
      if (p.rollResult === 'POINT_HIT' || p.rollResult === 'NATURAL') {
        hypeSource = 'dice';
      } else {
        const firstCrew = pendingCascadeQueue[0];
        if (firstCrew !== undefined) {
          hypeSource = firstCrew.slotIndex;
        }
      }
    }

    let flashTier: 'heating-up' | 'on-fire' | 'nuclear' | null = null;

    if (oldHype < 5.0 && newHype >= 5.0) {
      flashTier = 'nuclear';
    } else if (oldHype < 2.5 && newHype >= 2.5) {
      flashTier = 'on-fire';
    } else if (oldHype < 1.5 && newHype >= 1.5) {
      flashTier = 'heating-up';
    }

    set({
      bankroll:             p.newBankroll,
      bets:                 p.newBets,
      // Only the Pass Line is locked between rolls. Odds and hardway bets are
      // "working" proposition bets that the player may take down at any time.
      committedBets:        {
        passLine: p.newBets.passLine,
        odds:     0,
        hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 },
      },
      shooters:             p.newShooters,
      hype:                 p.newHype,
      consecutivePointHits: p.newConsecutivePointHits,
      bossPointHits:        p.newBossPointHits,
      phase:                p.newPhase,
      point:                p.newPoint,
      // Hold the old status during celebration — the orchestrator uses
      // activeTransition (not status) to route to celebration phases.
      // Status becomes 'TRANSITION' only when clearTransition() fires,
      // after the player has clicked through all celebration phases.
      status:               isTransition ? currentStatus : p.runStatus,
      pendingTransition:    isTransition,
      currentMarkerIndex:   p.newMarkerIndex,
      celebrationSnapshot,
      lastDelta:            p.bankrollDelta,
      lastBetDelta:         null,
      isRolling:            false,
      pendingSettlement:    null,
      flashType,
      _flashKey:            flashType !== null ? _flashKey + 1 : _flashKey,
      hypeFlash:            flashTier,
      _hypeFlashKey:        flashTier !== null ? _hypeFlashKey + 1 : _hypeFlashKey,
      lastHypeSource:       hypeSource,
      _hypeKey:             hypeSource !== null ? _hypeKey + 1 : _hypeKey,
      payoutPops,
      _popsKey:             hasPops ? _popsKey + 1 : _popsKey,
      // Flush buffered cascade events at the reveal moment — portrait
      // animations must not fire before the player has seen the dice result.
      cascadeQueue:         pendingCascadeQueue,
      pendingCascadeQueue:  [],
      // Track personal best optimistically so the GameOverScreen can show it
      // immediately without waiting for the next page load.
      maxBankrollCents:     Math.max(oldMaxBankrollCents, p.newBankroll),
    });

    if (isTransition) {
      // Primary handoff: ChipRain.onComplete → triggerChipRainComplete() (below).
      // Safety fallback: fires at 3 s if ChipRain never calls back (e.g. the
      // component unmounted, or the payout was somehow zero cents).
      // 3 s safely covers the longest torrent animation (~2.6 s max).
      // If triggerChipRainComplete() already fired, pendingTransition will be
      // false and this becomes a no-op.
      setTimeout(() => {
        if (!get().pendingTransition) return;
        const { celebrationSnapshot: snap } = get();
        set({
          pendingTransition:    false,
          activeTransition:     snap?.isBossVictory ? 'BOSS_VICTORY' : 'MARKER_CLEAR',
          transitionPhaseIndex: 0,
        });
      }, 3000);
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

  // ── Transition orchestrator actions ───────────────────────────────────────

  advanceTransitionPhase() {
    set((s) => ({ transitionPhaseIndex: s.transitionPhaseIndex + 1 }));
  },

  clearTransition(type) {
    if (type === 'MARKER_CLEAR' || type === 'BOSS_VICTORY') {
      // Celebration complete — hand off to the pub screen.
      // Now safe to expose the new marker state: celebrationSnapshot is cleared.
      // Clear payoutPops, flashType, and _flashKey so neither ChipRain nor
      // useCrowdAudio re-fire their stale events when TableBoard remounts after the pub.
      set({
        status:               'TRANSITION',
        activeTransition:     null,
        transitionPhaseIndex: 0,
        celebrationSnapshot:  null,
        payoutPops:           null,
        flashType:            null,
        _flashKey:            0,
      });
      // Pre-fetch the roster so PubScreen data is ready (or nearly so) on mount.
      void get().fetchCrewRoster();
    } else if (type === 'VICTORY') {
      // All 3 victory phases complete. Signal the TransitionOrchestrator to
      // call onPlayAgain() via its victoryComplete useEffect.
      set({ victoryComplete: true, activeTransition: null, transitionPhaseIndex: 0 });
    } else {
      // BOSS_ENTRY, FLOOR_REVEAL, MARKER_INTRO, and future types — just clear
      // the transition and return the player to normal gameplay (TableBoard).
      if (type === 'TITLE') {
        // Persist the flag so it survives page refreshes and new runs.
        localStorage.setItem('bc_title_shown', '1');
        set({ activeTransition: null, transitionPhaseIndex: 0, titleShown: true });
      } else {
        set({ activeTransition: null, transitionPhaseIndex: 0 });
      }
    }
  },

  setActiveTransition(type) {
    set({ activeTransition: type, transitionPhaseIndex: 0 });
  },

  setBossEntryShownForMarker(markerIndex) {
    set({ bossEntryShownForMarker: markerIndex });
  },

  setMarkerIntroShownForMarker(markerIndex) {
    set({ markerIntroShownForMarker: markerIndex });
  },

  setFloorRevealShownForFloor(floorId) {
    set({ floorRevealShownForFloor: floorId });
  },

  setVictoryShown() {
    set({ victoryShown: true });
  },

  triggerChipRainComplete() {
    // No-op if this isn't a marker-clear win-animation window.
    if (!get().pendingTransition) return;
    const { celebrationSnapshot: snap } = get();
    set({
      pendingTransition:    false,
      activeTransition:     snap?.isBossVictory ? 'BOSS_VICTORY' : 'MARKER_CLEAR',
      transitionPhaseIndex: 0,
    });
  },

  async rollDice(cheatDice?: [number, number]) {
    const { runId, bets, isRolling, tutorialCheatDice } = get();
    if (isRolling || !runId) return false;

    // If no explicit dice were passed but buffered tutorial dice are loaded,
    // consume them now and clear the buffer atomically with the isRolling flag.
    const effectiveDice: [number, number] | undefined =
      cheatDice ?? (tutorialCheatDice ?? undefined);

    set((state) => ({ isRolling: true, tutorialCheatDice: null, _rollKey: state._rollKey + 1 }));
    try {
      const token = await get().getToken?.();
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/roll`, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ bets, ...(effectiveDice !== undefined && { cheat_dice: effectiveDice }) }),
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
          originalDice?:   [number, number];
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
        ...(data.roll.originalDice !== undefined && { originalDice: data.roll.originalDice }),
      };

      const isLeftySave = settlement.originalDice !== undefined;
      set((state) => ({
        // When Lefty saves, show the original 7-dice so the animation lands on
        // the intercepted roll. dreadDice being non-null tells DiceZone and
        // applyPendingSettlement to run the two-phase cinematic.
        lastDice:          isLeftySave ? settlement.originalDice! : settlement.dice,
        lastRollResult:    settlement.rollResult,
        dreadDice:         isLeftySave ? settlement.originalDice! : null,
        pendingSettlement: settlement,
        mechanicFreeze:    data.roll.mechanicFreeze ?? null,
        ...(data.roll.receipt && {
          rollHistory: [data.roll.receipt, ...state.rollHistory].slice(0, 50),
        }),
      }));
      // isRolling stays true — cleared in applyPendingSettlement() after the
      // dice animation completes. If the WS turn:settled also arrives, the
      // handler below skips it because pendingSettlement is already populated.
      return true;
    } catch (err) {
      console.error('[rollDice] engine error:', err);
      set({ isRolling: false });
      return false;
    }
  },

  async recruitCrew(crewId, slotIndex) {
    const { runId } = get();
    if (!runId) throw new Error('No active run to recruit into.');

    const body =
      crewId !== null && slotIndex !== undefined
        ? { crewId, slotIndex }
        : {};

    const token = await get().getToken?.();
    const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/recruit`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token ?? ''}`,
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
    const { runId } = get();
    if (!runId) throw new Error('No active run.');

    const token = await get().getToken?.();
    const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/crew/${slotIndex}`, {
      method:  'DELETE',
      headers: { 'Authorization': `Bearer ${token ?? ''}` },
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
    const { runId } = get();
    if (!runId) throw new Error('No active run.');

    const token = await get().getToken?.();
    const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/mechanic-freeze`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token ?? ''}`,
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

  async fetchCrewRoster() {
    // No-op if already fetched or a fetch is in progress (crewRoster !== null).
    if (get().crewRoster !== null) return;

    const token = await get().getToken?.();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE}/api/v1/crew-roster`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { roster: CrewRosterEntry[] };
      set({ crewRoster: data.roster });
    } catch {
      // Fetch failure is non-fatal — PubScreen shows an error state instead.
    }
  },

  clearUnlockNotification() {
    set({ unlockNotification: null });
  },

  clearHypeFlash() {
    set({ hypeFlash: null });
  },

  setGetToken(fn) {
    set({ getToken: fn });
  },

  setTutorialCheatDice(dice) {
    set({ tutorialCheatDice: dice });
  },

  markCompsAnimated(count) {
    set({ seenCompCount: count });
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

/**
 * The marker index that UI display components should reflect.
 * During any transition window (pendingTransition or activeTransition),
 * returns the snapshot index so the player sees the pre-clear state
 * until celebration phases complete. Returns currentMarkerIndex otherwise.
 */
export const selectDisplayMarkerIndex = (s: GameState): number =>
  (s.pendingTransition || s.activeTransition !== null) && s.celebrationSnapshot !== null
    ? s.celebrationSnapshot.markerIndex
    : s.currentMarkerIndex;

export const selectHypeTier = (s: GameState): 0 | 2 | 3 | 4 =>
  s.hype >= 5.0 ? 4 : s.hype >= 2.5 ? 3 : s.hype >= 1.5 ? 2 : 0;
