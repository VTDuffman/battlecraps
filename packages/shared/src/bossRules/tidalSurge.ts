// =============================================================================
// BATTLECRAPS — TIDAL_SURGE BOSS RULE (FB-037)
// packages/shared/src/bossRules/tidalSurge.ts
//
// Floor 6 — The Sovereign (Atlantis — The Throne Room)
// Mechanic: the tide runs a four-stage cycle (LOW → EBB → HIGH → FLOW), and
// each stage is its own challenge:
//   LOW TIDE  — DEAD CALM:  no odds bets.
//   EBB, FLOW — UNDERTOW:   a Seven-Out drags a share of the bankroll out to sea.
//   HIGH TIDE — HIGH TIDE:  a Seven-Out drowns extra shooters (The Covenant
//                           cancels it).
// The tide advances when a come-out cycle resolves (Natural, Craps Out, Point
// Hit, Seven-Out); a point set at a stage stays at that stage until it
// resolves. Enforcement is inline in rolls.ts (odds rejection, the undertow,
// the wave); this module only describes the stages.
//
// Counter storage: reuses `bossPointHits` (DB: boss_roll_count) as the tide
// position, wrapping mod the stage count.
// =============================================================================

import type { BossRuleHooks } from './types.js';
import type { BossRuleParams } from '../config.js';

export type TideEffect = 'DEAD_CALM' | 'UNDERTOW' | 'HIGH_TIDE';

export interface TideStage {
  /** 0–3 position in the cycle. */
  index:  number;
  /** The tide itself: LOW TIDE / EBB / HIGH TIDE / FLOW. */
  tide:   string;
  /** What this stage does. */
  effect: TideEffect;
  /** The stage's challenge, e.g. "DEAD CALM". */
  name:   string;
  /** One line, e.g. "NO ODDS BETS". */
  rule:   string;
}

type TidalParams = Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;

/** The tide stage for a counter value (and so the next stage at counter + 1). */
export function getTideStage(params: TidalParams, counter: number): TideStage {
  const n      = params.stageEffects.length;
  const index  = ((counter % n) + n) % n;
  const effect = params.stageEffects[index] ?? 'DEAD_CALM';
  const tide   = params.stageLabels[index] ?? 'LOW TIDE';
  switch (effect) {
    case 'DEAD_CALM': return { index, tide, effect, name: 'DEAD CALM', rule: 'NO ODDS BETS' };
    case 'UNDERTOW':  return { index, tide, effect, name: 'UNDERTOW',  rule: `A SEVEN-OUT TAKES ${Math.round(params.undertowPct * 100)}% OF YOUR BANKROLL` };
    case 'HIGH_TIDE': return { index, tide, effect, name: 'HIGH TIDE', rule: `A SEVEN-OUT DROWNS ${params.waveShooters} SHOOTERS` };
  }
}

/** No hooks: the tide is enforced inline in rolls.ts (see header). */
export const tidalSurgeHooks: BossRuleHooks = {};
