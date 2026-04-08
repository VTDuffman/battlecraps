// =============================================================================
// BATTLECRAPS — CLOCKWISE CASCADE
// packages/shared/src/cascade.ts
//
// The sequencing engine that drives crew abilities. This is the "heart" of the
// game's unique mechanic: after dice resolve, each crew member in slots 0→4
// fires their execute() method in order, each one seeing the TurnContext as
// modified by all previous crew members.
//
// The cascade also produces an ordered list of CascadeEvents — one per crew
// member that actually changed the context. These events are emitted over
// WebSocket (server → client) to drive sequential portrait flash animations.
// =============================================================================

import type { CrewMember, RollDiceFn, TurnContext } from './types.js';
import { MIMIC_ID } from './crew/mimic.js';
import { LUCKY_CHARM_ID } from './crew/luckyCharm.js';

// ---------------------------------------------------------------------------
// CASCADE EVENT — Emitted over WebSocket for each crew trigger
// ---------------------------------------------------------------------------

/**
 * A record of a single crew member firing during the cascade.
 *
 * The server emits one of these per crew trigger over the WebSocket connection.
 * The client uses the sequence to animate portraits flashing left-to-right, with
 * text barks appearing above each triggered crew member.
 *
 * Only emitted when a crew member's execute() actually CHANGED something.
 * Silent passes (e.g., The Whale on a losing roll) produce no event.
 */
export interface CascadeEvent {
  /** The slot index (0–4) of the crew member that fired. */
  slotIndex: number;

  /** The crew member's ID, for client-side sprite/bark lookup. */
  crewId: number;

  /** The crew member's display name, for client-side text barks. */
  crewName: string;

  /**
   * The fields of TurnContext that changed as a result of this crew firing.
   * Only the changed fields are included (sparse object).
   *
   * Examples:
   *   Lefty fires:           { dice: [4,3], diceTotal: 7, rollResult: 'NO_RESOLUTION' }
   *   Nervous Intern fires:  { hype: 1.2 }
   *   The Whale fires:       { multipliers: [1.2] }
   */
  contextDelta: Partial<TurnContext>;
}

// ---------------------------------------------------------------------------
// CASCADE RESULT — The full output of resolveCascade()
// ---------------------------------------------------------------------------

/**
 * The complete output of a cascade execution.
 *
 * The API route handler uses this to:
 *   1. Calculate the final bankroll delta via settleTurn(finalContext).
 *   2. Emit events[] over WebSocket for the client to animate.
 *   3. Persist updatedCrewSlots back to the run's crew_slots column.
 */
export interface CascadeResult {
  /** The TurnContext after all crew have fired. Pass this to settleTurn(). */
  finalContext: TurnContext;

  /**
   * Ordered list of crew trigger events for client animation.
   * Guaranteed to be in slot-index order (0→4).
   * Only contains entries for crew who changed the context.
   */
  events: CascadeEvent[];

  /**
   * A new crew slots array with updated cooldownState values.
   * The API route handler must persist this back to the run state after the roll.
   * The original crewSlots array is NOT mutated.
   */
  updatedCrewSlots: (CrewMember | null)[];
}

// ---------------------------------------------------------------------------
// INTERNAL HELPER — Context Diff
// ---------------------------------------------------------------------------

/**
 * Produces a sparse object containing only the TurnContext fields that changed
 * between two snapshots. Used to build the contextDelta in CascadeEvent.
 *
 * We intentionally check only the fields that crew members are allowed to
 * modify. If a field isn't in this list, it either shouldn't change or doesn't
 * need to be tracked for animation purposes.
 */
function computeContextDelta(before: TurnContext, after: TurnContext): Partial<TurnContext> {
  const delta: Partial<TurnContext> = {};

  // Dice: check individual values since arrays aren't === by reference
  if (before.dice[0] !== after.dice[0] || before.dice[1] !== after.dice[1]) {
    delta.dice      = after.dice;
    delta.diceTotal = after.diceTotal;
    delta.isHardway = after.isHardway;
  }

  if (before.rollResult !== after.rollResult) {
    delta.rollResult = after.rollResult;
  }

  if (before.basePassLinePayout !== after.basePassLinePayout) {
    delta.basePassLinePayout = after.basePassLinePayout;
  }

  if (before.baseOddsPayout !== after.baseOddsPayout) {
    delta.baseOddsPayout = after.baseOddsPayout;
  }

  if (before.baseHardwaysPayout !== after.baseHardwaysPayout) {
    delta.baseHardwaysPayout = after.baseHardwaysPayout;
  }

  if (before.additives !== after.additives) {
    delta.additives = after.additives;
  }

  // Multipliers: compare length first (fast path), then element-by-element.
  // We avoid after.multipliers[i] direct indexing to satisfy noUncheckedIndexedAccess.
  if (
    before.multipliers.length !== after.multipliers.length ||
    before.multipliers.some((m, i) => m !== after.multipliers.at(i))
  ) {
    delta.multipliers = after.multipliers;
  }

  if (before.hype !== after.hype) {
    delta.hype = after.hype;
  }

  // Flags: JSON compare is safe here — small fixed-shape object, called once per slot
  if (JSON.stringify(before.flags) !== JSON.stringify(after.flags)) {
    delta.flags = after.flags;
  }

  return delta;
}

