// =============================================================================
// BATTLECRAPS — BOSS RULE HOOKS REGISTRY
// packages/shared/src/bossRules/index.ts
//
// Maps every BossRuleType to its hook implementation. Adding a new boss rule:
//   1. Add a union member to BossRuleParams in config.ts
//   2. Create a new hook file in this directory
//   3. Register it here — nothing else in shared needs to change
// =============================================================================

import type { BossRuleType } from '../config.js';
import type { BossRuleHooks } from './types.js';

import { risingMinBetsHooks } from './risingMinBets.js';
import { disableCrewHooks }   from './disableCrew.js';
import { foursInstantLossHooks } from './foursInstantLoss.js';

export const BOSS_RULE_HOOKS: Record<BossRuleType, BossRuleHooks> = {
  RISING_MIN_BETS:    risingMinBetsHooks,
  DISABLE_CREW:       disableCrewHooks,
  FOURS_INSTANT_LOSS: foursInstantLossHooks,
};

export type { BossRuleHooks, BossRuleState } from './types.js';
