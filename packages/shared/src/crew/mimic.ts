// =============================================================================
// CREW: THE MIMIC
// packages/shared/src/crew/mimic.ts
//
// Category:    WILDCARD
// Ability:     Copies the previous slot's ability during the cascade.
// Cooldown:    none (the cascade handles the special execution logic)
//
// The Mimic's execute() is intentionally a NO-OP. The actual "copy previous
// crew" logic lives in resolveCascade() (cascade.ts), which detects The
// Mimic's ID and substitutes the last-fired crew member's execute() call.
//
// Why here vs. inside execute()?
//   execute() only receives TurnContext and rollDice — it has no access to
//   the rest of the crew slots. The cascade already has that context, so
//   the logic naturally belongs there.
//
// PLACEMENT MATTERS: The Mimic only copies crew who fired BEFORE it.
//   Slot 0: Mimic → no previous crew → does nothing (no-op)
//   Slot 1: Mimic → copies slot 0's crew
//   Slot 4: Mimic → copies the last crew who fired in slots 0–3
//
// The Mimic is best placed at slot 4 to double up on the most powerful
// crew earlier in the cascade (e.g., doubling The Whale's 1.2× multiplier).
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const mimic: CrewMember = {
  id:               13,
  name:             'The Mimic',
  abilityCategory:  'WILDCARD',
  cooldownType:     'none',
  cooldownState:    0,
  baseCost:         22_000,  // $220.00
  visualId:         'mimic',
  rarity:           'Epic',

  // No-op: the cascade handles the actual ability copying.
  // This execute() is a safe fallback if Mimic is in slot 0 (no prior crew).
  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    return { context: ctx, newCooldown: 0 };
  },
};

/** The crew ID used by resolveCascade() to identify and special-case The Mimic. */
export const MIMIC_ID = 13;