// ---------------------------------------------------------------------------
// EXPORTED CORE — resolveCascade
// ---------------------------------------------------------------------------

/**
 * Executes the Clockwise Cascade — the core sequencing mechanic of Battlecraps.
 *
 * Iterates over crew slots 0 → 4 in order. For each active (non-null) crew member:
 *   1. Checks if the crew member is on cooldown. If so, manages their cooldown
 *      state and skips to the next slot (no ability fires, no event emitted).
 *   2. Calls member.execute(currentCtx, rollDice) to apply their ability.
 *   3. Captures the new context and computes the delta for the WebSocket event.
 *   4. Records the updated cooldown state in the output array.
 *
 * The cascade is immutable with respect to its inputs — neither `crewSlots` nor
 * `initialCtx` are mutated. All modifications flow through return values.
 *
 * @param crewSlots    The player's current 5-slot crew array (nulls for empty slots).
 * @param initialCtx   The TurnContext produced by resolveRoll() for this roll.
 * @param rollDice     Server-side RNG, injected here and passed through to crew.
 *                     Only Dice crew (Lefty, etc.) will call this; others ignore it.
 * @returns            CascadeResult with final context, events, and updated crew state.
 */
export function resolveCascade(
  crewSlots: (CrewMember | null)[],
  initialCtx: TurnContext,
  rollDice: RollDiceFn,
): CascadeResult {
  const events: CascadeEvent[] = [];

  // Build a mutable copy of the slots array for updated cooldown states.
  const updatedCrewSlots: (CrewMember | null)[] = [...crewSlots];

  // ── Pre-cascade: Wildcard special-case checks ────────────────────────────

  // Lucky Charm solo check: is Lucky Charm the ONLY non-null crew member?
  // Must be computed before the loop so we can inject the hype lock as her
  // "event" at the correct slot position.
  const activeCrew = crewSlots.filter((c): c is CrewMember => c != null);
  const soloMember = activeCrew.length === 1 ? activeCrew[0] : undefined;
  const isLuckyCharmSolo = soloMember?.id === LUCKY_CHARM_ID;

  // Mimic tracking: remember the last crew member whose execute() actually ran.
  // The Mimic (id=13) calls this crew's execute() instead of its own no-op.
  let lastFiredMember: CrewMember | null = null;

  // ctx "flows" through the cascade — each crew member receives the version
  // modified by all previous crew members, in slot order.
  let ctx = initialCtx;

  for (let i = 0; i < crewSlots.length; i++) {
    const member = crewSlots[i];

    // ── Empty slot (null) or missing index (noUncheckedIndexedAccess) ─────
    if (member == null) continue;

    // ── Crew on cooldown: manage their state, then skip ───────────────────
    if (member.cooldownState > 0) {
      if (member.cooldownType === 'per_roll') {
        updatedCrewSlots[i] = { ...member, cooldownState: member.cooldownState - 1 } as CrewMember;
      } else if (member.cooldownType === 'per_shooter') {
        // Do NOT decrement — server resets on new shooter.
        updatedCrewSlots[i] = { ...member } as CrewMember;
      }
      continue;
    }

    // ── Snapshot context BEFORE any modification for this slot ──────────
    const prevCtx = ctx;

    // ── Lucky Charm solo: inject hype floor ──────────────────────────────
    // Her own execute() is a no-op; the cascade applies the 2.0× floor here
    // so that the contextDelta picks it up and emits a proper WebSocket event.
    // The snapshot must be taken BEFORE this mutation so the delta is non-empty.
    //
    // Formula: shift hype by +1.0 when below the 2.0× floor.
    // This preserves any bonuses already accumulated above the 1.0× baseline
    // rather than discarding them. E.g. 1.3× → 2.3× (not 2.0×).
    // When hype is already ≥ 2.0× the floor is a no-op.
    if (member.id === LUCKY_CHARM_ID && isLuckyCharmSolo) {
      ctx = { ...ctx, hype: ctx.hype < 2.0 ? ctx.hype + 1.0 : ctx.hype };
    }

    // ── Mimic: substitute the last-fired crew's execute() ────────────────
    // If Mimic is in slot i and a prior crew fired, we call the prior crew's
    // execute() instead of Mimic's no-op. Mimic's own cooldown is still tracked.
    let effectiveMember: CrewMember = member;
    if (member.id === MIMIC_ID && lastFiredMember !== null) {
      effectiveMember = lastFiredMember;
    }

    // ── Fire the ability ──────────────────────────────────────────────────
    const result  = effectiveMember.execute(ctx, rollDice);
    ctx           = result.context;

    // Record cooldown — always based on the ACTUAL slot member (not effectiveMember).
    updatedCrewSlots[i] = { ...member, cooldownState: result.newCooldown } as CrewMember;

    // Track who fired last (for The Mimic at a later slot).
    // We track `member` (the slot occupant), not `effectiveMember`, so that
    // two consecutive Mimics don't chain infinitely off each other.
    if (member.id !== MIMIC_ID) {
      lastFiredMember = member;
    }

    // Build the diff and emit event if anything changed.
    const delta = computeContextDelta(prevCtx, ctx);
    if (Object.keys(delta).length > 0) {
      events.push({
        slotIndex:    i,
        crewId:       member.id,
        crewName:     member.name,
        contextDelta: delta,
      });
    }
  }

  return { finalContext: ctx, events, updatedCrewSlots };
}
