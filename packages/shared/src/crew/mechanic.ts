// =============================================================================
// CREW: THE MECHANIC
// packages/shared/src/crew/mechanic.ts
//
// Category:    DICE
// Ability:     Once per shooter, the player picks a die face (1–6). That die
//              is held at that value for the next 4 rolls, or until the
//              shooter sevens out — whichever comes first.
// Cooldown:    per_shooter (once per shooter life — resets when a new shooter
//              steps up after a Seven Out)
//
// The freeze is NOT applied through the cascade. The player sets it via the
// POST /runs/:id/mechanic-freeze endpoint before rolling. resolveRoll() in
// crapsEngine.ts reads GameState.mechanicFreeze and injects the locked value
// into dice[0] before building the TurnContext.
//
// This execute() method is a deliberate no-op. It exists so the cascade
// machinery can still recognise The Mechanic as a valid CrewMember. The
// cooldownState (per_shooter) is set to 1 by the freeze endpoint to block
// re-activation within the same shooter's life, and is reset to 0 by the
// roll handler when a new shooter begins (resetPerShooter flag).
// =============================================================================

import type { CrewMember, ExecuteResult, RollDiceFn, TurnContext } from '../types.js';

export const mechanic: CrewMember = {
  id:              3,
  name:            'The Mechanic',
  abilityCategory: 'DICE',
  cooldownType:    'per_shooter',
  cooldownState:   0,
  baseCost:        25_000,  // $250.00
  visualId:        'mechanic',
  rarity:          'Legendary',

  execute(ctx: TurnContext, _rollDice: RollDiceFn): ExecuteResult {
    // The freeze is applied in resolveRoll() before the cascade runs.
    // Nothing to do here — return the context unchanged.
    return { context: ctx, newCooldown: 0 };
  },
};
