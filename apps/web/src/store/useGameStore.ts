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
import { arrayMove } from '@dnd-kit/sortable';
import { socket } from '../lib/socket.js';

const API_BASE = (import.meta.env['VITE_API_URL'] as string | undefined) ?? '';
import type {
  Bets,
  RunStatus,
  GamePhase,
  CascadeEvent,
  RollResult,
  RollReceipt,
  RollReceiptLine,
  CelebrationSnapshot,
  TransitionType,
  BossDefeatCinematicId,
  BossVictoryCinematicId,
} from '@battlecraps/shared';
import { validateOddsBet, getMaxBet, getBossMinBet, getBossPayoffCents, isBossMarker, pickBossBark, getFloorByMarkerIndex, GAUNTLET, MARKER_TARGETS } from '@battlecraps/shared';
import type { ConvergenceState, BossRuleType } from '@battlecraps/shared';

/** FB-040: The Architect's room facts on a roll (or the pub exit into his fight). */
export interface ConvergenceFacts {
  rooms:      number[];
  added:      number | null;
  state:      ConvergenceState;
  skimCents?: number;
}

/** FB-040: true when one of the rooms (boss marker indices) brings this rule. */
function isRoomRuleOn(rooms: readonly number[], rule: BossRuleType): boolean {
  return rooms.some((m) => GAUNTLET[m]?.boss?.rule === rule);
}

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
// Feedback context snapshot — deep copy captured just before disconnect so
// the FeedbackModal can include rich game context even after state is cleared.
// ---------------------------------------------------------------------------

/** FB-032: The Foreman's Cut for one roll (mirrors BossCutPayload in rolls.ts). */
/** FB-032: a boss defeat cinematic in progress (see pendingDefeat). */
/** FB-033: a boss victory cinematic in progress (see pendingVictory). */
export interface PendingVictory {
  key:         number;
  id:          BossVictoryCinematicId;
  /** The boss's line (config.ts victoryCinematic.line). */
  line:        string;
  markerIndex: number;
  /** Dev Mode replay. */
  preview:     boolean;
  /**
   * FB-040: the final marker's win (The Architect) — the GAME_OVER flip and the
   * marker advance are held until the cinematic finishes (finishVictoryCinematic),
   * so it plays over the table before the gauntlet victory sequence.
   */
  heldFinal?:  { markerIndex: number };
  /** FB-040: The Architect's rooms in force when he fell (THE PATTERN BREAKS flashes them past). */
  rooms?:      number[];
}

export interface PendingDefeat {
  /** Unique per play — keys the component so a replay restarts it. */
  key:             number;
  id:              BossDefeatCinematicId;
  /** The boss's parting line (config.ts defeatCinematic.line). */
  line:            string;
  /** The boss marker the run ended on. */
  markerIndex:     number;
  /** Payoff bosses: how short the player came up (Payoff − Cut). */
  balanceDueCents: number | null;
  /** FB-035: The Executive's PIP termination (vs. an ordinary loss) — picks the memo. */
  pipTermination:  boolean;
  /** Dev Mode replay — finishing it never ends the run. */
  preview:         boolean;
}

export interface BossCut {
  /** Skimmed on this roll (0 on a loss). */
  amount:  number;
  /** Running Cut after this roll. */
  total:   number;
  /** The Payoff that clears the room. */
  payoff:  number;
  /** This roll reached the Payoff (marker cleared). */
  paidOff: boolean;
}

export interface FeedbackContextSnapshot {
  runId:               string | null;
  /** FB-028: lets feedback triage separate dev-run reports from playtester reports. */
  isDevRun:            boolean;
  currentMarkerIndex:  number;
  bankroll:            number;
  hype:                number;
  crewSlots:           StoredCrewSlots;
  rollHistory:         RollReceipt[];
  capturedAt:          string;
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
  visualId:            string;
  rarity:              string;
  briefDescription:    string | null;
  detailedDescription: string | null;
  unlockDescription:   string;
  unlockQuote:         string | null;
  isAvailable:         boolean;
  unlockProgress:      number | null;
  unlockThreshold:     number | null;
}

// ---------------------------------------------------------------------------
// Pub draft entry shape (mirrors GET /api/v1/runs/:id/pub-draft response)
// Re-declared here so the web package has no hard dependency on the api package.
// ---------------------------------------------------------------------------

export interface PubDraftEntry {
  id:                  number;
  name:                string;
  abilityCategory:     string;
  cooldownType:        string;
  hireCostCents:       number;
  visualId:            string;
  rarity:              string;
  briefDescription:    string | null;
  detailedDescription: string | null;
  unlockDescription:   string;
  isGuaranteed:        boolean;
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
  /** Present when The Physics Professor nudged the dice — the paired dice before the nudge. */
  nudgedFrom?:             [number, number];
  /** Highest gauntlet marker index the player has ever reached, updated when a marker clears. */
  highestMarkerReached:    number;
  /** Sarge's DOUBLE_TIME clock ran out — a blank on the last allowed roll became a SEVEN_OUT. */
  clockExpired?:           boolean;
  /**
   * Index of the crew slot currently enchanted by Mme. Le Prix.
   * Present only during a DISABLE_CREW boss fight (mid-fight updates).
   */
  charmedCrewSlot?:        number;
  /**
   * True when the enchanted crew's ability WOULD HAVE triggered on this roll but
   * was suppressed by the charm. The charm heartbeat only plays when true.
   * Absent (not false) when the charm did not suppress an active ability.
   */
  charmFired?:             boolean;
  /**
   * Present during The Executive's boss fight. Carries the current Cross Calibration
   * rating index (0–4) and whether it changed this roll, plus the direction of change.
   */
  bossRating?:             { index: number; changed: boolean; direction: 'up' | 'down' | null };
  /** True when The Executive fires the final termination (pip termination / game over). */
  pipTermination?:         boolean;
  /** FB-035: the +15% Exceptional bonus paid this roll (The Executive; omitted when 0). */
  exceptionalBonusCents?:  number;
  /** FB-036: crew-bonus escrow facts (escrow fights only). */
  escrow?:                 { heldCents: number; releasedCents: number; seizedCents: number };
  /** FB-036: The Covenant kept the shooter on this Seven-Out. */
  covenantSaved?:          boolean;
  /** FB-037: The Sovereign's tide this roll. */
  tide?:                   { stage: number; nextStage: number; undertowCents?: number; waveShooters?: number };
  /** FB-038: The Commander's orbital bleed this roll. */
  orbit?:                  { bleed: number; hype: number };
  /** FB-039: The Emissary's signal this roll. */
  signal?:                 { landed: { additives: number; hype: number; multipliers: number[] }; sent: { additives: number; hype: number; multipliers: number[] }; dropped: boolean; darkRolls: number; wasDark: boolean };
  /** True when Poseidon's Favor cancelled the shooter's first-roll craps-out (rollResult is NO_RESOLUTION). */
  crapsOutBlocked?:        boolean;
  /** The Architect (CONVERGENCE): crew slot index permanently removed by this seven-out (retired in FB-040). */
  removedCrewSlot?:        number;
  /** FB-040: The Architect's rooms — in force after this roll, the one built, their counters. */
  convergence?:            ConvergenceFacts;
  /** FB-032: The Foreman's Cut on this roll (payoff fights only). */
  bossCut?:                BossCut;
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
   * Per-boss-fight counter; meaning depends on the boss rule (Sarge: clock rolls
   * used, Sovereign: tide stage (getTideStage), Executive: rating, …).
   * 0 outside boss fights. Synced from the server via turn:settled and recruit responses.
   */
  bossPointHits: number;

  /**
   * The crew slot index (0-based) currently enchanted by Mme. Le Prix, or null
   * when outside a DISABLE_CREW boss fight. Set per-come-out from the
   * turn:settled charmedCrewSlot field; cleared on marker transition.
   */
  charmedCrewSlot: number | null;

  /**
   * Entry charm slot picked when the player transitions into the DISABLE_CREW
   * boss fight. Held here until clearTransition('BOSS_ENTRY') fires, at which
   * point it is moved into charmingSlot to start the bark animation. This
   * prevents the charm appearing during the pub / boss-intro screens.
   */
  pendingBossEntryCharm: number | null;

  /**
   * The slot the ❤️ moves to after a charm heartbeat (FB-034: the charmed crew
   * tried to fire). Non-null only while the heartbeat plays on the OLD charmed
   * slot (still charmedCrewSlot); clearCharmingSlot() then moves the ❤️ here,
   * flying it via CharmFlight if the slot changed. Locks rolling meanwhile.
   */
  charmingSlot: number | null;

  /**
   * FB-034: the heart's flight. Set whenever the ❤️ settles on a NEW slot —
   * CharmFlight arcs a heart from `from` (null = her name only) via her name
   * to `to`, and the destination portrait holds its ❤️ until it lands.
   * Cosmetic only; cleared by finishCharmFlight() (or a newer flight).
   *
   * FB-042: with the trap on the table the flight has two stages — 'heart'
   * (the heart flies from the glass to the new crew member, while the
   * released one flies back to the rail) then 'sink' (the new one sinks from
   * the rail under the glass). Undefined = 'heart'.
   */
  charmFlight: { from: number | null; to: number; key: number; stage?: 'heart' | 'sink' } | null;

  /**
   * FB-042: the crew slot Mme. Le Prix was holding under the glass when her
   * fight ended (win or loss) — THE ROSE frees it, SHE TAKES THE CREW starts it
   * from the glass. Null otherwise; reset by the next settlement.
   */
  freedCharmSlot: number | null;

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
  /** True when the last roll was a craps-out cancelled by Poseidon's Favor. */
  lastCrapsOutBlocked: boolean;
  /** True when the last roll was Sarge's DOUBLE_TIME clock running out. */
  lastClockExpired: boolean;
  lastDelta:      number | null;        // signed cents — net bankroll change after roll

  /**
   * Set to the original 7-dice when Lefty McGuffin fires his save, cleared once
   * the dread→relief cinematic completes. Non-null triggers the two-phase
   * applyPendingSettlement delay and the "SEVEN OUT?" overlay in DiceZone.
   */
  dreadDice: [number, number] | null;

  /**
   * Set to the pre-nudge dice when The Physics Professor fires his nudge ability.
   * Non-null while the professor phase in applyPendingSettlement is holding for
   * the 1000ms portrait animation window. Cleared when _nudgeKey increments.
   */
  nudgeDice: [number, number] | null;

  /**
   * Increments each time The Physics Professor completes his nudge sequence.
   * DiceZone watches this as the trigger key for the dice-flip animation.
   */
  _nudgeKey: number;

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
  /** True while the ADVANCE button's auto-collect API call is in flight. Kept
   *  separate from isRolling so the ROLL button text does not show "ROLLING…". */
  isAutoCollecting: boolean;

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

  /**
   * Increments each time Mme. Le Prix enchants a new crew slot (per come-out
   * resolution in the DISABLE_CREW boss fight). React key for the charm
   * portrait label — re-fires even when the same slot index is re-selected.
   */
  _charmKey: number;

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
  /**
   * True once ChipRain's onComplete has fired (or chip rain was absent).
   * Used in concert with cascadeQueue.length === 0 to gate the 1500ms savor
   * window — the transition never starts until both systems are done.
   */
  chipRainDone: boolean;

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
   * The highest gauntlet marker index (0-based) the player has ever reached
   * across all runs. Loaded from users.highest_marker_reached on connect.
   * Updated from the turn:settled WS event and roll HTTP response.
   * Used by the How To Play screen to permanently reveal boss cards.
   */
  highestMarkerReached: number;

  /**
   * Crew IDs (original 15) the player has permanently unlocked.
   * Populated from POST /runs or GET /runs/:id responses via connectToRun initialState.
   * Updated in real time by the `unlocks:granted` WebSocket event.
   */
  unlockedCrewIds: number[];

