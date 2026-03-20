// =============================================================================
// CREW: THE OLD PRO
// packages/shared/src/crew/oldPro.ts
//
// Category:    WILDCARD
// Ability:     +1 Shooter (extra life) when a Marker is reached.
// Cooldown:    none (per-roll execute() is a no-op)
//
// The Old Pro's ability is a meta-progression effect, not a per-roll effect.
// His execute() method does nothing — the SERVER is responsible for detecting
// his presence in crew slots during the TRANSITION state and awarding +1 shooter.
//
// Server pseudocode (apps/api, roll route):
//   if (newStatus === 'TRANSITION') {
//     const hasOldPro = run.crewSlots.some(c => c?.id === OLD_PRO_ID);
//     if (hasOldPro) run.shooters += 1;
//   }
//
// The Old Pro is a late-game survivability pick. Each Marker grants +1 life,
// effectively extending the run. Best combined with crew who accelerate
// Marker progression (high Hype + multipliers).
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const oldPro: CrewMember = {
  id:               14,
  name:             'The Old Pro',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         25_000,  // $250.00 — premium survivability crew
  visualId:         'old_pro',

  // No-op: ability is applied server-side during TRANSITION state handling.
  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    return { context: ctx, newCooldown: 0 };
  },
};

/** The crew ID used by the server to detect Old Pro during TRANSITION state. */
export const OLD_PRO_ID = 14;
