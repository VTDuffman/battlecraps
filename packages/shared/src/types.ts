// =============================================================================
// BATTLECRAPS — SHARED TYPES
// packages/shared/src/types.ts
//
// This file is the single source of truth for all game-engine data structures.
// It is consumed by both apps/api and apps/web, ensuring type-safety across
// the entire stack. Any change here is a contract change.
// =============================================================================

// ---------------------------------------------------------------------------
// ENUMS & DISCRIMINATED UNION LITERALS
// ---------------------------------------------------------------------------

/**
 * The two phases within a single shooter's life.
 *
 * COME_OUT  → No point is established yet. Player is rolling to either set a
 *             point or get a Natural/Craps resolution.
 * POINT_ACTIVE → A point has been set. Player is trying to hit it before a 7.
 */
export type GamePhase = 'COME_OUT' | 'POINT_ACTIVE';

/**
 * The top-level status of a Run. Maps directly to the state machine in the PRD.
 * The server validates that every API action is legal for the current status.
 */
export type RunStatus =
  | 'IDLE_TABLE'    // Waiting for the player to place a Pass Line bet & come-out roll
  | 'POINT_ACTIVE'  // Point is set; Odds and Hardway bets are now available
  | 'RESOLUTION'    // A roll has occurred; cascade is executing; settlement pending
  | 'TRANSITION'    // A Marker target was hit; "Seven-Proof Pub" is loading
  | 'GAME_OVER';    // Shooters = 0; calculating final meta-progression rewards

/**
 * The classified outcome of a single roll of the dice. This drives all
 * payout calculations and state machine transitions.
 *
 * NATURAL      → Come-out 7 or 11: Pass Line wins, hype can increase
 * CRAPS_OUT    → Come-out 2, 3, or 12: Pass Line loses, no point set
 * POINT_SET    → Come-out 4/5/6/8/9/10: Point is now established
 * POINT_HIT    → In point phase, dice matched the active point: Pass Line & Odds win
 * SEVEN_OUT    → In point phase, dice totaled 7: all bets lose, shooter life lost, Hype resets
 * NO_RESOLUTION→ In point phase, any other number: Pass Line & Odds unresolved
 *               (Hardway bets MAY resolve independently on this result)
 */
export type RollResult =
  | 'NATURAL'
  | 'CRAPS_OUT'
  | 'POINT_SET'
  | 'POINT_HIT'
  | 'SEVEN_OUT'
  | 'NO_RESOLUTION';

/** The thematic category of a crew member's ability. Used for UI grouping. */
export type AbilityCategory = 'DICE' | 'TABLE' | 'PAYOUT' | 'HYPE' | 'WILDCARD';

/**
 * Controls how a crew member's cooldown is managed between rolls.
 *
 * 'none'         → No cooldown. execute() is always eligible to fire.
 * 'per_roll'     → Cooldown decrements by 1 after each roll. Ability re-activates
 *                  automatically after N rolls (e.g., The Mechanic's 4-roll cooldown).
 * 'per_shooter'  → Cooldown is binary (0 = ready, 1 = spent). The CASCADE does NOT
 *                  decrement this. The SERVER resets it to 0 when a new shooter starts.
 *                  (e.g., Lefty's one-time-per-shooter save.)
 */
export type CooldownType = 'none' | 'per_roll' | 'per_shooter';

// ---------------------------------------------------------------------------
// BET STRUCTURES
// ---------------------------------------------------------------------------

/**
 * The four active Hardway proposition bets.
 * Each value is the amount wagered, in cents (0 = no active bet).
 *
 * Hardway payouts: Hard 4 & Hard 10 → 7:1 | Hard 6 & Hard 8 → 9:1
 * A Hardway bet WINS when both dice show the paired value (e.g., 3+3 for Hard 6).
 * A Hardway bet LOSES on a seven-out OR when the soft version of that number hits.
 */