  /**
   * Crew IDs that have been unlocked but not yet shown to the player via the
   * cinematic unlock sequence. Populated by `unlocks:granted`. Drained one-by-one
   * by `acknowledgeUnlock()` after each cinematic plays. Cleared on connectToRun.
   */
  unacknowledgedUnlocks: number[];

  /**
   * All crew IDs unlocked during this run (superset of unacknowledgedUnlocks).
   * Used by the cinematic modal to replay the sequence for any unlocks earned
   * this session. Cleared on connectToRun so it resets per run.
   */
  crewUnlockedThisRun: number[];

  /**
   * The Three-card draft returned by GET /runs/:id/pub-draft.
   * Empty until fetchPubDraft() resolves. Cleared on connectToRun.
   */
  pubDraft: PubDraftEntry[];

  /**
   * True when there are unacknowledged unlocks AND no cascade animations are
   * pending. The cinematic unlock modal mounts when this flips to true.
   * Set by applyPendingSettlement(); cleared by acknowledgeUnlock().
   */
  unlockModalReady: boolean;

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
   * True once the GAME_OVER transition (UnlockRecapPhase) has been triggered
   * for this run. Prevents the recap from re-triggering on re-renders.
   * Only set when crewUnlockedThisRun is non-empty — runs with no unlocks
   * skip the transition entirely and go straight to GameOverScreen.
   * Resets to false on connectToRun (new run).
   */
  gameOverTransitionShown: boolean;

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

  /** Increments when dice land (throwPhase → idle). React key for emblem animations so they restart in sync with the dice glow. */
  _settleSeq: number;

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

  /**
   * Number of active crew slots for this run (3, 4, or 5). FB-025.
   * New runs start with 3; slot 4 unlocks on BOARD_SEAT (F4 boss);
   * slot 5 unlocks on CARGO_HOLD (F7 boss). Sourced from the server.
   */
  unlockedSlots: 3 | 4 | 5;

  /**
   * Stable dnd-kit item IDs for the ACTIVE crew slots, in display order.
   * Length equals `unlockedSlots` (3, 4, or 5) — not always 5.
   * Reordered in sync with crewSlots so SortableContext reflects the
   * player's current arrangement. Rebuilt via buildSlotIds whenever
   * unlockedSlots changes. Reset to positional defaults on every new/resumed run.
   */
  slotIds: string[];

  /**
   * Frozen snapshot of game context captured just before disconnect().
   * Used by the feedback modal so rich state (crew, roll history, bankroll)
   * is available even after the run state has been cleared.
   * null until the first snapshotForFeedback() call.
   */
  feedbackContextSnapshot: FeedbackContextSnapshot | null;

  // ── The Executive (FB-027) ────────────────────────────────────────────────

  /**
   * Current Cross Calibration rating index (0–4) for The Executive's boss fight.
   * null when not in The Executive's fight. Set on every turn:settled that carries
   * bossRating; reset to null on boss fight end / floor transition.
   */
  executiveRating: number | null;

  /**
   * FB-035: the last +15% Exceptional bonus paid (cents) + a key so the
   * performance meter pops "+15% · $X" once per paying roll. null when none yet.
   */
  exceptionalBonus: { cents: number; key: number } | null;

  // ── Developer Mode (FB-028) ───────────────────────────────────────────────

  /**
   * True when /auth/provision reports this user is an allowlisted developer.
   * Cosmetic only — gates dev UI. The server re-checks every dev request.
   */
  isDev: boolean;

  /** True when the connected run was created via Developer Mode. */
  isDevRun: boolean;

  /**
   * FB-028 dice control: queued [d1, d2] rolls, consumed one per roll and sent
   * as cheat_dice on dev runs only. Cleared on connect / disconnect.
   */
  devDiceQueue: [number, number][];

  /** FB-028 inspector: last full run payload from a dev route / GET /runs/:id. */
  devLastRunPayload: DevRunPayload | null;
  /** FB-028 inspector: last raw roll HTTP response on a dev run. */
  devLastRoll: unknown;

  /**
   * FB-028 cinematic preview in progress. Holds the fields the preview faked so
   * clearTransition() can restore them and skip every real side effect.
   */
  devPreview: { snapshot: Partial<GameState> } | null;

  // ── The Foreman: the Cut and the Payoff (FB-032) ──────────────────────────

  /** Running Cut toward the Payoff (cents). 0 outside payoff fights. */
  bossProgressCents: number;

  // ── The Hierophant: the offering bowl (FB-036) ────────────────────────────

  /** Crew bonuses held in escrow right now (cents). 0 outside escrow fights. */
  escrowHeldCents: number;
  /** The latest roll's escrow facts + a key (drives the bowl's animations). */
  lastEscrow: { heldCents: number; releasedCents: number; seizedCents: number; key: number } | null;
  /** FB-036: bumps each time The Covenant saves a shooter (drives CovenantFlash). */
  _covenantKey: number;
  /** FB-037: the latest roll's tide facts + a key (drives the water line). */
  lastTide: { stage: number; nextStage: number; undertowCents?: number; waveShooters?: number; key: number } | null;
  /** FB-038: the latest roll's orbital bleed (The Commander) + a key (drives the orbit gauge). */
  lastOrbit: { bleed: number; hype: number; key: number } | null;
  /** FB-039: rolls left in The Emissary's crew blackout (0 = in contact). */
  signalDarkRolls: number;
  /** FB-040: The Architect's rooms in force (boss marker indices, build order). Empty outside his fight. */
  convergenceRooms: number[];
  /** FB-040: his rooms' counters (Sarge's clock, Le Prix's charm, the Executive's rating, the tide). */
  convergenceState: ConvergenceState | null;
  /** FB-040: the latest roll's room facts + a key (drives the rooms rail / the rebuild). */
  lastConvergence: (ConvergenceFacts & { key: number }) | null;
  /**
   * FB-040: the room whose floor the table is dressed as (felt, theme, music).
   * Switched by the rebuild animation at its peak (setConvergenceThemeRoom), so
   * the change happens under the blueprint; restored to the newest room on a
   * reload. Null = the Null Space itself.
   */
  convergenceThemeRoom: number | null;
  /** FB-039: the latest roll's signal facts + a key (drives the transmission line). */
  lastSignal: ({ landed: { additives: number; hype: number; multipliers: number[] }; sent: { additives: number; hype: number; multipliers: number[] }; dropped: boolean; darkRolls: number; wasDark: boolean } & { key: number }) | null;
  /** The latest roll's Cut (drives the register's ka-ching / stamp). Null when none. */
  lastBossCut: BossCut | null;
  /** Increments on every roll that adds to the Cut — keys the ka-ching animation. */
  _cutKey: number;
  /** Date.now() when the Payoff was reached; holds the celebration for the PAID IN FULL stamp. */
  payoffAt: number | null;

  /**
   * FB-032: the boss's current in-fight bark (generic system; lines live in
   * config.ts `barks`). key re-fires the animation for repeated text. Null = silent.
   */
  /** speakerMarker (FB-040): an echo — a room boss speaking in The Architect's fight. */
  bossBark: { line: string; key: number; speakerMarker?: number } | null;
  /** Last bark line shown — avoids repeating it back-to-back. */
  bossBarkLastLine: string | null;

  /**
   * FB-032: a boss defeat cinematic is playing over the table. While set, the
   * GAME_OVER status flip is held (like pendingTransition for celebrations)
   * until finishDefeatCinematic(). preview = Dev Mode replay; never ends the run.
   */
  pendingDefeat: PendingDefeat | null;

  /**
   * FB-033: a boss victory cinematic is playing over the table (e.g. Sarge's
   * HONORABLY DISCHARGED). The celebration is held via celebrationHoldUntil.
   */
  pendingVictory: PendingVictory | null;
  /**
   * Date.now() timestamp until which celebration hand-offs must wait, so a
   * victory moment (PAID IN FULL, a boss victory cinematic) is never cut off.
   */
  celebrationHoldUntil: number | null;
}

/** FB-028: what a cinematic preview should show. */
export interface DevPreviewOptions {
  /** Marker the cinematic is about (boss entry / floor reveal / clear). */
  markerIndex:    number;
  /** Crew ids for the unlock recap (GAME_OVER / VICTORY / BOSS_VICTORY). */
  unlockCrewIds?: number[];
}

/**
 * FB-028: run state as returned by GET /runs/:id and the dev routes
 * (mirrors buildRunStatePayload in apps/api/src/routes/runs.ts).
 */
export interface DevRunPayload {
  bankroll:              number;
  shooters:              number;
  hype:                  number;
  phase:                 GamePhase;
  status:                RunStatus;
  point:                 number | null;
  crewSlots:             StoredCrewSlots;
  currentMarkerIndex:    number;
  bets:                  Bets;
  maxBankrollCents:      number;
  unlockedCrewIds:       number[];
  tutorialCompleted:     boolean;
  unacknowledgedUnlocks: { id: number }[];
  highestMarkerReached:  number;
  unlockedSlots:         3 | 4 | 5;
  bossPointHits:         number;
  consecutivePointHits:  number;
  compPerkIds:           number[];
  pendingAdditiveCents:  number;
  bossProgressCents:     number;
  /** FB-039: The Emissary's crew blackout (rolls left). */
  signalDarkRolls?:      number;
  /** FB-040: The Architect's rooms in force + their counters (null outside his fight). */
  convergenceRooms?:     number[] | null;
  convergenceState?:     ConvergenceState | null;
  isDevRun:              boolean;
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
   * If the returned cash pushes the bankroll past the current marker target,
   * autoCollect() is triggered automatically — no Roll click required.
   */
  removeBet(field: BetField): void;

  /**
   * Fires the roll endpoint without dice or a roll animation, expecting an
   * autoClear response. Called automatically by removeBet() when a bet
   * take-down alone clears the current marker target.
   */
  autoCollect(): Promise<void>;

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
   * Called by TableBoard's CrewPortrait onAnimationEnd when the charm
   * heartbeat finishes (or by its safety net). Moves charmingSlot →
   * charmedCrewSlot, starting the heart's flight if the slot changed.
   */
  clearCharmingSlot(): void;

  /** CharmFlight finished (or was skipped) — show the ❤️ on its portrait. */
  finishCharmFlight(): void;
  /** FB-040: dress the table as this room's floor (null = the Null Space). */
  setConvergenceThemeRoom(room: number | null): void;
  /** FB-042: the heart has landed — the new crew member now sinks under the glass. */
  sinkCharmFlight(): void;

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

  /** FB-028: set from the /auth/provision response. */
  setIsDev(isDev: boolean): void;

  /** FB-028: append a roll to the dev dice queue. */
  pushDevDice(dice: [number, number]): void;
  /** FB-028: remove one queued roll by index. */
  removeDevDice(index: number): void;
  /** FB-028: empty the dev dice queue. */
  clearDevDice(): void;

  /**
   * FB-028: apply a run payload returned by a dev route.
   * - reconnect: false — merge data fields in place (no cinematics replay).
   * - reconnect: true  — full connectToRun (marker change / game over), so
   *   entry cinematics and transition detection run as on a fresh load.
   */
  applyDevRunPayload(payload: DevRunPayload, opts: { reconnect: boolean }): void;

  /**
   * FB-028: play a transition sequence with sample data. Client-only — never
   * calls the API. When the sequence ends, clearTransition() restores the faked
   * fields and skips its normal side effects (pub entry, new run, title flag,
   * Le Prix charm). No-op while another transition or roll is in flight.
   */
  previewTransition(type: TransitionType, opts: DevPreviewOptions): void;

