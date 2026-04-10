// =============================================================================
// BATTLECRAPS — TRANSITION REGISTRY
// apps/web/src/transitions/registry.ts
//
// Maps each TransitionType to an ordered sequence of TransitionPhase
// descriptors. The TransitionOrchestrator reads this to know what to render
// and how to advance. The PhasePlayer handles the per-phase timing.
//
// HOW TO ADD A NEW TRANSITION TYPE:
//   1. Add the type to TransitionType in packages/shared/src/floors.ts
//   2. Create a phase component in apps/web/src/transitions/phases/
//   3. Register the component in PHASE_COMPONENT_MAP below
//   4. Add the sequence to TRANSITION_REGISTRY below
//   5. Handle the completion case in TransitionOrchestrator.tsx if needed
//
// HOW TO ADD A PHASE TO AN EXISTING TRANSITION:
//   1. Create the phase component
//   2. Register it in PHASE_COMPONENT_MAP
//   3. Add it to the sequence array (order matters — first = first shown)
// =============================================================================

import type { TransitionType } from '@battlecraps/shared';
import type { TransitionPhase, PhaseComponentProps } from './types.js';
import type React from 'react';

import { MarkerCelebrationPhase } from './phases/MarkerCelebrationPhase.js';
import { BossVictoryPhase }       from './phases/BossVictoryPhase.js';
import { BossEntryPhase }         from './phases/BossEntryPhase.js';

// ---------------------------------------------------------------------------
// Phase component registry
//
// Maps string keys (used in TransitionPhase.component) to React components.
// Using string keys keeps the phase descriptor data-only (JSON-serialisable)
// and decouples the registry from the component import graph.
//
// Add new entries here as new phases are built in later implementation phases.
// ---------------------------------------------------------------------------

export const PHASE_COMPONENT_MAP: Record<string, React.ComponentType<PhaseComponentProps>> = {
  // Phase 1 — active
  MarkerCelebrationPhase,
  BossVictoryPhase,
  BossEntryPhase,

  // Phase 3 — placeholders (components not yet built)
  // MarkerIntroPhase,

  // Phase 4
  // FloorRevealPhase,
  // FloorRevealConfirmPhase,

  // Phase 5
  // BossEntryDreadPhase,
  // BossEntryRevealPhase,
  // BossVictoryCompPhase,

  // Phase 6
  // TitleScreenPhase,

  // Phase 8
  // VictoryExplosionPhase,
  // VictoryRecapPhase,
  // VictorySendoffPhase,

  // Phase 9
  // GameOverPhase,
};

// ---------------------------------------------------------------------------
// Transition registry
//
// Each TransitionType maps to an ordered array of TransitionPhase descriptors.
// Phases execute left-to-right. An empty array is a valid stub — the
// orchestrator will treat it as an instant no-op transition.
//
// PHASE 1 STATUS:
//   ✅ MARKER_CLEAR  — single gated modal (celebration → pub)
//   ✅ BOSS_VICTORY  — single gated modal (victory → pub)
//   ✅ BOSS_ENTRY    — single gated modal (dread → table)
//   🔲 TITLE         — Phase 6
//   🔲 MARKER_INTRO  — Phase 3
//   🔲 FLOOR_REVEAL  — Phase 4
//   🔲 VICTORY       — Phase 8
//   🔲 GAME_OVER     — Phase 9 (currently handled by GameOverScreen directly)
// ---------------------------------------------------------------------------

export const TRANSITION_REGISTRY: Record<TransitionType, TransitionPhase[]> = {

  // ── MARKER_CLEAR — standard marker celebration ────────────────────────────
  // Phase 3 will prepend an 'animation' phase tied to ChipRain.onComplete,
  // and enrich the modal with bankroll delta counters and floor pip progress.
  MARKER_CLEAR: [
    {
      id:          'modal',
      advanceMode: 'gated',
      component:   'MarkerCelebrationPhase',
    },
  ],

  // ── BOSS_VICTORY — celebration after defeating a boss ────────────────────
  // Phase 5 will split this into a triumph auto-phase and a comp-reveal
  // gated phase with animated badge award.
  BOSS_VICTORY: [
    {
      id:          'modal',
      advanceMode: 'gated',
      component:   'BossVictoryPhase',
    },
  ],

  // ── BOSS_ENTRY — shown once when entering a boss marker ──────────────────
  // Phase 5 will prepend an auto 'dread' phase (1.8s) that delays the CTA
  // so the player can't button-mash through the boss introduction.
  BOSS_ENTRY: [
    {
      id:          'reveal',
      advanceMode: 'gated',
      component:   'BossEntryPhase',
    },
  ],

  // ── Future phase stubs ────────────────────────────────────────────────────

  TITLE: [],         // Phase 6 — first-load cinematic

  MARKER_INTRO: [],  // Phase 3 — post-pub orientation card

  FLOOR_REVEAL: [],  // Phase 4 — full-screen floor announcement

  VICTORY: [],       // Phase 8 — epic win cinematic (3 phases)

  GAME_OVER: [],     // Phase 9 — progress recap + tone-calibrated message
};
