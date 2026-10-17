// =============================================================================
// BATTLECRAPS — BOSS RULES IN FORCE (client)
// apps/web/src/lib/bossRules.ts
//
// FB-040: a boss fight has one rule; The Architect's has every room built so
// far (convergenceRooms), each with its own counter (convergenceState). These
// selectors answer "is this rule on, and what's its counter / params?" for both,
// so trackers and effects work in his fight as in each boss's own.
//
// Mirrors the server's rulesInForce (rolls.ts). Use inside useGameStore(...).
// =============================================================================

import { GAUNTLET, getRoomCounter, isBossMarker, type BossRuleParams, type BossRuleType } from '@battlecraps/shared';
import type { GameState } from '../store/useGameStore.js';

type Slice = Pick<GameState, 'currentMarkerIndex' | 'bossPointHits' | 'convergenceRooms' | 'convergenceState'>;

/** True in The Architect's fight. */
export function isConvergenceFight(s: Slice): boolean {
  return isBossMarker(s.currentMarkerIndex) && GAUNTLET[s.currentMarkerIndex]?.boss?.rule === 'CONVERGENCE';
}

/** True when `rule` is in force at the current marker (its boss's fight, or a room of The Architect's). */
export function isRuleOn(s: Slice, rule: BossRuleType): boolean {
  if (!isBossMarker(s.currentMarkerIndex)) return false;
  if (isConvergenceFight(s)) return s.convergenceRooms.some((m) => GAUNTLET[m]?.boss?.rule === rule);
  return GAUNTLET[s.currentMarkerIndex]?.boss?.rule === rule;
}

/** The rule's counter (Sarge's clock, Le Prix's charm, the Executive's rating, the tide). */
export function ruleCounter(s: Slice, rule: BossRuleType): number {
  if (isConvergenceFight(s)) return s.convergenceState ? getRoomCounter(rule, s.convergenceState) : 0;
  return s.bossPointHits;
}

/** The params of the boss whose rule this is (the same in his own fight and in a room). */
export function paramsOfRule<R extends BossRuleType>(rule: R): Extract<BossRuleParams, { rule: R }> | null {
  const boss = GAUNTLET.find((m) => m.boss?.rule === rule)?.boss;
  return boss ? (boss.ruleParams as Extract<BossRuleParams, { rule: R }>) : null;
}
