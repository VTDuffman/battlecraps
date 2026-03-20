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
} from '@battlecraps/shared';

// ---------------------------------------------------------------------------
// Registry Map — keyed by CrewMember.id
// ---------------------------------------------------------------------------

/**
 * All 15 MVP crew members, keyed by their numeric ID.
 * Add new crew here as they're implemented in packages/shared.
 */
const CREW_REGISTRY = new Map<number, CrewMember>([
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
