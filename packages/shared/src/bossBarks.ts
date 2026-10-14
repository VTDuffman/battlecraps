// =============================================================================
// BATTLECRAPS — BOSS BARKS (FB-032, extended FB-033)
// packages/shared/src/bossBarks.ts
//
// Decides whether a boss barks after a roll, and which line. Pure: the caller
// supplies the roll facts and a random source, so it's unit-testable and the
// same rules apply to every boss that defines `barks` in config.ts.
//
// Two kinds of trigger:
//   • Boss EVENTS — moments specific to a boss's rule, derived per rule below
//     (The Foreman's Cut milestones, Sarge's clock, Le Prix's charm, the
//     Executive's review). Ordered by priority; the first one the boss has
//     lines for barks — always, or by chance for frequent ones (EVENT_BARK_CHANCE).
//   • win / loss — chance-based, and never over a bark already on screen, so
//     the boss doesn't talk on every roll.
// A run-ending roll is always silent (the defeat cinematic owns the screen).
// =============================================================================

import { GAUNTLET, type BossBarkTrigger } from './config.js';
import type { GamePhase, RollResult } from './types.js';

/** Chance a plain win / loss produces a bark. */
export const BARK_CHANCE: Readonly<Record<'win' | 'loss', number>> = { win: 0.55, loss: 0.35 };

/**
 * Boss events always bark, except frequent ones listed here, which bark by
 * chance and never over a showing bark. A skipped frequent event means silence
 * (no win/loss fallback) — e.g. Mme. Le Prix re-charms on most come-outs and
 * "does not raise her voice".
 */
export const EVENT_BARK_CHANCE: Readonly<Partial<Record<BossBarkTrigger, number>>> = {
  charmed:    0.5,
  bonusPaid:  0.5,
  ratingUp:   0.4,
  ratingDown: 0.4,
};

export interface BossBarkInput {
  /** Marker the roll was played at (before any advance). */
  markerIndex:   number;
  /** Bankroll change from the roll; > 0 is a win. */
  bankrollDelta: number;
  /** True for CRAPS_OUT / SEVEN_OUT. */
  isLoss:        boolean;
  /** The roll ended the run — no bark (the defeat moment owns the screen). */
  isGameOver:    boolean;
  /** Final roll result (after boss conversions, e.g. Sarge's TIME'S UP → SEVEN_OUT). */
  rollResult?:   RollResult;
  /** Phase after the roll. */
  newPhase?:     GamePhase;
  /** Boss counter after the roll (Sarge: point-phase rolls used on the clock). */
  newBossPointHits?: number;
  /** Sarge's Double Time clock ran out on this roll. */
  clockExpired?: boolean;
  /** Mme. Le Prix: the charmed crew's ability would have fired (server charmFired). */
  charmFired?:   boolean;
  /** Mme. Le Prix: charmed slot before / after this roll (null = none). */
  charmedSlotBefore?: number | null;
  charmedSlotAfter?:  number | null;
  /** The Executive: Performance Review rating before / after this roll (0–4). */
  ratingBefore?: number | null;
  ratingAfter?:  number | null;
  /** The Executive: the +15% Exceptional bonus paid this roll (cents). */
  exceptionalBonusCents?: number;
  /** Payoff fights: Cut before and after this roll, the Payoff, and whether it was reached. */
  cut?:          { before: number; after: number; payoff: number; paidOff: boolean };
  /** A bark is still showing — skip chance-based barks. */
  barkShowing:   boolean;
  /** Last line shown, to avoid repeating it. */
  lastLine:      string | null;
}

export interface BossBark {
  trigger: BossBarkTrigger;
  line:    string;
}

function crossed(before: number, after: number, payoff: number, fraction: number): boolean {
  const mark = payoff * fraction;
  return before < mark && after >= mark;
}

/**
 * The boss-specific moments this roll produced, highest priority first.
 * Each boss rule contributes its own; rules without events return [].
 */