export interface HardwayBets {
  hard4: number;  // Wins on 2+2; loses on 7 or 1+3/3+1
  hard6: number;  // Wins on 3+3; loses on 7 or any other sum-of-6 combo
  hard8: number;  // Wins on 4+4; loses on 7 or any other sum-of-8 combo
  hard10: number; // Wins on 5+5; loses on 7 or 4+6/6+4
}

/**
 * All bets a player has active for the current roll, in cents.
 * NOTE: All monetary values are integers in cents to avoid floating-point errors.
 *       $10.00 is stored as 1000. Never use floats for bankroll arithmetic.
 */
export interface Bets {
  /** Pass Line bet. Available during COME_OUT; resolves on Natural, Craps, or Point hit/out. */
  passLine: number;
  /**
   * Odds bet placed behind the Pass Line. Only available after a point is set.
   * Pays at TRUE ODDS — the only bet in craps with zero house edge.
   * Point 4/10 → 2:1 | Point 5/9 → 3:2 | Point 6/8 → 6:5
   */
  odds: number;
  /** The four independent Hardway proposition bets. */
  hardways: HardwayBets;
}

// ---------------------------------------------------------------------------
// TURN CONTEXT — The core mutable object of the cascade
// ---------------------------------------------------------------------------

/**
 * Boolean flags that crew members can set to signal special game-rule overrides.
 * The settlement and state-machine code checks these after the cascade completes.
 */
export interface TurnContextFlags {
  /**
   * Set by "Lefty" McGuffin when he uses his ability to re-roll a seven-out.
   * Informs the client to animate the re-roll and helps the server distinguish
   * a "saved" seven-out from a genuine one.
   */
  sevenOutBlocked: boolean;

  /**
   * Set by "The Floor Walker" — the Pass Line bet does NOT clear on the
   * FIRST seven-out of a shooter's life (one-time protection).
   */
  passLineProtected: boolean;

  /**
   * Set by "The Mathlete" — active Hardway bets stay up even when a "soft"
   * version of their number is rolled (they skip the normal soft-number loss).
   */
  hardwayProtected: boolean;
}

/**
 * TurnContext is the shared mutable "scratchpad" for a single roll resolution.
 *
 * Lifecycle:
 *   1. resolveRoll()       → Creates a fresh TurnContext from dice + game state.
 *   2. resolveCascade()    → Each crew member's execute() receives and returns a
 *                            new TurnContext (immutable transforms — never mutate in place).
 *   3. settleTurn()        → Consumes the FINAL TurnContext to compute bankroll delta.
 *   4. Server post-cascade → Applies ctx.hype to GameState.hype (or resets on SEVEN_OUT).
 *
 * IMPORTANT: All payout values are in cents. All multipliers are plain floats (e.g., 1.2x).
 */
export interface TurnContext {
  // ── Dice State ──────────────────────────────────────────────────────────

  /**
   * The two dice values after all crew DICE manipulations. Server-generated.
   * Not readonly: Dice crew (Lefty, The Mechanic) may replace these mid-cascade.
   * Convention: always spread ctx and return a new object; never mutate in place.
   */
  dice: [number, number];

  /** Convenience sum: dice[0] + dice[1]. Always kept in sync with dice. */
  diceTotal: number;

  /**
   * True when BOTH dice show the same face AND the total is a hardway number (4, 6, 8, 10).
   * e.g., [3,3] = true (Hard 6). [4,3] = false (Soft 7). [6,6] = false (12, not a hardway).
   */
  isHardway: boolean;

  // ── Roll Classification ─────────────────────────────────────────────────

  /**
   * The resolved game outcome for this roll. May change mid-cascade (e.g., Lefty
   * can flip SEVEN_OUT → POINT_HIT by substituting new dice).
   */
  rollResult: RollResult;

  /**
   * The point number that was active when the roll occurred.
   * null if we were in the COME_OUT phase.
   */
  readonly activePoint: number | null;

  // ── Source Bets (Read-Only Reference) ───────────────────────────────────

