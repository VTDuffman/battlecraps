// =============================================================================
// CREW INDEX — Barrel export for all 15 MVP starter crew implementations
// packages/shared/src/crew/index.ts
// =============================================================================

// DICE crew
export { lefty }              from './lefty.js';
export { physicsProfessor }   from './physicsProfessor.js';
export { mechanic }           from './mechanic.js';

// TABLE crew
export { mathlete }           from './mathlete.js';
export { floorWalker }        from './floorWalker.js';
export { regular }            from './regular.js';

// PAYOUT crew
export { bigSpender }         from './bigSpender.js';
export { shark }              from './shark.js';
export { whale }              from './whale.js';

// HYPE crew
export { nervousIntern }      from './nervousIntern.js';
export { hypeTrainHolly }     from './hypeTrainHolly.js';
export { drunkUncle }         from './drunkUncle.js';

// WILDCARD crew (+ exported sentinel IDs for server-side special handling)
export { mimic,       MIMIC_ID }         from './mimic.js';
export { oldPro,      OLD_PRO_ID }       from './oldPro.js';
export { luckyCharm,  LUCKY_CHARM_ID }   from './luckyCharm.js';
