// =============================================================================
// BATTLECRAPS — BOSS RULE: DOUBLE_TIME (Sarge, Floor 2) — FB-030
// packages/shared/src/bossRules/doubleTime.ts
//
// "Double Time": once a point is set, the shooter has `rollLimit` (6)
// point-phase rolls to hit it. If the last allowed roll is a blank
// (NO_RESOLUTION), Sarge calls "TIME'S UP" and the roll counts as a SEVEN_OUT.
//
// Counter: bossPointHits = point-phase rolls used. +1 on each NO_RESOLUTION;
// reset to 0 on POINT_SET, POINT_HIT and SEVEN_OUT (computeNextState).
//
// No hooks: the timeout is applied inline in rolls.ts AFTER the cascade, so
// blank-roll crew (Grinder) still pay for the roll, while crew that react to a
// dice Seven-Out (Lefty, Floor Walker, Lucky Charm) do not trigger.
// =============================================================================

import type { BossRuleHooks } from './types.js';

export const doubleTimeHooks: BossRuleHooks = {};
