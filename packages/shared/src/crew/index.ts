// =============================================================================
// CREW INDEX — Barrel export for all 30 crew implementations
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

// DICE Starter crew (IDs 16–18)
export { lookout }          from './lookout.js';
export { aceMcgee }         from './aceMcgee.js';
export { closeCall }        from './closeCall.js';

// HYPE Starter crew (IDs 19–22)
export { momentum }         from './momentum.js';
export { echo }             from './echo.js';
export { silverLining }     from './silverLining.js';
export { oddCouple }        from './oddCouple.js';

// TABLE Starter crew (IDs 23–25)
export { evenKeel }         from './evenKeel.js';
export { doorman }          from './doorman.js';
export { grinder }          from './grinder.js';

// PAYOUT Starter crew (IDs 26–27)
export { handicapper }      from './handicapper.js';
export { mirror }           from './mirror.js';

// WILDCARD Starter crew (IDs 28–30)
export { bookkeeper }       from './bookkeeper.js';
export { pressureCooker }   from './pressureCooker.js';
export { contrarian }       from './contrarian.js';