  /**
   * The bet amounts in play for this roll. Crew members read this to compute
   * conditional flat bonuses (e.g., The Shark adds +$100 on a Point Hit,
   * and Lefty needs to recalculate payouts after re-rolling).
   * Never modified by crew — it is a frozen reference to the GameState bets.
   */
  readonly bets: Readonly<Bets>;

  // ── Base Payouts (Computed by resolveRoll, may be recomputed by Dice crew) ──

  /**
   * Pass Line PROFIT for this roll, in cents.
   * Positive = player wins (e.g., 1:1 on a $10 bet → +1000 profit).
   * Zero = loss or no resolution. Losing bets were already deducted from the
   * bankroll when placed; the engine does not re-subtract them here.
   */
  basePassLinePayout: number;

  /**
   * Odds bet PROFIT for this roll, in cents. True-odds profit only.
   * Non-zero only on POINT_HIT (win). Zero on SEVEN_OUT (loss already at placement)
   * and all non-resolving results.
   */
  baseOddsPayout: number;

  /**
   * Gross Hardways profit for this roll, in cents.
   * Positive if a specific hardway bet won (paired dice). Zero for losses or
   * no-resolution — losing bets were already deducted from the bankroll when placed.
   */
  baseHardwaysPayout: number;

  /**
   * Total stake (original bet amounts) being returned to the bankroll this roll.
   * Only populated for bets that WON — losing bets were already deducted at placement.
   * Not amplified by Hype or crew multipliers; the stake is returned 1:1 regardless.
   *
   * Example: Pass Line $100 wins → baseStakeReturned += 10000.
   *          Odds $100 wins → baseStakeReturned += 10000.
   *          Hard 8 $10 wins → baseStakeReturned += 1000.
   */
  baseStakeReturned: number;

  // ── Cascade Modifiers (Mutated by crew during cascade) ──────────────────

  /**
   * Flat currency bonuses added to gross wins, in cents.
   * Applied BEFORE the Hype × multiplier stack in settleTurn().
   * Example: The Shark adds +$100 (10000 cents) on a Point Hit.
   * Note: additives are ignored on pure-loss rolls. See settleTurn() for details.
   */
  additives: number;

  /**
   * Array of multiplicative payout modifiers contributed by crew.
   * Stored as an array (not a running product) so each contribution is traceable
   * and the WebSocket can emit exactly which crew added which multiplier.
   * Example: The Whale pushes 1.2, making the array [1.2].
   * If two multiplier crew are active: [1.2, 1.5]. Applied as product: 1.2 * 1.5 = 1.8x.
   */
  multipliers: number[];

  // ── Hype (The Global Payout Multiplier) ─────────────────────────────────

  /**
   * The CURRENT Hype value for this roll — includes any boosts from crew that
   * fired earlier in the cascade.
   *
   * Initial value: copied from GameState.hype at the start of the roll.
   * Crew in the HYPE category directly modify this value during the cascade.
   * settleTurn() uses THIS value (post-cascade) in the final payout formula.
   * After settlement, the server persists ctx.hype back to GameState.hype
   * (or resets it to 1.0 on SEVEN_OUT).
   */
  hype: number;

  // ── Rule-Override Flags ──────────────────────────────────────────────────

  /**
   * Boolean overrides set by TABLE and DICE crew to signal special rule changes.
   * The settlement layer and server state-machine check these after the cascade.
   * See TurnContextFlags for per-flag documentation.
   */
  flags: TurnContextFlags;

  /**
   * The bets remaining on the table after this roll resolves.
   * Computed by resolveRoll() based on the roll outcome — resolved bets
   * (won or lost) are set to 0. Crew with protective abilities (e.g., The
   * Mathlete's hardwayProtected flag) may restore values during the cascade.
   * The server applies this to GameState.bets after settlement.
   */
  resolvedBets: Bets;

  /**
   * The die face value (1–6) locked by The Mechanic for this roll.
   * null when no Mechanic freeze is active. Set by resolveRoll() from
   * GameState.mechanicFreeze before the cascade runs. Used by
   * buildRollReceipt() to note the lock in the transaction log.
   */
  mechanicLockedValue: number | null;
}