  /** FB-035 Dev Mode: play the Executive's TERMINATED cinematic as a PIP termination. */
  previewPinkSlip(): void;

  /**
   * FB-028: mirror a dev account unlock change into client state the same way
   * the real `unlocks:granted` socket event does, so a queued unlock cinematic
   * actually plays (UnlockModal now, UnlockRecapPhase at run end).
   */
  applyDevUnlockChange(change: { granted: number[]; revoked: number[]; queueCinematic: boolean }): void;

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
   * Mark a single unlock as acknowledged. Removes `crewId` from
   * `unacknowledgedUnlocks` and fires POST /user/acknowledge-unlock so the
   * server clears it from users.unacknowledgedUnlockIds. Sets
   * `unlockModalReady = false` immediately so the modal can close.
   */
  acknowledgeUnlock(crewId: number): Promise<void>;

  /**
   * Fetch the pub draft from GET /runs/:id/pub-draft and store it in
   * `pubDraft`. Called when the pub screen is about to mount. No-op when
   * pubDraft is already populated or no runId is set.
   */
  fetchPubDraft(): Promise<void>;

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
   * Record that the GAME_OVER unlock-recap transition has been triggered.
   * Prevents UnlockRecapPhase from re-firing on re-renders.
   */
  setGameOverTransitionShown(): void;

  /**
   * Called by ChipRain's onComplete callback when all chip animations finish.
   * Replaces the previous hardcoded 1500ms setTimeout in applyPendingSettlement
   * with animation-precise timing. No-ops if pendingTransition is false
   * (i.e. this is a regular win roll, not a marker clear).
   */
  triggerChipRainComplete(): void;

  /**
   * Called by DiceZone when dice land (throwPhase → idle). Increments _settleSeq
   * so FloorEmblem restarts its glow animations in sync with the dice idle glow.
   */
  onDiceSettled(): void;

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

  /**
   * Reorder the crew rail by moving the slot at `oldIndex` to `newIndex`.
   * Applies an optimistic UI update immediately, then syncs to the server.
   * Reverts both `crewSlots` and `slotIds` on any network or server error.
   */
  reorderCrew(oldIndex: number, newIndex: number): Promise<void>;

  /**
   * Capture a frozen snapshot of the current game context into
   * feedbackContextSnapshot. Called automatically by disconnect() so the
   * FeedbackModal can read rich state even after run state is cleared.
   */
  snapshotForFeedback(): void;

  /**
   * Clear the feedback context snapshot after the modal is dismissed.
   */
  clearFeedbackSnapshot(): void;

  /**
   * Clear the Executive bark after the animation window completes.
   * Called by the bark UI component's animation-end handler (or a safety timeout).
   */
  /** FB-032: dismiss the current boss bark (BossRoomHeader calls this after it animates out). */
  clearBossBark(): void;
  /** FB-032: the defeat cinematic finished — release GAME_OVER (or end a preview). */
  finishDefeatCinematic(): void;
  /** FB-033: the victory cinematic finished (or was cut short) — clear it. */
  finishVictoryCinematic(): void;
  /** FB-033 Dev Mode: play a boss's victory cinematic (client-only). */
  previewVictoryCinematic(markerIndex: number): void;
  /** FB-032 Dev Mode: play a boss's defeat cinematic without ending the run. */
  previewDefeatCinematic(markerIndex: number): void;

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

/** Build the dnd-kit slot ID array for a given number of active slots. */
function buildSlotIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `slot-${i}`);
}

/**
 * FB-032: extra ms to hold the marker-clear celebration after paying off The
 * Foreman, so the register's PAID IN FULL stamp (CashRegister.tsx) can land
 * first. 0 when the Payoff wasn't just reached.
 */
const PAYOFF_HOLD_MS = 2600;   // FB-032: PAID IN FULL stamp (1.6s) + a beat
/** Celebration hold per boss victory cinematic: its length + a beat. */
const VICTORY_HOLD_MS_BY_ID: Readonly<Record<BossVictoryCinematicId, number>> = {
  HONORABLY_DISCHARGED: 4900,  // FB-033: Sarge (~4.6s)
  THE_ROSE:             7300,  // FB-034: Mme. Le Prix (~5.7s, +1.2s when the glass breaks — FB-042)
  NAMEPLATE_SWAP:       6300,  // FB-035: The Executive (~5.9s)
  THE_EYE_CLOSES:       8600,  // FB-036: The Hierophant (~8.2s — his line is long)
  THE_CROWN_SINKS:      9600,  // FB-037: The Sovereign (~9.2s — the sea floods in first)
  ESCAPE_VELOCITY:      8400,  // FB-038: The Commander (~8.0s)
  MESSAGE_RECEIVED:     8800,  // FB-039: The Emissary (~8.4s)
  THE_PATTERN_BREAKS:   9000,  // FB-040: The Architect (~8.6s) — the final win; holds GAME_OVER instead (heldFinal)
};

/**
 * Delay for a celebration hand-off timer: its usual delay, or longer if a
 * victory moment (PAID IN FULL, a boss victory cinematic) has claimed the table
 * until `holdUntil` (a Date.now() timestamp). Every hand-off timer goes through
 * this so a moment is never cut off by the celebration.
 */
function celebrationDelay(baseMs: number, holdUntil: number | null): number {
  return Math.max(baseMs, holdUntil !== null ? holdUntil - Date.now() : 0);
}

/**
 * Derives boss display state from the stored bossPointHits when a run is
 * (re)hydrated. Only applies at the table during a boss fight; the pub
 * (TRANSITION) recomputes these on exit.
 * - CROSS_CALIBRATION: executiveRating = rating.
 * - DISABLE_CREW: queue the charm so it settles after the boss-entry cinematic
 *   (connectToRun resets bossEntryShownForMarker, so that cinematic replays) —
 *   or, resuming mid-point (no entry cinematic, see entrySeenOnResume), charm
 *   the slot straight away.
 */
/**
 * A run resumed mid-point (Continue Run, a reconnect, a dev run with a point
 * on) is already inside its marker: mark the marker's entry cinematics seen so
 * they don't fire late, the first time the table goes idle. A run resumed idle
 * still plays its entry at load.
 */
function entrySeenOnResume(initialState: Partial<GameState>): Partial<GameState> {
  if (initialState.status !== 'POINT_ACTIVE') return {};
  const markerIndex = initialState.currentMarkerIndex ?? 0;
  return {
    bossEntryShownForMarker:   markerIndex,
    markerIntroShownForMarker: markerIndex,
    floorRevealShownForFloor:  getFloorByMarkerIndex(markerIndex).id,
  };
}

