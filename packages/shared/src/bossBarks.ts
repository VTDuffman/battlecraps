// =============================================================================
// BATTLECRAPS — BOSS BARKS (FB-032)
// packages/shared/src/bossBarks.ts
//
// Decides whether a boss barks after a roll, and which line. Pure: the caller
// supplies the roll facts and a random source, so it's unit-testable and the
// same rules apply to every boss that defines `barks` in config.ts.
//
// Priority: payoff > progress80 > progress50 > win > loss. Milestones always
// bark (they're rare); win/loss bark by chance and never over a bark already
// on screen, so the boss doesn't talk on every roll.
// =============================================================================

import { GAUNTLET, type BossBarkTrigger } from './config.js';

/** Chance a plain win / loss produces a bark (milestones always do). */
export const BARK_CHANCE: Readonly<Record<'win' | 'loss', number>> = { win: 0.55, loss: 0.35 };

export interface BossBarkInput {
  /** Marker the roll was played at (before any advance). */
  markerIndex:   number;
  /** Bankroll change from the roll; > 0 is a win. */
  bankrollDelta: number;
  /** True for CRAPS_OUT / SEVEN_OUT. */
  isLoss:        boolean;
  /** The roll ended the run — no bark (the defeat moment owns the screen). */
  isGameOver:    boolean;
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

/** Picks the trigger for this roll, or null for silence. */
export function selectBossBarkTrigger(input: BossBarkInput, random: () => number = Math.random): BossBarkTrigger | null {
  if (input.isGameOver) return null;
  const { cut } = input;
  if (cut) {
    if (cut.paidOff) return 'payoff';
    if (crossed(cut.before, cut.after, cut.payoff, 0.8)) return 'progress80';
    if (crossed(cut.before, cut.after, cut.payoff, 0.5)) return 'progress50';
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