export function deriveBossBarkEvents(input: BossBarkInput): BossBarkTrigger[] {
  const boss = GAUNTLET[input.markerIndex]?.boss;
  if (!boss) return [];
  const events: BossBarkTrigger[] = [];

  switch (boss.ruleParams.rule) {
    // The Foreman: his Cut closing in on the Payoff.
    case 'EXTORTION_FEE': {
      const { cut } = input;
      if (!cut) break;
      if (cut.paidOff) events.push('payoff');
      else if (crossed(cut.before, cut.after, cut.payoff, 0.8)) events.push('progress80');
      else if (crossed(cut.before, cut.after, cut.payoff, 0.5)) events.push('progress50');
      break;
    }

    // Sarge: the Double Time clock. rollsLeft = rollLimit − rolls used.
    case 'DOUBLE_TIME': {
      const limit = boss.ruleParams.rollLimit;
      if (input.clockExpired) { events.push('timeUp'); break; }
      if (input.rollResult === 'POINT_HIT') { events.push('beatClock'); break; }
      if (input.newPhase !== 'POINT_ACTIVE') break;
      if (input.rollResult === 'POINT_SET') { events.push('pointSet'); break; }
      const rollsLeft = limit - (input.newBossPointHits ?? 0);
      if (rollsLeft === 1) events.push('lastRoll');
      else if (rollsLeft === 2) events.push('clockLow');
      break;
    }

    // Mme. Le Prix: the charm. charmFired (the heartbeat) outranks a plain
    // re-charm; a re-charm only counts when the heart actually moves.
    case 'DISABLE_CREW': {
      if (input.charmFired) { events.push('charmFired'); break; }
      const after = input.charmedSlotAfter;
      if (after !== undefined && after !== null && after !== (input.charmedSlotBefore ?? null)) events.push('charmed');
      break;
    }

    // The Executive: his Performance Review. Reaching the ends of the scale
    // outranks the bonus, which outranks an ordinary move.
    case 'CROSS_CALIBRATION': {
      const before = input.ratingBefore ?? null;
      const after  = input.ratingAfter ?? null;
      const moved  = before !== null && after !== null && after !== before;
      if (moved && after === 4) events.push('promoted');
      else if (moved && after === 0) events.push('finalWarning');
      if ((input.exceptionalBonusCents ?? 0) > 0) events.push('bonusPaid');
      if (moved && after > 0 && after < 4) events.push(after > before ? 'ratingUp' : 'ratingDown');
      break;
    }

    default:
      break;
  }
  return events;
}

/**
 * Picks the trigger for this roll, or null for silence. Boss events win (first
 * one the boss has lines for); otherwise a chance-based win / loss.
 */
export function selectBossBarkTrigger(input: BossBarkInput, random: () => number = Math.random): BossBarkTrigger | null {
  if (input.isGameOver) return null;
  const barks = GAUNTLET[input.markerIndex]?.boss?.barks;

  const event = deriveBossBarkEvents(input).find((t) => (barks?.[t]?.length ?? 0) > 0);
  if (event) {
    const chance = EVENT_BARK_CHANCE[event];
    if (chance === undefined) return event;               // rare event: always
    if (input.barkShowing) return null;                    // frequent event: never over a bark
    return random() < chance ? event : null;               // …and only sometimes
  }

  if (input.barkShowing) return null;
  if (input.bankrollDelta > 0) return random() < BARK_CHANCE.win  ? 'win'  : null;
  if (input.isLoss)            return random() < BARK_CHANCE.loss ? 'loss' : null;
  return null;
}

/**
 * The bark for this roll, or null. Falls back to silence when the boss has no
 * lines for the chosen trigger. Avoids repeating `lastLine` when possible.
 */
export function pickBossBark(input: BossBarkInput, random: () => number = Math.random): BossBark | null {
  const trigger = selectBossBarkTrigger(input, random);
  if (trigger === null) return null;

  const pool = GAUNTLET[input.markerIndex]?.boss?.barks?.[trigger];
  if (!pool || pool.length === 0) return null;

  const options = pool.length > 1 ? pool.filter((l) => l !== input.lastLine) : pool;
  const line = options[Math.floor(random() * options.length)] ?? options[0];
  return line === undefined ? null : { trigger, line };
}