// ---------------------------------------------------------------------------
// ROLL RECEIPT — QA Transaction Log
// ---------------------------------------------------------------------------

/**
 * Visual classification for a single line in the roll receipt.
 * Drives colour-coding in the RollLog UI component.
 *
 * 'roll'  → dice result summary (white/gray)
 * 'win'   → a bet that paid out (green)
 * 'loss'  → a bet that was cleared/lost (red)
 * 'info'  → modifier note, e.g., Hype multiplier (yellow/blue)
 */
export type RollReceiptLineKind = 'roll' | 'win' | 'loss' | 'info';

/** A single itemized line in the QA transaction log. */
export interface RollReceiptLine {
  kind: RollReceiptLineKind;
  text: string;
}

/**
 * A fully itemized record of one roll's resolution.
 * Built server-side by buildRollReceipt() and returned in the HTTP response
 * so the client can display an auditable transaction history.
 */
export interface RollReceipt {
  /** ISO timestamp — unique React key and human-readable sort order. */
  timestamp: string;
  /** Ordered lines to display in the log panel, from headline down. */
  lines: RollReceiptLine[];
  /** Net bankroll change in cents (positive = net gain, negative = net loss, 0 = no resolution). */
  netDelta: number;
}

// ---------------------------------------------------------------------------
// CREW MEMBER
// ---------------------------------------------------------------------------

/**
 * An RNG function that produces a single roll of two standard dice.
 * Must be injected by the server — never generated client-side.
 *
 * Returns: [d1, d2] where each value is 1–6, uniformly distributed.
 *
 * In production: uses Node.js `crypto.getRandomValues()`.
 * In unit tests: inject a deterministic function, e.g., `() => [3, 4]`.
 */
export type RollDiceFn = () => [number, number];

/**
 * The return type from a crew member's execute() method.
 * Pure functions should never mutate their input — always return a new object.
 */
export interface ExecuteResult {
  /** The new TurnContext after this crew member's ability has been applied. */
  context: TurnContext;

  /**
   * The new cooldown value for this crew member after execution.
   * - For 'none' cooldown crew: always 0.
   * - For 'per_roll' crew: the number of rolls to wait (e.g., 4 for The Mechanic).
   * - For 'per_shooter' crew: 1 means "spent this shooter"; server resets to 0 on new shooter.
   */
  newCooldown: number;
}

/**
 * A runtime crew member instance, combining static definition with live state.
 *
 * The static definition fields (id, name, etc.) match the `crew_definitions`
 * table in the database. The `cooldownState` is per-run mutable state stored
 * in the `runs.crew_slots` jsonb column.
 *
 * DESIGN: execute() is a pure function — it receives a TurnContext and returns
 * a new one. It must not mutate `ctx` or `this`. This makes crew members
 * trivially unit-testable: just call execute() with a crafted context.
 */
export interface CrewMember {
  /** Unique crew ID. Matches crew_definitions.id in the database. */
  readonly id: number;

  /** Display name, e.g., '"Lefty" McGuffin'. */
  readonly name: string;

  /** Thematic ability category, used for UI grouping and filtering. */
  readonly abilityCategory: AbilityCategory;

  /** Governs how cooldownState is managed between rolls. See CooldownType docs. */
  readonly cooldownType: CooldownType;

  /**
   * Current cooldown counter. 0 = ability is ready to fire.
   * Semantics depend on cooldownType. See CooldownType for full docs.
   * This value is mutable; it is persisted to the database after every roll.
   */
  cooldownState: number;

  /** Base recruitment cost during "The Seven-Proof Pub" phase, in cents. */
  readonly baseCost: number;

  /** String key used to look up the 16-bit portrait sprite sheet frame. */
  readonly visualId: string;

