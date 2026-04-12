// =============================================================================
// BATTLECRAPS — BOSS RULE HOOK TYPES
// packages/shared/src/bossRules/types.ts
//
// Mirrors the crew execute() pattern. Each boss rule gets its own hook file
// implementing the BossRuleHooks interface. A new boss rule = a new file + a
// new BossRuleParams union member. Nothing else in shared needs to change.
// =============================================================================

import type { Bets, TurnContext } from '../types.js';
import type { BossRuleParams } from '../config.js';

/**
 * Per-fight runtime state passed into every hook call.
 * The server reads these from the active run record and passes them in.
 */
export interface BossRuleState {
  /** Point hits scored so far in this boss fight segment. */
  bossPointHits: number;
  /** 0-based index into GAUNTLET for the current marker. */
  markerIndex:   number;
}

/**
 * The hook interface every boss rule module implements.
 * All hooks are optional — a rule only needs to provide the hooks relevant to
 * its mechanic (e.g., DISABLE_CREW only needs modifyCascadeOrder).
 */
export interface BossRuleHooks {
  /**
   * Called before the roll is accepted. Return an error string to reject the
   * bet (server responds 422 with that string), or null to allow it.
   *
   * Used by: RISING_MIN_BETS — rejects if passLine < current min bet.
   */
  validateBet?(bets: Bets, params: BossRuleParams, state: BossRuleState): string | null;

  /**
   * Called after classifyRoll() but before the cascade.
   * Returns a (potentially modified) TurnContext. Hook must not mutate `ctx`.
   *
   * Used by: FOURS_INSTANT_LOSS — sets ctx.flags.instantLoss when dice match.
   */
  modifyOutcome?(ctx: TurnContext, params: BossRuleParams, state: BossRuleState): TurnContext;

  /**
   * Called at the top of resolveCascade() to determine which slot indices (and
   * in what order) the cascade will visit. Return [] to skip the entire loop.
   *
   * Used by: DISABLE_CREW — returns [] to fully suppress crew cascade.
   */
  modifyCascadeOrder?(slotCount: number, params: BossRuleParams): number[];
}
