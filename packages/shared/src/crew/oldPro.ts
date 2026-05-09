// =============================================================================
// CREW: THE OLD PRO
// packages/shared/src/crew/oldPro.ts
//
// Category:    WILDCARD
// Ability:     Raises the table bet ceiling from 10% to 15% of the marker target.
// Cooldown:    none (per-roll execute() is a no-op)
//
// The Old Pro's ability is applied at bet-validation time, not per-roll.
// His execute() method does nothing — the SERVER detects his presence in the
// crew slots before enforcing the table maximum and passes 0.15 as the ceiling
// fraction to getMaxBet() instead of the default 0.10.
//
// Server pseudocode (apps/api, roll route):
//   const hasOldPro = (run.crewSlots as StoredCrewSlots).some(c => c?.crewId === OLD_PRO_ID);
//   const maxBet = getMaxBet(run.currentMarkerIndex, run.bossPointHits, hasOldPro ? 0.15 : 0.10);
//
// This is a meta-metagame pick for High Roller's Club leaderboard chasers:
// larger bets → larger payouts → higher amplified-roll records. The ceiling
// lift applies to both pass-line and hardway bets every roll of the run.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const oldPro: CrewMember = {
  id:               14,
  name:             'The Old Pro',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         25_000,  // $250.00
  visualId:         'old_pro',
  rarity:           'Epic',

  // No-op: ability is applied server-side at bet-validation time.
  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    return { context: ctx, newCooldown: 0 };
  },
};

/** The crew ID used by the server to detect Old Pro during bet validation. */
export const OLD_PRO_ID = 14;