function bossDisplayFromCounter(initialState: Partial<GameState>): Partial<GameState> {
  const markerIndex   = initialState.currentMarkerIndex ?? 0;
  const bossPointHits = initialState.bossPointHits;
  const atTable       = initialState.status === 'IDLE_TABLE' || initialState.status === 'POINT_ACTIVE';
  if (bossPointHits === undefined || !atTable || !isBossMarker(markerIndex)) return {};

  // FB-040: The Architect — his rooms' displays come from their own counters.
  const rooms = initialState.convergenceRooms ?? [];
  const conv  = initialState.convergenceState ?? null;
  if (GAUNTLET[markerIndex]?.boss?.rule === 'CONVERGENCE' && conv !== null) {
    return {
      convergenceThemeRoom: rooms[rooms.length - 1] ?? null,
      ...(isRoomRuleOn(rooms, 'CROSS_CALIBRATION') && { executiveRating: conv.rating }),
      ...(isRoomRuleOn(rooms, 'DISABLE_CREW') && (initialState.status === 'POINT_ACTIVE'
        ? { charmedCrewSlot: conv.charm, pendingBossEntryCharm: null }
        : { pendingBossEntryCharm: conv.charm })),
    };
  }

  switch (GAUNTLET[markerIndex]?.boss?.rule) {
    case 'CROSS_CALIBRATION': return { executiveRating: bossPointHits };
    case 'DISABLE_CREW':      return initialState.status === 'POINT_ACTIVE'
      ? { charmedCrewSlot: bossPointHits, pendingBossEntryCharm: null }
      : { pendingBossEntryCharm: bossPointHits };
    default:                  return {};
  }
}

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
  charmedCrewSlot:     null,
  pendingBossEntryCharm: null,
  charmingSlot:        null,
  charmFlight:         null,
  freedCharmSlot:      null,
  bets:                DEFAULT_BETS,
  committedBets:       DEFAULT_BETS,
  activeChip:          500,  // $5 default
  crewSlots:           DEFAULT_CREW_SLOTS,
  mechanicFreeze:      null,
  lastDice:       null,
  lastRollResult: null,
  lastCrapsOutBlocked: false,
  lastClockExpired: false,
  lastDelta:      null,
  dreadDice:      null,
  nudgeDice:      null,
  _nudgeKey:      0,
  lastBetDelta:   null,
  _betDeltaKey:   0,
  isRolling:          false,
  isAutoCollecting:   false,
  pendingSettlement:  null,
  wallFlash:          false,
  _wallFlashKey:      0,
  flashType:          null,
  _flashKey:          0,
  hypeFlash:          null,
  _hypeFlashKey:      0,
  lastHypeSource:     null,
  _hypeKey:           0,
  _charmKey:          0,
  payoutPops:         null,
  _popsKey:           0,
  pointRingType:      null,
  _pointRingKey:      0,
  pendingCascadeQueue: [],
  cascadeQueue:        [],
  pendingTransition:   false,
  chipRainDone:        false,
  celebrationSnapshot:      null,
  activeTransition:         null,
  transitionPhaseIndex:     0,
  bossEntryShownForMarker:  null,
  markerIntroShownForMarker: null,
  floorRevealShownForFloor:  null,
  // titleShown persists across runs — read from localStorage once at init.
  titleShown: localStorage.getItem('bc_title_shown') === '1',
  maxBankrollCents:      0,
  highestMarkerReached:  0,
  unlockedCrewIds:       [],
  crewRoster:            null,
  unacknowledgedUnlocks: [],
  crewUnlockedThisRun:   [],
  pubDraft:              [],
  unlockModalReady:      false,
  victoryShown:            false,
  victoryComplete:         false,
  gameOverTransitionShown: false,
  lastHydratedAt: 0,
  _seqCounter:    0,
  _rollKey:       0,
  _settleSeq:     0,
  _reRollKey:     0,
  rollHistory:    [],
  socketStatus:   'disconnected',
  getToken:       null,
  tutorialCheatDice: null,
  seenCompCount:     0,
  unlockedSlots:     3,
  slotIds:           buildSlotIds(3),
  feedbackContextSnapshot: null,
  isDev:                   false,
  isDevRun:                false,
  devDiceQueue:            [],
  devLastRunPayload:       null,
  devLastRoll:             null,
  devPreview:              null,
  bossProgressCents:       0,
  escrowHeldCents:         0,
  lastEscrow:              null,
  _covenantKey:            0,
  lastTide:                null,
  lastOrbit:               null,
  signalDarkRolls:         0,
  lastSignal:              null,
  convergenceRooms:        [],
  convergenceState:        null,
  lastConvergence:         null,
  convergenceThemeRoom:    null,
  lastBossCut:             null,
  _cutKey:                 0,
  payoffAt:                null,
  bossBark:                null,
  bossBarkLastLine:        null,
  pendingDefeat:           null,
  pendingVictory:          null,
  celebrationHoldUntil:    null,
  executiveRating:         null,
  exceptionalBonus:        null,

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
      chipRainDone:              false,
      celebrationSnapshot:       null,
      activeTransition:          null,
      transitionPhaseIndex:      0,
      bossEntryShownForMarker:   null,
      markerIntroShownForMarker: null,
      floorRevealShownForFloor:  null,
      victoryShown:              false,
      victoryComplete:           false,
      gameOverTransitionShown:   false,
      crewRoster:                null,
      unacknowledgedUnlocks:     [],
      crewUnlockedThisRun:       [],
      pubDraft:                  [],
      unlockModalReady:          false,
      // Explicitly clear all last-roll display state so a new run never
      // inherits stale dice, result labels, or delta animations from the
      // previous run. initialState may also set these, but we zero them
      // first so any missing key in initialState doesn't leave stale data.
      lastDice:          null,
      lastRollResult:    null,
      lastCrapsOutBlocked: false,
      lastClockExpired: false,
      lastDelta:         null,
      dreadDice:         null,
      nudgeDice:         null,
      _nudgeKey:         0,
      lastBetDelta:      null,
      isRolling:         false,
      isAutoCollecting:  false,
      pendingSettlement: null,
      wallFlash:         false,
      _wallFlashKey:     0,
      flashType:         null,
      _flashKey:         0,
      hypeFlash:         null,
      _hypeFlashKey:     0,
      lastHypeSource:    null,
      _hypeKey:          0,
      _charmKey:             0,
      charmedCrewSlot:       null,
      pendingBossEntryCharm: null,
      charmingSlot:          null,
      charmFlight:           null,
      freedCharmSlot:        null,
      payoutPops:            null,
      _popsKey:             0,
      pointRingType:        null,
      _pointRingKey:     0,
      _reRollKey:        0,
      executiveRating:   null,
      exceptionalBonus:  null,
      // Reset bets to zero so a new run never inherits a live bet from the
      // previous run. initialState.bets (present when reloading an existing
      // run via /runs/:id) will override this via the spread below.
      bets:           DEFAULT_BETS,
      // FB-028: real run unless initialState says otherwise.
      isDevRun:       false,
      devDiceQueue:   [],
      devPreview:     null,
      bossProgressCents: 0,
      escrowHeldCents:   0,
      lastEscrow:        null,
      lastTide:          null,
      lastOrbit:         null,
      signalDarkRolls:   0,
      lastSignal:        null,
      convergenceRooms:  [],
      convergenceState:  null,
      lastConvergence:   null,
      convergenceThemeRoom: null,
      lastBossCut:    null,
      payoffAt:       null,
      bossBark:       null,
      pendingDefeat:  null,
      pendingVictory: null,
      celebrationHoldUntil: null,
      devLastRoll:    null,
      ...initialState,
      // Always sync committedBets to the server's confirmed bet state so
      // that right-click undo has the correct floor when reconnecting.
      // initialState may spread its own committedBets, but we always override
      // to ensure the floor matches the server's last-settled bets.
      committedBets:  initialState.bets ?? DEFAULT_BETS,
      // Rebuild slotIds from the hydrated unlockedSlots so the crew rail
      // always has exactly the right number of dnd-kit drag targets.
      // Placed after ...initialState so we read the resolved unlockedSlots value.
      slotIds: buildSlotIds(initialState.unlockedSlots ?? 3),
      // Boss displays are normally driven by turn:settled; rebuild them from the
      // stored counter so a reload (or a dev run) mid-fight shows the right state.
      ...bossDisplayFromCounter(initialState),
      ...entrySeenOnResume(initialState),
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
      //
      // In test mode (VITE_TEST_MODE) we always replace pendingSettlement with
      // the newest payload so that rapid exhaustShooters API calls — which fire
      // many events back-to-back without waits — never lose the final GAME_OVER
      // event. applyPendingSettlement reads whichever payload is current when the
      // timer fires; duplicate timers after a replacement are no-ops (pendingSettlement=null).
      // In production a new pendingSettlement can only arrive while the dice
      // animation is playing for the PREVIOUS roll, which is impossible (the roll
      // button is disabled while isRolling=true), so the original drop is correct.
      set((state) => {
        const isTestMode  = import.meta.env['VITE_TEST_MODE'] === 'true';
        if (state.pendingSettlement !== null && !isTestMode) return {};
        const isLeftySave = payload.originalDice !== undefined;
        const isNudge     = payload.nudgedFrom   !== undefined;

        // In test mode, build a synthetic receipt for the roll log so tests can
        // assert on roll history without going through the full UI roll path.
        let extraState: Partial<typeof state> = {};
        if (isTestMode) {
          const rLines: RollReceiptLine[] = [
            { kind: 'roll', text: `${payload.rollResult.replace(/_/g, ' ')} [${payload.dice[0]}+${payload.dice[1]}=${payload.diceTotal}]` },
          ];
          if (payload.bankrollDelta > 0) rLines.push({ kind: 'win',  text: `+$${(payload.bankrollDelta  / 100).toFixed(2)}` });
          else if (payload.bankrollDelta < 0) rLines.push({ kind: 'loss', text: `-$${(Math.abs(payload.bankrollDelta) / 100).toFixed(2)}` });
          const receipt: RollReceipt = { timestamp: new Date().toISOString(), netDelta: payload.bankrollDelta, lines: rLines };
          extraState = { rollHistory: [receipt, ...state.rollHistory].slice(0, 50) };
        }

        return {
          lastDice:          isLeftySave ? payload.originalDice!
                             : isNudge   ? payload.nudgedFrom!
                             : payload.dice,
          lastRollResult:    payload.rollResult,
          lastCrapsOutBlocked: payload.crapsOutBlocked === true,
          lastClockExpired:    payload.clockExpired === true,
          dreadDice:         isLeftySave ? payload.originalDice! : null,
          nudgeDice:         isNudge     ? payload.nudgedFrom!   : null,
          pendingSettlement: payload,
          ...extraState,
        };
      });
      // In test mode there is no dice animation — apply the settlement after one
      // tick (0 ms) so the set() above has flushed. Scheduling a timer for EVERY
      // event is intentional: if a later event replaced pendingSettlement before
      // an earlier timer fired, the timer applies the newer payload. Duplicate
      // fires after pendingSettlement is cleared are no-ops.
      if (import.meta.env['VITE_TEST_MODE'] === 'true') {
        setTimeout(() => get().applyPendingSettlement(), 0);
      }
    });

    // ── unlocks:granted ───────────────────────────────────────────────────
    //
    // Emitted by the server (lib/unlocks.ts) after a roll grants one or more
    // new crew unlocks. Updates unlockedCrewIds in-place and surfaces a
    // toast notification so the player sees what they just earned.
    // Also invalidates crewRoster so the next pub visit re-fetches fresh data.
    socket.on('unlocks:granted', (payload: { newUnlockIds: number[]; crewNames: string[] }) => {
      set((state) => {
        // If settlement already completed before this event arrived (async DB writes
        // in evaluateUnlocks delay emission), set unlockModalReady proactively so the
        // modal fires now instead of waiting for the next roll's applyPendingSettlement.
        const settlementComplete = !state.isRolling && state.pendingSettlement === null;
        return {
          unlockedCrewIds:       [...new Set([...state.unlockedCrewIds,       ...payload.newUnlockIds])],
          unacknowledgedUnlocks: [...new Set([...state.unacknowledgedUnlocks, ...payload.newUnlockIds])],
          crewUnlockedThisRun:   [...new Set([...state.crewUnlockedThisRun,   ...payload.newUnlockIds])],
          crewRoster:            null,
          unlockModalReady:      settlementComplete || state.unlockModalReady,
        };
      });
      // Pre-fetch roster so the cinematic modal has crew data ready.
      void get().fetchCrewRoster();
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
    get().snapshotForFeedback();
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
      isDevRun:            false,
      devDiceQueue:        [],
      devPreview:          null,
      bossProgressCents:   0,
      escrowHeldCents:     0,
      lastEscrow:          null,
      lastTide:            null,
      lastOrbit:           null,
      signalDarkRolls:     0,
      lastSignal:          null,
      convergenceRooms:    [],
      convergenceState:    null,
      lastConvergence:     null,
      convergenceThemeRoom: null,
      lastBossCut:         null,
      payoffAt:            null,
      bossBark:            null,
      bossBarkLastLine:    null,
      pendingDefeat:       null,
      pendingVictory:      null,
      celebrationHoldUntil: null,
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
      lastCrapsOutBlocked: false,
      lastClockExpired: false,
      lastDelta:           null,
      dreadDice:           null,
      nudgeDice:           null,
      _nudgeKey:           0,
      lastBetDelta:        null,
      _betDeltaKey:        0,
      isRolling:           false,
      isAutoCollecting:    false,
      pendingSettlement:   null,
      flashType:           null,
      _flashKey:           0,
      hypeFlash:           null,
      _hypeFlashKey:       0,
      lastHypeSource:      null,
      _hypeKey:            0,
      _charmKey:             0,
      charmedCrewSlot:       null,
      pendingBossEntryCharm: null,
      charmingSlot:          null,
      charmFlight:           null,
      freedCharmSlot:        null,
      payoutPops:            null,
      _popsKey:              0,
      _reRollKey:            0,
      pendingCascadeQueue:       [],
      cascadeQueue:              [],
      pendingTransition:         false,
      chipRainDone:              false,
      celebrationSnapshot:       null,
      activeTransition:          null,
      transitionPhaseIndex:      0,
      bossEntryShownForMarker:   null,
      markerIntroShownForMarker: null,
      floorRevealShownForFloor:  null,
      victoryShown:              false,
      victoryComplete:           false,
      gameOverTransitionShown:   false,
      rollHistory:               [],
      socketStatus:              'disconnected',
      unacknowledgedUnlocks:     [],
      crewUnlockedThisRun:       [],
      pubDraft:                  [],
      unlockModalReady:          false,
      executiveRating:           null,
      exceptionalBonus:          null,
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
    let shouldAutoCollect = false;
    set((state) => {
      const current = getBetField(state.bets, field);
      const floor   = getBetField(state.committedBets, field);
      const pending = current - floor;
      if (pending <= 0) return state; // nothing to undo above the committed floor
      const newBankroll  = state.bankroll + pending;
      const markerTarget = MARKER_TARGETS[state.currentMarkerIndex];
      // FB-032: payoff markers never auto-collect on bankroll.
      if (!state.isRolling && markerTarget !== undefined && newBankroll >= markerTarget && getBossPayoffCents(state.currentMarkerIndex) === null) {
        shouldAutoCollect = true;
      }
      return {
        bankroll: newBankroll,
        bets:     withBetField(state.bets, field, floor),
      };
    });
    if (shouldAutoCollect) {
      void get().autoCollect();
    }
  },

  async autoCollect() {
    const { runId, bets, isRolling, isAutoCollecting } = get();
    if (isRolling || isAutoCollecting || !runId) return;

    set({ isAutoCollecting: true }); // lock UI, but NO _rollKey increment — no dice animation
    try {
      const token = await get().getToken?.();
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/roll`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ bets }),
      });

      if (!res.ok) {
        set({ isAutoCollecting: false });
        return;
      }

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
          highestMarkerReached?: number;
        };
        roll: {
          autoClear:       boolean;
          dice:            [number, number];
          diceTotal:       number;
          rollResult:      RollResult;
          bankrollDelta:   number;
          resolvedBets:    Bets;
          payoutBreakdown: { passLine: number; odds: number; hardways: number };
          mechanicFreeze:  null;
        };
      };

      if (!data.roll.autoClear) {
        // Server didn't auto-clear — state mismatch. Reset and let the player roll normally.
        console.warn('[autoCollect] Server did not confirm auto-clear; resetting.');
        set({ isAutoCollecting: false });
        return;
      }

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
        highestMarkerReached:    data.run.highestMarkerReached ?? 0,
      };
      set({ pendingSettlement: settlement });
      get().applyPendingSettlement();
    } catch (err) {
      console.error('[autoCollect] error:', err);
      set({ isAutoCollecting: false });
    }
  },

  setRolling(rolling) {
    set({ isRolling: rolling });
  },

  clearCharmingSlot() {
    // Called by TableBoard's CrewPortrait onAnimationEnd for the charming slot.
    // Moves charmingSlot → charmedCrewSlot so the ❤️ icon settles on the crew member
    // AFTER the bark animation completes (not during).
    const { charmingSlot, charmedCrewSlot, charmFlight } = get();
    set({
      charmedCrewSlot: charmingSlot,
      charmingSlot:    null,
      ...(charmingSlot !== null && charmingSlot !== charmedCrewSlot && {
        charmFlight: { from: charmedCrewSlot, to: charmingSlot, key: (charmFlight?.key ?? 0) + 1 },
      }),
    });
  },

  finishCharmFlight() {
    set({ charmFlight: null });
  },

  setConvergenceThemeRoom(room) {
    set({ convergenceThemeRoom: room });
  },

  sinkCharmFlight() {
    const { charmFlight } = get();
    if (charmFlight && charmFlight.stage !== 'sink') set({ charmFlight: { ...charmFlight, stage: 'sink' } });
  },

  dequeueEvent() {
    set((state) => ({ cascadeQueue: state.cascadeQueue.slice(1) }));
    const { cascadeQueue, chipRainDone, pendingTransition } = get();
    if (cascadeQueue.length === 0 && chipRainDone && pendingTransition) {
      setTimeout(() => {
        if (!get().pendingTransition) return;
        const { celebrationSnapshot: snap } = get();
        set({ pendingTransition: false, activeTransition: snap?.isBossVictory ? 'BOSS_VICTORY' : 'MARKER_CLEAR', transitionPhaseIndex: 0 });
      }, celebrationDelay(1000, get().celebrationHoldUntil));
    }
  },

  applyPendingSettlement() {
    const {
      pendingSettlement: p,
      _flashKey,
      _hypeFlashKey,
      _hypeKey,
      _charmKey,
      _popsKey,
      pendingCascadeQueue,
      status: currentStatus,
      unacknowledgedUnlocks,
      isAutoCollecting,
      charmedCrewSlot:  oldCharmedSlot,
      charmingSlot:     oldCharmingSlot,
      charmFlight:      oldCharmFlight,
      executiveRating:  oldExecutiveRating,
      exceptionalBonus: oldExceptionalBonus,
    } = get();
    if (!p) return;

    // ── Dread phase (Lefty McGuffin save) ─────────────────────────────────────
    // On first call after a Lefty save: dice are showing the original 7.
    // Flush the cascade so Lefty's portrait fires, hold for 1500ms so the
    // player experiences dread, then signal DiceZone to throw the dice again.
    // The second throw lands on the saved result; onLandEnd calls
    // applyPendingSettlement() as normal to complete settlement.
    if (p.originalDice !== undefined && get().dreadDice !== null) {
      // Partition: only Lefty's own events animate now; Prof (and any other crew)
      // stay buffered so they don't fire prematurely during the dread window.
      const leftyEvents     = pendingCascadeQueue.filter((e) => e.crewId === 1);
      const remainingEvents = pendingCascadeQueue.filter((e) => e.crewId !== 1);
      set({
        cascadeQueue:        leftyEvents,
        pendingCascadeQueue: remainingEvents,
        // isRolling intentionally stays true — prevents re-roll during dread window
      });
      setTimeout(() => {
        const cur = get().pendingSettlement;
        if (!cur) return; // guard: run was reset (NEW RUN) during the dread window
        set((s) => ({
          // Land on pre-nudge dice when the Prof also fired; otherwise final dice.
          lastDice:       cur.nudgedFrom !== undefined ? cur.nudgedFrom : cur.dice,
          lastRollResult: cur.rollResult,
          lastCrapsOutBlocked: cur.crapsOutBlocked === true,
          lastClockExpired:    cur.clockExpired === true,
          dreadDice:      null,
          // Increment to tell DiceZone to start a full re-throw animation.
          // applyPendingSettlement() will be called by onLandEnd after that throw.
          _reRollKey:     s._reRollKey + 1,
        }));
      }, 1500);
      return;
    }

    // ── Professor phase (Physics Professor nudge) ─────────────────────────────
    // On first call: dice have landed on pre-nudge values (nudgeDice is set).
    // Flush the cascade so the Professor's portrait fires. Hold for 1000ms so
    // the player sees the portrait animation, then flip the dice to their final
    // values (incrementing _nudgeKey triggers the CSS flip animation in DiceZone)
    // and call applyPendingSettlement() again for normal settlement.
    if (p.nudgedFrom !== undefined && get().nudgeDice !== null) {
      set({
        cascadeQueue:        pendingCascadeQueue,
        pendingCascadeQueue: [],
        // isRolling stays true — prevents re-roll during portrait window
      });
      setTimeout(() => {
        const cur = get().pendingSettlement;
        if (!cur) return; // guard: run was reset during the professor window
        set((s) => ({
          lastDice:  cur.dice,
          nudgeDice: null,
          _nudgeKey: s._nudgeKey + 1,
        }));
        get().applyPendingSettlement();
      }, 1000);
      return;
    }

    // ── Charm slot update (Mme. Le Prix — DISABLE_CREW boss) ─────────────────
    // TRANSITION / GAME_OVER takes highest priority — the boss fight has ended.
    // The charm must be cleared (both charmedCrewSlot and charmingSlot) even
    // when charmedCrewSlot is still in the payload (the winning roll is ON the
    // boss marker so the server always sends it; without this guard the ❤️
    // would persist through the pub screen and into the next marker).
    //
    // When a mid-fight come-out resolves: instead of immediately updating
    // charmedCrewSlot, we start the charm bark animation by setting charmingSlot.
    // clearCharmingSlot() fires when the portrait animation ends, moving
    // charmingSlot → charmedCrewSlot so the ❤️ settles AFTER the bark.
    // This also fires on re-charm (same slot selected again) — the bark plays
    // every time, even when the slot index hasn't changed.
    //
    // charmedCrewSlot is NOT updated here when charmFired — it stays as the
    // old value until clearCharmingSlot() is called. During the point phase
    // (no charmedCrewSlot in payload) both values are preserved unchanged.
    const isEndingBossFight = p.runStatus === 'TRANSITION' || p.runStatus === 'GAME_OVER';
    // charmFired: server tells us the charmed crew's ability would have triggered
    // this roll. Only when true do we play the bark animation.
    const charmFired = !isEndingBossFight && p.charmFired === true;

    // charmedCrewSlot (the ❤️ position):
    //   - Boss fight ending → clear immediately.
    //   - Charm bark playing (charmFired) → keep old slot; clearCharmingSlot()
    //     will move it after the animation ends.
    //   - Slot changed silently (come-out resolved, no ability suppressed) →
    //     move ❤️ directly with no animation.
    //   - No charm update this roll (POINT_SET / NO_RESOLUTION) → preserve.
    const newCharmedSlot: number | null = isEndingBossFight
      ? null
      : charmFired
        ? oldCharmedSlot
        : p.charmedCrewSlot !== undefined
          ? p.charmedCrewSlot
          : oldCharmedSlot;

    // charmingSlot: set to the new target slot when charm fires this roll;
    // cleared on boss-fight end; preserved if no charm event this roll.
    const newCharmingSlot: number | null =
      isEndingBossFight ? null
      : charmFired      ? p.charmedCrewSlot!
      : oldCharmingSlot;

    // FB-034: the heart flies when it settles on a new slot without a bark
    // (charmFired settles via clearCharmingSlot after the heartbeat).
    const newCharmFlight = isEndingBossFight
      ? null
      : !charmFired && newCharmedSlot !== null && newCharmedSlot !== oldCharmedSlot
        ? { from: oldCharmedSlot, to: newCharmedSlot, key: (oldCharmFlight?.key ?? 0) + 1 }
        : oldCharmFlight;

    // FB-040: a Seven-Out that builds Le Prix's room in The Architect's fight —
    // her first charm comes from the room's counter; the heart flies to it.
    const prixRoomAdded = !isEndingBossFight && p.convergence?.added != null
      && GAUNTLET[p.convergence.added]?.boss?.rule === 'DISABLE_CREW';
    const roomCharmSlot   = prixRoomAdded && p.convergence ? p.convergence.state.charm : null;
    const roomCharmFlight = roomCharmSlot !== null
      ? { from: null, to: roomCharmSlot, key: (oldCharmFlight?.key ?? 0) + 1 }
      : null;

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

    // ── The Executive — rating, bark, and pip-termination ─────────────────────
    const newExecutiveRating: number | null = isEndingBossFight
      ? null
      : p.bossRating !== undefined
        ? p.bossRating.index
        : get().executiveRating;



    // The Architect removed a crew member on this seven-out — clear it from the rail.
    const currentCrewSlots = get().crewSlots;
    const newCrewSlots = p.removedCrewSlot !== undefined
      ? (currentCrewSlots.map((slot, i) => (i === p.removedCrewSlot ? null : slot)) as StoredCrewSlots)
      : currentCrewSlots;

    // ── FB-032: boss defeat cinematic — hold GAME_OVER while it plays ────────
    // A run-ending roll (not the final-marker victory) at a boss that defines a
    // defeatCinematic. Covers last-shooter and below-min-bet game overs alike.
    const defeatCinematic = isBossMarker(oldMarkerIndex) ? GAUNTLET[oldMarkerIndex]?.boss?.defeatCinematic : undefined;
    const isRunEndingLoss = p.runStatus === 'GAME_OVER' && p.newMarkerIndex < GAUNTLET.length;
    const defeatPayoff    = getBossPayoffCents(oldMarkerIndex);
    const pendingDefeat: PendingDefeat | null = isRunEndingLoss && defeatCinematic
      ? {
          key:             Date.now(),
          id:              defeatCinematic.id,
          line:            defeatCinematic.line,
          markerIndex:     oldMarkerIndex,
          balanceDueCents: defeatPayoff !== null ? Math.max(0, defeatPayoff - (p.bossCut?.total ?? 0)) : null,
          pipTermination:  p.pipTermination === true,
          preview:         false,
        }
      : null;
    if (pendingDefeat !== null) {
      // Safety net: never leave a finished run stuck behind a cinematic.
      const defeatKey = pendingDefeat.key;
      setTimeout(() => {
        if (get().pendingDefeat?.key === defeatKey) get().finishDefeatCinematic();
      }, 9000);
    }

    // ── FB-033: boss victory cinematic — the roll that clears a boss marker ──
    // Plays over the table during the celebration hold (celebrationHoldUntil);
    // the Foreman's PAID IN FULL claims the same hold from his register.
    // FB-040: the final marker's win (status GAME_OVER past the last marker)
    // plays its moment too — holding GAME_OVER until it finishes.
    const isFinalVictory = p.runStatus === 'GAME_OVER' && p.newMarkerIndex >= GAUNTLET.length;
    const victoryCinematic = (isTransition || isFinalVictory) && isBossMarker(oldMarkerIndex)
      ? GAUNTLET[oldMarkerIndex]?.boss?.victoryCinematic
      : undefined;
    const settleNow = Date.now();
    const pendingVictory: PendingVictory | null = victoryCinematic
      ? {
          key: settleNow, id: victoryCinematic.id, line: victoryCinematic.line, markerIndex: oldMarkerIndex, preview: false,
          ...(isFinalVictory && { heldFinal: { markerIndex: p.newMarkerIndex }, rooms: get().convergenceRooms }),
        }
      : null;
    const holdFinal = pendingVictory?.heldFinal !== undefined;
    if (holdFinal && pendingVictory !== null) {
      // Safety net: never leave the winning run stuck behind its cinematic.
      const victoryKey = pendingVictory.key;
      setTimeout(() => {
        if (get().pendingVictory?.key === victoryKey) get().finishVictoryCinematic();
      }, 12_000);
    }
    const celebrationHoldUntil =
      holdFinal                     ? null
      : pendingVictory !== null     ? settleNow + VICTORY_HOLD_MS_BY_ID[pendingVictory.id]
      : p.bossCut?.paidOff === true ? settleNow + PAYOFF_HOLD_MS
      : null;

    // ── FB-032: generic boss barks (lines in config.ts; rules in shared bossBarks.ts) ─
    const { bossBark: oldBossBark, bossBarkLastLine, bossProgressCents: cutBefore, escrowHeldCents: escrowBefore, lastEscrow: oldLastEscrow } = get();
    const bark = pickBossBark({
      markerIndex:   oldMarkerIndex,
      bankrollDelta: p.bankrollDelta,
      isLoss:        p.rollResult === 'CRAPS_OUT' || p.rollResult === 'SEVEN_OUT',
      isGameOver:    p.runStatus === 'GAME_OVER',
      // FB-033: roll facts for per-boss event barks (Sarge's clock).
      rollResult:       p.rollResult,
      newPhase:         p.newPhase,
      newBossPointHits: p.newBossPointHits,
      clockExpired:     p.clockExpired === true,
      // FB-034: Mme. Le Prix's charm (before / after this roll).
      charmFired:        p.charmFired === true,
      charmedSlotBefore: oldCharmedSlot,
      charmedSlotAfter:  p.charmedCrewSlot ?? null,
      // FB-035: the Executive's Performance Review (before / after) + bonus paid.
      ratingBefore:          oldExecutiveRating,
      ratingAfter:           p.bossRating?.index ?? null,
      exceptionalBonusCents: p.exceptionalBonusCents ?? 0,
      // FB-036: the Hierophant's offering bowl.
      escrowBeforeCents: escrowBefore,
      ...(p.escrow && { escrow: p.escrow }),
      // FB-037: the Sovereign's tide.
      ...(p.tide && { tide: p.tide }),
      // FB-038: the Commander's orbit.
      hypeBefore: oldHype,
      ...(p.orbit && { orbit: p.orbit }),
      // FB-039: the Emissary's signal.
      ...(p.signal && { signal: p.signal }),
      ...(p.bossCut && {
        cut: { before: cutBefore, after: p.bossCut.total, payoff: p.bossCut.payoff, paidOff: p.bossCut.paidOff },
      }),
      // FB-040: The Architect's rooms (his rebuild lines + the rooms' echoes).
      ...(p.convergence && { convergence: { rooms: p.convergence.rooms, added: p.convergence.added, state: p.convergence.state } }),
      barkShowing:   oldBossBark !== null,
      lastLine:      bossBarkLastLine,
    });
    const newBossBark = bark !== null
      ? { line: bark.line, key: (oldBossBark?.key ?? 0) + 1, ...(bark.speakerMarker !== undefined && { speakerMarker: bark.speakerMarker }) }
      : oldBossBark;
    if (bark !== null && newBossBark !== null) {
      // Safety clear in case the header never calls clearBossBark().
      const barkKey = newBossBark.key;
      setTimeout(() => {
        if (get().bossBark?.key === barkKey) set({ bossBark: null });
      }, bark.trigger === 'payoff' ? 3600 : 3000);
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
      // FB-032: a boss defeat with a cinematic also holds GAME_OVER until
      // finishDefeatCinematic() releases it (see pendingDefeat below).
      status:               isTransition || pendingDefeat !== null || holdFinal ? currentStatus : p.runStatus,
      pendingDefeat,
      pendingVictory,
      celebrationHoldUntil,
      pendingTransition:    isTransition,
      currentMarkerIndex:   holdFinal ? oldMarkerIndex : p.newMarkerIndex,
      celebrationSnapshot,
      lastDelta:            p.bankrollDelta,
      lastBetDelta:         null,
      isRolling:            false,
      isAutoCollecting:     false,
      pendingSettlement:    null,
      flashType,
      _flashKey:            flashType !== null ? _flashKey + 1 : _flashKey,
      hypeFlash:            flashTier,
      _hypeFlashKey:        flashTier !== null ? _hypeFlashKey + 1 : _hypeFlashKey,
      lastHypeSource:       hypeSource,
      _hypeKey:             hypeSource !== null ? _hypeKey + 1 : _hypeKey,
      charmedCrewSlot:       roomCharmSlot ?? newCharmedSlot,
      charmingSlot:          newCharmingSlot,
      charmFlight:           roomCharmFlight ?? newCharmFlight,
      freedCharmSlot:        isEndingBossFight ? oldCharmedSlot : null,
      _charmKey:             charmFired ? _charmKey + 1 : _charmKey,
      executiveRating:       newExecutiveRating,
      exceptionalBonus:      (p.exceptionalBonusCents ?? 0) > 0
        ? { cents: p.exceptionalBonusCents ?? 0, key: (oldExceptionalBonus?.key ?? 0) + 1 }
        : oldExceptionalBonus,
      crewSlots:             newCrewSlots,
      // FB-032: The Foreman's Cut. On the paying-off roll the register keeps the
      // final total (≥ Payoff) through the PAID IN FULL stamp.
      bossProgressCents:     p.bossCut ? p.bossCut.total : 0,
      escrowHeldCents:       p.escrow ? p.escrow.heldCents : 0,
      lastEscrow:            p.escrow ? { ...p.escrow, key: (oldLastEscrow?.key ?? 0) + 1 } : oldLastEscrow,
      _covenantKey:          p.covenantSaved === true ? get()._covenantKey + 1 : get()._covenantKey,
      lastTide:              p.tide ? { ...p.tide, key: (get().lastTide?.key ?? 0) + 1 } : get().lastTide,
      lastOrbit:             p.orbit ? { ...p.orbit, key: (get().lastOrbit?.key ?? 0) + 1 } : get().lastOrbit,
      signalDarkRolls:       p.signal ? p.signal.darkRolls : 0,
      lastSignal:            p.signal ? { ...p.signal, key: (get().lastSignal?.key ?? 0) + 1 } : get().lastSignal,
      // FB-040: The Architect's rooms (every roll in his fight; cleared once it ends).
      convergenceRooms:      p.convergence ? p.convergence.rooms : [],
      convergenceState:      p.convergence ? p.convergence.state : null,
      lastConvergence:       p.convergence ? { ...p.convergence, key: (get().lastConvergence?.key ?? 0) + 1 } : get().lastConvergence,
      // A newly built room is dressed by the rebuild animation; otherwise keep the current room.
      convergenceThemeRoom:  p.convergence
        ? (p.convergence.added !== null ? get().convergenceThemeRoom : (get().convergenceThemeRoom ?? p.convergence.rooms[p.convergence.rooms.length - 1] ?? null))
        : null,
      lastBossCut:           p.bossCut ?? null,
      _cutKey:               p.bossCut && p.bossCut.amount > 0 ? get()._cutKey + 1 : get()._cutKey,
      payoffAt:              p.bossCut?.paidOff === true ? Date.now() : get().payoffAt,
      bossBark:              newBossBark,
      bossBarkLastLine:      bark?.line ?? bossBarkLastLine,
      payoutPops,
      _popsKey:             hasPops ? _popsKey + 1 : _popsKey,
      // Flush buffered cascade events at the reveal moment — portrait
      // animations must not fire before the player has seen the dice result.
      cascadeQueue:         pendingCascadeQueue,
      pendingCascadeQueue:  [],
      // Track personal best optimistically so the GameOverScreen can show it
      // immediately without waiting for the next page load.
      maxBankrollCents:      Math.max(oldMaxBankrollCents, p.newBankroll),
      highestMarkerReached:  p.highestMarkerReached ?? 0,
      // Open the cinematic unlock modal only when the cascade queue will be
      // empty after this flush — prevents mid-animation interruptions.
      unlockModalReady:     unacknowledgedUnlocks.length > 0 && pendingCascadeQueue.length === 0,
    });

    if (isTransition) {
      set({ chipRainDone: false });

      if (isAutoCollecting) {
        // Player chose ADVANCE — skip all animations, cut immediately.
        setTimeout(() => {
          if (!get().pendingTransition) return;
          const { celebrationSnapshot: snap } = get();
          set({ pendingTransition: false, activeTransition: snap?.isBossVictory ? 'BOSS_VICTORY' : 'MARKER_CLEAR', transitionPhaseIndex: 0 });
        }, celebrationDelay(400, get().celebrationHoldUntil));
      } else if (!hasPops) {
        // No chip rain will fire. Treat chip rain as already done so that
        // dequeueEvent() can start the savor window when cascade empties.
        // If cascade is also empty right now, start the savor immediately.
        set({ chipRainDone: true });
        if (pendingCascadeQueue.length === 0) {
          setTimeout(() => {
            if (!get().pendingTransition) return;
            const { celebrationSnapshot: snap } = get();
            set({ pendingTransition: false, activeTransition: snap?.isBossVictory ? 'BOSS_VICTORY' : 'MARKER_CLEAR', transitionPhaseIndex: 0 });
          }, celebrationDelay(1000, get().celebrationHoldUntil));
        }
        // else: dequeueEvent() handles it when the last bark completes.
        // Safety net covers cascade_duration + 1500ms savor + buffer.
        setTimeout(() => {
          if (!get().pendingTransition) return;
          const { celebrationSnapshot: snap } = get();
          set({ pendingTransition: false, activeTransition: snap?.isBossVictory ? 'BOSS_VICTORY' : 'MARKER_CLEAR', transitionPhaseIndex: 0 });
        }, celebrationDelay(5000, (get().celebrationHoldUntil ?? 0) + 1000));
      } else {
        // hasPops=true: primary path is triggerChipRainComplete() + dequeueEvent()
        // coordinating via chipRainDone. Safety net covers worst case.
        setTimeout(() => {
          if (!get().pendingTransition) return;
          const { celebrationSnapshot: snap } = get();
          set({ pendingTransition: false, activeTransition: snap?.isBossVictory ? 'BOSS_VICTORY' : 'MARKER_CLEAR', transitionPhaseIndex: 0 });
        }, celebrationDelay(5000, (get().celebrationHoldUntil ?? 0) + 1000));
      }
    }
  },

  onDiceSettled() {
    set((s) => ({ _settleSeq: s._settleSeq + 1 }));
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
    // FB-028: a dev preview restores what it faked and skips every side effect.
    const preview = get().devPreview;
    if (preview) {
      set({ ...preview.snapshot, devPreview: null, activeTransition: null, transitionPhaseIndex: 0 });
      return;
    }

    if (type === 'MARKER_CLEAR' || type === 'BOSS_VICTORY') {
      // Celebration complete — hand off to the pub screen.
      // Now safe to expose the new marker state: celebrationSnapshot is cleared.
      // Clear payoutPops, flashType, and _flashKey so neither ChipRain nor
      // useCrowdAudio re-fire their stale events when TableBoard remounts after the pub.
      //
      // Re-arm unlockModalReady if unlocks were suppressed during a boss transition
      // (the server emits unlocks:granted async; the event often arrives while
      // BOSS_VICTORY is playing). The modal will fire in the pub instead.
      const hasUnacknowledged = get().unacknowledgedUnlocks.length > 0;
      set({
        status:               'TRANSITION',
        activeTransition:     null,
        transitionPhaseIndex: 0,
        celebrationSnapshot:  null,
        payoutPops:           null,
        flashType:            null,
        _flashKey:            0,
        // Safety: clear any stale in-flight roll state so a DiceZone remount
        // after the floor transition doesn't inherit a locked isRolling flag.
        isRolling:            false,
        isAutoCollecting:     false,
        pendingSettlement:    null,
        // Invalidate any pub draft carried over from the previous pub visit so
        // the next fetchPubDraft() always hits the server fresh and picks up
        // guaranteedPubDraftIds for newly unlocked crew.
        pubDraft:             [],
        unlockModalReady:     hasUnacknowledged,
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
      } else if (type === 'BOSS_ENTRY') {
        // Re-arm the unlock modal if it was suppressed during the dread sequence.
        const hasUnacknowledged  = get().unacknowledgedUnlocks.length > 0;
        const pendingCharm       = get().pendingBossEntryCharm;
        const prevFlightKey      = get().charmFlight?.key ?? 0;
        set({
          activeTransition:      null,
          transitionPhaseIndex:  0,
          unlockModalReady:      hasUnacknowledged,
          // FB-034: reveal the entry charm — the heart flies from her name to
          // the chosen crew member (CharmFlight) before the first roll.
          ...(pendingCharm !== null && {
            charmedCrewSlot:       pendingCharm,
            pendingBossEntryCharm: null,
            charmFlight:           { from: null, to: pendingCharm, key: prevFlightKey + 1 },
          }),
        });
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

  setGameOverTransitionShown() {
    set({ gameOverTransitionShown: true });
  },

  triggerChipRainComplete() {
    if (!get().pendingTransition) return;
    set({ chipRainDone: true });
    // Only start the savor window if crew barks have also finished.
    // If cascade is still running, dequeueEvent() will start it when done.
    const { cascadeQueue } = get();
    if (cascadeQueue.length === 0) {
      setTimeout(() => {
        if (!get().pendingTransition) return;
        const { celebrationSnapshot: snap } = get();
        set({ pendingTransition: false, activeTransition: snap?.isBossVictory ? 'BOSS_VICTORY' : 'MARKER_CLEAR', transitionPhaseIndex: 0 });
      }, celebrationDelay(1000, get().celebrationHoldUntil));
    }
  },

  async rollDice(cheatDice?: [number, number]) {
    const { runId, bets, isRolling, tutorialCheatDice, isDevRun, devDiceQueue } = get();
    if (isRolling || !runId) return false;

    // FB-028: on a dev run, the next queued dev roll (if any) is sent as
    // cheat_dice. The server only honours it for allowlisted devs on dev runs.
    const devDice = isDevRun ? devDiceQueue[0] : undefined;

    // If no explicit dice were passed but buffered tutorial dice are loaded,
    // consume them now and clear the buffer atomically with the isRolling flag.
    const effectiveDice: [number, number] | undefined =
      cheatDice ?? tutorialCheatDice ?? devDice;
    const consumedDevDice = cheatDice === undefined && tutorialCheatDice === null && devDice !== undefined;

    set((state) => ({
      isRolling: true,
      tutorialCheatDice: null,
      _rollKey: state._rollKey + 1,
      ...(consumedDevDice && { devDiceQueue: state.devDiceQueue.slice(1) }),
    }));
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
          highestMarkerReached?: number;
        };
        roll: {
          autoClear?:       boolean;
          dice:             [number, number];
          diceTotal:        number;
          rollResult:       RollResult;
          bankrollDelta:    number;
          receipt?:         RollReceipt;
          resolvedBets:    Bets;
          payoutBreakdown: { passLine: number; odds: number; hardways: number };
          mechanicFreeze:  { lockedValue: number; rollsRemaining: number } | null;
          originalDice?:   [number, number];
          nudgedFrom?:     [number, number];
          /** Enchanted crew slot index (DISABLE_CREW boss only — mid-fight updates). */
          charmedCrewSlot?: number;
          /** True when the charmed crew's ability would have fired this roll. Drives charm heartbeat. */
          charmFired?: boolean;
          bossRating?: { index: number; changed: boolean; direction: 'up' | 'down' | null };
          pipTermination?: boolean;
          exceptionalBonusCents?: number;
          escrow?: { heldCents: number; releasedCents: number; seizedCents: number };
          covenantSaved?: boolean;
          tide?: { stage: number; nextStage: number; undertowCents?: number; waveShooters?: number };
          orbit?: { bleed: number; hype: number };
          signal?: { landed: { additives: number; hype: number; multipliers: number[] }; sent: { additives: number; hype: number; multipliers: number[] }; dropped: boolean; darkRolls: number; wasDark: boolean };
          crapsOutBlocked?: boolean;
          clockExpired?: boolean;
          removedCrewSlot?: number;
          convergence?: ConvergenceFacts;
          bossCut?: BossCut;
        };
      };

      // FB-028: keep the raw response for the dev panel inspector.
      if (get().isDevRun) set({ devLastRoll: data });

      // ── Auto-clear: bankroll already met the marker target before this roll ─
      // The server skipped the full dice pipeline and advanced the run directly.
      // Build a synthetic settlement and apply it immediately; the dice animation
      // that started with _rollKey++ plays out harmlessly under the transition overlay.
      if (data.roll.autoClear) {
        const autoSettlement: TurnSettledPayload = {
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
          highestMarkerReached:    data.run.highestMarkerReached ?? 0,
          ...(data.roll.bossRating    !== undefined && { bossRating:    data.roll.bossRating    }),
          ...(data.roll.pipTermination === true     && { pipTermination: true as const           }),
          ...(data.roll.exceptionalBonusCents !== undefined && { exceptionalBonusCents: data.roll.exceptionalBonusCents }),
          ...(data.roll.escrow !== undefined && { escrow: data.roll.escrow }),
          ...(data.roll.covenantSaved === true && { covenantSaved: true }),
          ...(data.roll.tide !== undefined && { tide: data.roll.tide }),
          ...(data.roll.orbit !== undefined && { orbit: data.roll.orbit }),
          ...(data.roll.signal !== undefined && { signal: data.roll.signal }),
          ...(data.roll.convergence !== undefined && { convergence: data.roll.convergence }),
        };
        set({ pendingSettlement: autoSettlement });
        get().applyPendingSettlement();
        return true;
      }

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
        highestMarkerReached:    data.run.highestMarkerReached ?? 0,
        ...(data.roll.originalDice    !== undefined && { originalDice:    data.roll.originalDice    }),
        ...(data.roll.nudgedFrom      !== undefined && { nudgedFrom:      data.roll.nudgedFrom      }),
        ...(data.roll.charmedCrewSlot !== undefined && { charmedCrewSlot: data.roll.charmedCrewSlot }),
        ...(data.roll.charmFired      === true      && { charmFired:      true                      }),
        ...(data.roll.bossRating      !== undefined && { bossRating:      data.roll.bossRating      }),
        ...(data.roll.pipTermination  === true      && { pipTermination:  true as const              }),
        ...(data.roll.exceptionalBonusCents !== undefined && { exceptionalBonusCents: data.roll.exceptionalBonusCents }),
        ...(data.roll.escrow !== undefined && { escrow: data.roll.escrow }),
        ...(data.roll.covenantSaved === true && { covenantSaved: true }),
        ...(data.roll.tide !== undefined && { tide: data.roll.tide }),
        ...(data.roll.orbit !== undefined && { orbit: data.roll.orbit }),
        ...(data.roll.signal !== undefined && { signal: data.roll.signal }),
        ...(data.roll.convergence !== undefined && { convergence: data.roll.convergence }),
        ...(data.roll.crapsOutBlocked === true      && { crapsOutBlocked: true as const              }),
        ...(data.roll.clockExpired    === true      && { clockExpired:    true as const              }),
        ...(data.roll.removedCrewSlot !== undefined && { removedCrewSlot: data.roll.removedCrewSlot  }),
        ...(data.roll.bossCut         !== undefined && { bossCut:         data.roll.bossCut          }),
      };

      const isLeftySave = settlement.originalDice !== undefined;
      const isNudge     = settlement.nudgedFrom   !== undefined;
      set((state) => ({
        // Lefty save: land on original 7. Physics Prof nudge: land on pre-nudge dice.
        // Both use a two-phase reveal so the player sees the intercepted values first.
        lastDice:          isLeftySave ? settlement.originalDice!
                           : isNudge   ? settlement.nudgedFrom!
                           : settlement.dice,
        lastRollResult:    settlement.rollResult,
        lastCrapsOutBlocked: settlement.crapsOutBlocked === true,
        lastClockExpired:    settlement.clockExpired === true,
        dreadDice:         isLeftySave ? settlement.originalDice! : null,
        nudgeDice:         isNudge     ? settlement.nudgedFrom!   : null,
        pendingSettlement: settlement,
        mechanicFreeze:    data.roll.mechanicFreeze ?? null,
        ...(data.roll.receipt && {
          rollHistory: [
            {
              ...data.roll.receipt,
              ...(data.roll.originalDice !== undefined && { originalDice: data.roll.originalDice }),
              ...(data.roll.nudgedFrom   !== undefined && { nudgedFrom:   data.roll.nudgedFrom   }),
            },
            ...state.rollHistory,
          ].slice(0, 50),
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
      bankroll:            number;
      shooters:            number;
      hype:                number;
      phase:               GamePhase;
      status:              RunStatus;
      point:               number | null;
      crewSlots:           StoredCrewSlots;
      bossPointHits:       number;
      unlockedSlots?:      3 | 4 | 5;
      /**
       * Present only when entering the Mme. Le Prix (DISABLE_CREW) boss fight.
       * The client stashes this in pendingBossEntryCharm; clearTransition('BOSS_ENTRY')
       * reveals the ❤️ and flies the heart (CharmFlight) after the boss-intro cinematic.
       */
      bossEntryCharmSlot?: number;
      /** FB-040: entering The Architect — his first room. */
      convergence?:        ConvergenceFacts;
    };

    const newUnlockedSlots = data.unlockedSlots ?? get().unlockedSlots;
    set((state) => ({
      bankroll:      data.bankroll,
      shooters:      data.shooters,
      hype:          data.hype,
      phase:         data.phase,
      status:        data.status,
      point:         data.point,
      crewSlots:     data.crewSlots,
      bossPointHits: data.bossPointHits,
      unlockedSlots: newUnlockedSlots,
      // Rebuild slotIds if unlockedSlots changed (slot unlock comp received)
      slotIds: newUnlockedSlots !== state.unlockedSlots
        ? buildSlotIds(newUnlockedSlots)
        : state.slotIds,
      // Clear last-roll display so the table starts fresh
      lastDice:       null,
      lastRollResult: null,
      lastCrapsOutBlocked: false,
      lastClockExpired: false,
      lastDelta:      null,
      cascadeQueue:   [],
      // Pub is always outside any boss fight — clear any lingering charm state.
      // Backstop for charmedCrewSlot (applyPendingSettlement TRANSITION branch
      // handles the normal case) and charmingSlot (in case animation was mid-flight).
      charmedCrewSlot: null,
      charmingSlot:    null,
      charmFlight:     null,
      // FB-035: entering The Executive's fight — show his starting rating
      // (Strong) on the performance meter before the first roll.
      executiveRating: GAUNTLET[state.currentMarkerIndex]?.boss?.rule === 'CROSS_CALIBRATION'
        ? data.bossPointHits
        : data.convergence && isRoomRuleOn(data.convergence.rooms, 'CROSS_CALIBRATION')
          ? data.convergence.state.rating
          : null,
      // FB-040: The Architect's first room. (Le Prix's room charms after the entry cinematic, as in her fight.)
      convergenceRooms: data.convergence?.rooms ?? [],
      convergenceState: data.convergence?.state ?? null,
      convergenceThemeRoom: null,   // the first room is built after his entry cinematic
      ...(data.convergence && isRoomRuleOn(data.convergence.rooms, 'DISABLE_CREW') && {
        pendingBossEntryCharm: data.convergence.state.charm,
      }),
      // Stash the entry charm for Mme. Le Prix — clearTransition('BOSS_ENTRY') will
      // reveal it (set charmedCrewSlot + fire sting) once the boss-intro cinematic ends.
      ...(data.bossEntryCharmSlot !== undefined && {
        pendingBossEntryCharm: data.bossEntryCharmSlot,
      }),
    }));

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

  async acknowledgeUnlock(crewId) {
    // Optimistically remove from the queue and close the modal immediately.
    set((state) => ({
      unacknowledgedUnlocks: state.unacknowledgedUnlocks.filter((id) => id !== crewId),
      unlockModalReady:      false,
    }));
    // If more unlocks are queued, re-open the modal after a brief pause so
    // each crew gets its own drop-in + shake moment.
    setTimeout(() => {
      if (get().unacknowledgedUnlocks.length > 0) {
        set({ unlockModalReady: true });
      }
    }, 350);
    try {
      const token = await get().getToken?.();
      await fetch(`${API_BASE}/api/v1/user/acknowledge-unlock`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ crewId }),
      });
    } catch {
      // Non-fatal — server will re-deliver on next session load.
    }
  },

  async fetchPubDraft() {
    const { runId, pubDraft } = get();
    if (!runId || pubDraft.length > 0) return;
    try {
      const token = await get().getToken?.();
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/pub-draft`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { draft: PubDraftEntry[] };
      set({ pubDraft: data.draft });
    } catch {
      // Non-fatal — PubScreen handles empty draft gracefully.
    }
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

  setIsDev(isDev) {
    set({ isDev });
  },

  pushDevDice(dice) {
    set((state) => ({ devDiceQueue: [...state.devDiceQueue, dice] }));
  },

  removeDevDice(index) {
    set((state) => ({ devDiceQueue: state.devDiceQueue.filter((_, i) => i !== index) }));
  },

  clearDevDice() {
    set({ devDiceQueue: [] });
  },

  previewTransition(type, opts) {
    const s = get();
    if (s.activeTransition !== null || s.pendingTransition || s.isRolling || s.isAutoCollecting || s.devPreview) return;

    const markerIndex = Math.min(Math.max(0, opts.markerIndex), GAUNTLET.length - 1);
    const target      = MARKER_TARGETS[markerIndex] ?? 0;

    const snapshot: Partial<GameState> = {
      currentMarkerIndex:  s.currentMarkerIndex,
      celebrationSnapshot: s.celebrationSnapshot,
      crewUnlockedThisRun: s.crewUnlockedThisRun,
    };

    const fakeCelebration: CelebrationSnapshot = {
      markerIndex,
      targetCents:    target,
      floorId:        GAUNTLET[markerIndex]?.floor ?? 1,
      bankrollBefore: Math.round(target * 0.9),
      bankrollAfter:  Math.round(target * 1.15),
      isBossVictory:  isBossMarker(markerIndex),
    };

    set({
      devPreview:           { snapshot },
      currentMarkerIndex:   markerIndex,
      celebrationSnapshot:  fakeCelebration,
      crewUnlockedThisRun:  opts.unlockCrewIds ?? [],
      activeTransition:     type,
      transitionPhaseIndex: 0,
    });
  },

  previewPinkSlip() {
    // The Executive's marker, PIP variant of TERMINATED.
    const exec = GAUNTLET.findIndex((m) => m.boss?.rule === 'CROSS_CALIBRATION');
    get().previewDefeatCinematic(exec);
    const pending = get().pendingDefeat;
    if (pending?.preview === true && pending.markerIndex === exec) set({ pendingDefeat: { ...pending, pipTermination: true } });
  },

  applyDevUnlockChange({ granted, revoked, queueCinematic }) {
    const drop = (ids: number[]) => ids.filter((id) => !revoked.includes(id));
    set((state) => {
      const queued = queueCinematic ? granted : [];
      const settlementComplete = !state.isRolling && state.pendingSettlement === null;
      return {
        unlockedCrewIds:       drop([...new Set([...state.unlockedCrewIds, ...granted])]),
        unacknowledgedUnlocks: drop([...new Set([...state.unacknowledgedUnlocks, ...queued])]),
        crewUnlockedThisRun:   drop([...new Set([...state.crewUnlockedThisRun, ...queued])]),
        crewRoster:            null,
        unlockModalReady:      queued.length > 0 ? (settlementComplete || state.unlockModalReady) : state.unlockModalReady,
      };
    });
    void get().fetchCrewRoster();
  },

  applyDevRunPayload(payload, { reconnect }) {
    const { runId } = get();
    if (!runId) return;

    const runState: Partial<GameState> = {
      bankroll:             payload.bankroll,
      shooters:             payload.shooters,
      hype:                 payload.hype,
      phase:                payload.phase,
      status:               payload.status,
      point:                payload.point,
      crewSlots:            payload.crewSlots,
      currentMarkerIndex:   payload.currentMarkerIndex,
      bets:                 payload.bets,
      unlockedSlots:        payload.unlockedSlots,
      bossPointHits:        payload.bossPointHits,
      consecutivePointHits: payload.consecutivePointHits,
      bossProgressCents:    payload.bossProgressCents ?? 0,
      escrowHeldCents:      payload.pendingAdditiveCents ?? 0,
      signalDarkRolls:      payload.signalDarkRolls ?? 0,
      convergenceRooms:     payload.convergenceRooms ?? [],
      convergenceState:     payload.convergenceState ?? null,
      isDevRun:             payload.isDevRun,
    };

    if (reconnect) {
      get().connectToRun(runId, {
        ...runState,
        maxBankrollCents:      payload.maxBankrollCents,
        highestMarkerReached:  payload.highestMarkerReached,
        unacknowledgedUnlocks: payload.unacknowledgedUnlocks.map((u) => u.id),
      });
      set({ devLastRunPayload: payload });
      return;
    }

    // In-place merge. Boss displays update immediately (no entry cinematic
    // pending), so Le Prix's charm goes straight to charmedCrewSlot.
    const display = bossDisplayFromCounter(runState);
    set({
      ...runState,
      committedBets:   payload.bets,
      slotIds:         buildSlotIds(payload.unlockedSlots),
      ...('executiveRating' in display && { executiveRating: display.executiveRating }),
      ...('pendingBossEntryCharm' in display && { charmedCrewSlot: display.pendingBossEntryCharm ?? null }),
      devLastRunPayload: payload,
    });
  },

  markCompsAnimated(count) {
    set({ seenCompCount: count });
  },

  snapshotForFeedback() {
    const { runId, currentMarkerIndex, bankroll, hype, crewSlots, rollHistory, isDevRun } = get();
    set({
      feedbackContextSnapshot: {
        runId,
        isDevRun,
        currentMarkerIndex,
        bankroll,
        hype,
        crewSlots,
        rollHistory: rollHistory.slice(0, 10),
        capturedAt:  new Date().toISOString(),
      },
    });
  },

  clearFeedbackSnapshot() {
    set({ feedbackContextSnapshot: null });
  },

  finishVictoryCinematic() {
    const pending = get().pendingVictory;
    if (!pending) return;
    // FB-040: the final win releases GAME_OVER (and the marker) — the victory sequence takes over.
    set(pending.heldFinal && !pending.preview
      ? { pendingVictory: null, status: 'GAME_OVER', currentMarkerIndex: pending.heldFinal.markerIndex }
      : { pendingVictory: null });
  },

  previewVictoryCinematic(markerIndex) {
    const s = get();
    if (s.pendingVictory || s.pendingDefeat || s.activeTransition !== null || s.isRolling) return;
    const cinematic = GAUNTLET[markerIndex]?.boss?.victoryCinematic;
    if (!cinematic) return;
    set({ pendingVictory: { key: Date.now(), id: cinematic.id, line: cinematic.line, markerIndex, preview: true } });
  },

  finishDefeatCinematic() {
    const pending = get().pendingDefeat;
    if (!pending) return;
    // A preview never touches the run; a real defeat now releases GAME_OVER.
    set(pending.preview ? { pendingDefeat: null } : { pendingDefeat: null, status: 'GAME_OVER' });
  },

  previewDefeatCinematic(markerIndex) {
    const s = get();
    if (s.pendingDefeat || s.activeTransition !== null || s.isRolling) return;
    const cinematic = GAUNTLET[markerIndex]?.boss?.defeatCinematic;
    if (!cinematic) return;
    const payoff = getBossPayoffCents(markerIndex);
    set({
      pendingDefeat: {
        key:             Date.now(),
        id:              cinematic.id,
        line:            cinematic.line,
        markerIndex,
        balanceDueCents: payoff !== null ? Math.max(100, payoff - s.bossProgressCents) : null,
        pipTermination:  false,
        preview:         true,
      },
    });
  },

  clearBossBark() {
    set({ bossBark: null });
  },



  async reorderCrew(oldIndex, newIndex) {
    const { runId, crewSlots, slotIds, unlockedSlots } = get();
    if (!runId) return;

    const newSlots   = arrayMove(crewSlots, oldIndex, newIndex) as StoredCrewSlots;
    const newSlotIds = arrayMove(slotIds,   oldIndex, newIndex);

    const previousSlots   = crewSlots;
    const previousSlotIds = slotIds;

    // Optimistic update — UI reflects the new order immediately.
    set({ crewSlots: newSlots, slotIds: newSlotIds });

    // Derive the permutation the server expects: slotOrder[newPosition] = oldPosition.
    // Length matches unlockedSlots (3, 4, or 5) — not always 5.
    // Computed mathematically from arrayMove semantics to avoid reference-equality
    // bugs with null slots (null === null returns the wrong index for every empty slot).
    const slotOrder = Array.from({ length: unlockedSlots }, (_, newPos): number => {
      if (newPos === newIndex) return oldIndex;
      if (oldIndex < newIndex && newPos >= oldIndex && newPos < newIndex) return newPos + 1;
      if (oldIndex > newIndex && newPos > newIndex && newPos <= oldIndex) return newPos - 1;
      return newPos;
    });

    try {
      const token = await get().getToken?.();
      const res = await fetch(`${API_BASE}/api/v1/runs/${runId}/crew/reorder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ slotOrder }),
      });

      if (!res.ok) throw new Error(`Reorder failed: ${res.status}`);

      // Sync crewSlots from the authoritative server response.
      // slotIds remain as already set — the server does not track them.
      const data = (await res.json()) as { crewSlots: StoredCrewSlots };
      set({ crewSlots: data.crewSlots });

    } catch {
      // Rollback both arrays so the UI stays consistent with server state.
      set({ crewSlots: previousSlots, slotIds: previousSlotIds });
    }
  },
}));

// ---------------------------------------------------------------------------
// Selectors (memoised via shallow comparison in components)
// ---------------------------------------------------------------------------

/**
 * True while any cascade event is pending animation OR while the Mme. Le Prix
 * charm bark animation is playing (charmingSlot !== null). Both states lock
 * the Roll button and the crew rail DnD sensors.
 */
export const selectIsCascading = (s: GameState) =>
  s.cascadeQueue.length > 0 || s.charmingSlot !== null;

/** The slot index that should currently be animating (head of queue), or -1. */
export const selectActiveSlot = (s: GameState): number =>
  s.cascadeQueue[0]?.slotIndex ?? -1;

/** The bark text for the currently-animating crew member, or null. */
export const selectActiveBark = (s: GameState): { seq: number; crewName: string; barkCrewId?: number } | null => {
  const head = s.cascadeQueue[0];
  return head ? { seq: head.seq, crewName: head.crewName, barkCrewId: head.barkCrewId } : null;
};

/** Formatted bankroll string: "$3,000,000" */
export const selectBankrollDisplay = (s: GameState): string =>
  `$${Math.round(s.bankroll / 100).toLocaleString('en-US')}`;

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