  /**
   * The crew member's core ability.
   *
   * @param ctx       The TurnContext as it stands at this point in the cascade.
   *                  Do NOT mutate this object — spread it to produce a new one.
   * @param rollDice  Server-side RNG, injected for testability. Only needed by
   *                  DICE crew (e.g., Lefty) who need to generate new dice values.
   *                  All other crew can safely ignore this parameter.
   * @returns         An ExecuteResult with the new context and updated cooldown.
   */
  execute(ctx: TurnContext, rollDice: RollDiceFn): ExecuteResult;
}

// ---------------------------------------------------------------------------
// GAME STATE
// ---------------------------------------------------------------------------

/**
 * The full, authoritative state of an active run.
 * This is what gets serialized to Redis (hot cache) and PostgreSQL (durable store)
 * after every roll settlement.
 *
 * The client receives a safe, sanitized subset of this — notably, the server
 * never sends the RNG seed or any future dice values to the client.
 */
export interface GameState {
  /** Unique run identifier (UUID). */
  runId: string;

  /** The user who owns this run. */
  userId: string;

  /** Current position in the run state machine. */
  status: RunStatus;

  /** Current craps phase (COME_OUT or POINT_ACTIVE) within the active shooter's life. */
  phase: GamePhase;

  /**
   * The player's current bankroll, in cents.
   * Example: $500.00 is stored as 50000.
   */
  bankroll: number;

  /**
   * Remaining shooter lives. When this hits 0, the run transitions to GAME_OVER.
   * Players start with 5 shooters (per PRD Section 2).
   */
  shooters: number;

  /**
   * Index into the gauntlet progression array. Tracks which Marker (cash target)
   * the player is currently working toward. Increments on TRANSITION.
   */
  currentMarkerIndex: number;

  /**
   * Which floor of the gauntlet the player is on (1–3 for MVP).
   * Every 3rd marker is a Boss fight with special rule modifiers.
   */
  floor: number;

  /**
   * The established Point number (4, 5, 6, 8, 9, or 10).
   * null during COME_OUT phase — no point is set yet.
   */
  currentPoint: number | null;

  /**
   * The global Hype multiplier. Applied to all winning payouts via:
   *   FinalPayout = (GrossWins + Additives) × (Hype × product(CrewMultipliers))
   *
   * Starts at 1.0. Increases as crew boost it. Resets to 1.0 on SEVEN_OUT.
   */
  hype: number;

  /**
   * The bets currently active for this roll/shooter.
   * Validated server-side on every bet placement against current bankroll.
   */
  bets: Bets;

  /**
   * The player's 5 crew slots. null = empty slot (no crew in this position).
   * Position is significant: cascade fires left-to-right, index 0 → 4.
   *
   * Typed as a fixed-length tuple to make the 5-slot constraint explicit.
   */
  crewSlots: [
    CrewMember | null,
    CrewMember | null,
    CrewMember | null,
    CrewMember | null,
    CrewMember | null,
  ];

  /**
   * Point hits scored so far within the current boss fight segment.
   * 0 when not in a boss fight, or at the start of one before any Point Hit.
   *
   * Increments ONLY on POINT_HIT (without clearing the marker).
   * All other outcomes — NATURAL, CRAPS_OUT, POINT_SET, SEVEN_OUT, NO_RESOLUTION —
   * leave this counter unchanged (min-bet holds at its current level).
   * Resets to 0 on any marker clear (TRANSITION or final GAME_OVER).
   *
   * Used by getBossMinBet() to compute the current minimum Pass Line bet.
   */
  bossPointHits: number;

  /**
   * Active Mechanic freeze: the die face locked by the player and the number
   * of rolls remaining in the freeze window. null when no freeze is in effect.
   *
   * Set by the POST /runs/:id/mechanic-freeze endpoint.
   * Decremented after each roll by the roll handler.
   * Cleared on SEVEN_OUT (shooter ends) or when rollsRemaining reaches 0.
   */
  mechanicFreeze: { lockedValue: number; rollsRemaining: number } | null;
}
