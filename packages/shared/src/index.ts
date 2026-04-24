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
  BossRuleParams,
  CompRewardType,
  RisingMinBetsParams,
  BossConfig,
  MarkerConfig,
} from './config.js';

// Boss rule hook registry + types
export { BOSS_RULE_HOOKS } from './bossRules/index.js';
export type { BossRuleHooks, BossRuleState } from './bossRules/index.js';

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
  LeaderboardEntry,
  GlobalLeaderboardResponse,
  PersonalLeaderboardResponse,
  LeaderboardResponse,
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

// Floor progression, narrative config, and transition framework
export type { TransitionType, CelebrationSnapshot, FloorConfig, FloorAtmosphere } from './floors.js';
export { FLOORS, getFloorById, getFloorByMarkerIndex } from './floors.js';

// All 30 crew + server-side sentinel IDs
export {
  // Original 15 (IDs 1–15) — require unlock
  lefty, physicsProfessor, mechanic,
  mathlete, floorWalker, regular,
  bigSpender, shark, whale,
  nervousIntern, hypeTrainHolly, drunkUncle,
  mimic,     MIMIC_ID,
  oldPro,    OLD_PRO_ID,
  luckyCharm, LUCKY_CHARM_ID,
  // Starter 15 (IDs 16–30) — always available
  lookout, aceMcgee, closeCall,
  momentum, echo, silverLining, oddCouple,
  evenKeel, doorman, grinder,
  handicapper, mirror,
  bookkeeper, pressureCooker, contrarian,
} from './crew/index.js';