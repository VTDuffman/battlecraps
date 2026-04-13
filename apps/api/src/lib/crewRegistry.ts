// =============================================================================
// BATTLECRAPS — CREW REGISTRY
// apps/api/src/lib/crewRegistry.ts
//
// Maps crew IDs to their full CrewMember implementations (which include the
// execute() function that cannot be persisted to the database).
//
// The `runs.crew_slots` JSONB column stores only { crewId, cooldownState }.
// Before a roll, the API hydrates those stored slots into live CrewMember
// objects using this registry, injecting the saved cooldownState so the
// cascade runs with the correct per-roll/per-shooter counters.
// =============================================================================

import type { CrewMember } from '@battlecraps/shared';
import {
  lefty,
  physicsProfessor,
  mechanic,
  mathlete,
  floorWalker,
  regular,
  bigSpender,
  shark,
  whale,
  nervousIntern,
  hypeTrainHolly,
  drunkUncle,
  mimic,
  oldPro,
  luckyCharm,
  // Starter 15 (IDs 16–30)
  lookout,
  aceMcgee,
  closeCall,
  momentum,
  echo,
  silverLining,
  oddCouple,
  evenKeel,
  doorman,
  grinder,
  handicapper,
  mirror,
  bookkeeper,
  pressureCooker,
  contrarian,
} from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// Registry Map — keyed by CrewMember.id
// ---------------------------------------------------------------------------

/**
 * All 30 crew members, keyed by their numeric ID.
 * IDs 1–15: original crew (require unlock).
 * IDs 16–30: Starter crew (always available).
 */
const CREW_REGISTRY = new Map<number, CrewMember>([
  // Original 15 (IDs 1–15)
  [lefty.id,            lefty],
  [physicsProfessor.id, physicsProfessor],
  [mechanic.id,         mechanic],
  [mathlete.id,         mathlete],
  [floorWalker.id,      floorWalker],
  [regular.id,          regular],
  [bigSpender.id,       bigSpender],
  [shark.id,            shark],
  [whale.id,            whale],
  [nervousIntern.id,    nervousIntern],
  [hypeTrainHolly.id,   hypeTrainHolly],
  [drunkUncle.id,       drunkUncle],
  [mimic.id,            mimic],
  [oldPro.id,           oldPro],
  [luckyCharm.id,       luckyCharm],
  // Starter 15 (IDs 16–30)
  [lookout.id,          lookout],
  [aceMcgee.id,         aceMcgee],
  [closeCall.id,        closeCall],
  [momentum.id,         momentum],
  [echo.id,             echo],
  [silverLining.id,     silverLining],
  [oddCouple.id,        oddCouple],
  [evenKeel.id,         evenKeel],
  [doorman.id,          doorman],
  [grinder.id,          grinder],
  [handicapper.id,      handicapper],
  [mirror.id,           mirror],
  [bookkeeper.id,       bookkeeper],
  [pressureCooker.id,   pressureCooker],
  [contrarian.id,       contrarian],
]);

// ---------------------------------------------------------------------------
// Hydration helper
// ---------------------------------------------------------------------------

/**
 * Reconstructs a live CrewMember from a stored { crewId, cooldownState } pair.
 *
 * Returns a new object that spreads the canonical crew definition and overwrites
 * cooldownState with the persisted value — preserving the correct per-roll or
 * per-shooter counter without mutating the singleton in the registry.
 *
 * @throws If the crewId is not found in the registry (data integrity error).
 */
export function hydrateCrewMember(crewId: number, cooldownState: number): CrewMember {
  const template = CREW_REGISTRY.get(crewId);
  if (template === undefined) {
    throw new Error(`crewRegistry: unknown crew ID ${crewId}. Is this crew registered?`);
  }
  // Spread the immutable template and inject the live cooldown state.
  // Object.assign preserves the execute() method reference cleanly.
  return Object.assign(Object.create(Object.getPrototypeOf(template)) as CrewMember, template, {
    cooldownState,
  });
}

/** Looks up a crew member template by ID without modifying cooldownState. */
export function getCrewById(crewId: number): CrewMember | undefined {
  return CREW_REGISTRY.get(crewId);
}
