// =============================================================================
// CREW: THE LUCKY CHARM
// packages/shared/src/crew/luckyCharm.ts
//
// Category:    WILDCARD
// Ability:     Locks Hype at 2.0× if they are your ONLY crew member.
// Cooldown:    none (cascade handles the solo-crew detection)
//
// The Lucky Charm's ability has a unique activation condition: it requires
// checking the entire crew slots array to determine if it's the only member.
// Like The Mimic, this condition can't be evaluated from within execute()
// alone, so the CASCADE (resolveCascade in cascade.ts) handles the special
// case:
//
//   if (isLuckyCharmSolo && member.id === LUCKY_CHARM_ID) {
//     ctx = { ...ctx, hype: Math.max(ctx.hype, 2.0) };
//   }
//
// The Lucky Charm's own execute() is a no-op fallback for when it is NOT
// the only crew (in which case the cascade does not inject the hype lock,
// and Lucky Charm simply does nothing this roll).
//
// STRATEGIC NOTE:
//   Playing with only The Lucky Charm means you have no Dice, Table, or
//   other Payout crew — you're trading crew synergy for a guaranteed 2.0×
//   Hype floor. This gives every payout a minimum 2× amplification, but
//   you lose all the cascade effects that make wins truly astronomical.
//   Best for a "beginner safety net" build.
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const luckyCharm: CrewMember = {
  id:               15,
  name:             'The Lucky Charm',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         20_000,  // $200.00
  visualId:         'lucky_charm',
  rarity:           'Rare',

  // No-op: the cascade injects the hype lock before calling execute() when
  // Lucky Charm is the sole crew. execute() itself doesn't need to do anything.
  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    return { context: ctx, newCooldown: 0 };
  },
};

/** The crew ID used by resolveCascade() to identify and special-case The Lucky Charm. */
export const LUCKY_CHARM_ID = 15;
