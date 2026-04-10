// =============================================================================
// BATTLECRAPS SHARED — Public API
// packages/shared/src/index.ts
// =============================================================================

// Shared game configuration (gauntlet, boss rules, marker targets, etc.)
export {
  GAUNTLET,
  MARKER_TARGETS,
  COMP_PERK_IDS,
  getMaxBet,
  getMinBet,
  isBossMarker,
  getBossMinBet,
  getBaseHypeTick,
  STREAK_BASE_TICK,
  STREAK_INCREMENT,
  STREAK_CAP,
} from './config.js';

export type {
  BossRuleType,
  CompRewardType,
  RisingMinBetsParams,
  BossConfig,
  MarkerConfig,
} from './config.js';

// All TypeScript interfaces and type aliases
export type {
  GamePhase,
  RunStatus,
  RollResult,
  AbilityCategory,
  CooldownType,
  HardwayBets,
  Bets,
  TurnContextFlags,
  TurnContext,
  RollDiceFn,
  ExecuteResult,
  CrewMember,
  GameState,
  RollReceiptLineKind,
  RollReceiptLine,
  RollReceipt,
} from './types.js';

// Core craps resolution engine
export {
  classifyDiceOutcome,
  calculateBasePayouts,
  resolveRoll,
  settleTurn,
  validateOddsBet,
  buildRollReceipt,
} from './crapsEngine.js';

// Clockwise Cascade sequencing engine
export type { CascadeEvent, CascadeResult } from './cascade.js';
export { resolveCascade } from './cascade.js';

// Floor progression and transition framework types
export type { TransitionType, CelebrationSnapshot } from './floors.js';

// All 15 MVP starter crew + server-side sentinel IDs
export {
  lefty, physicsProfessor, mechanic,
  mathlete, floorWalker, regular,
  bigSpender, shark, whale,
  nervousIntern, hypeTrainHolly, drunkUncle,
  mimic,     MIMIC_ID,
  oldPro,    OLD_PRO_ID,
  luckyCharm, LUCKY_CHARM_ID,
} from './crew/index.js';