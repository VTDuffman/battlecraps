// =============================================================================
// BATTLECRAPS — TRANSITION ORCHESTRATOR
// apps/web/src/transitions/TransitionOrchestrator.tsx
//
// The single authority for game state presentation. Replaces the ad-hoc
// boolean gate chain (pubReady, bossEntryAcknowledged, pendingTransition) in
// the old App.tsx with a clean, extensible phase-sequence system.
//
// ROUTING PRIORITY (top = highest):
//   1. pendingTransition  → children (TableBoard with animations running)
//   2. activeTransition   → PhasePlayer (celebration / boss entry / etc.)
//   3. status=GAME_OVER   → GameOverScreen
//   4. status=TRANSITION  → PubScreen (after all celebration phases cleared)
//   5. default            → children (TableBoard — normal gameplay)
//
// BOSS ENTRY DETECTION:
//   When status becomes IDLE_TABLE on a boss marker, the orchestrator injects
//   a BOSS_ENTRY transition if one hasn't been shown for that marker yet.
//   This replaces the old bossEntryAcknowledged local state in App.tsx.
// =============================================================================

import React, { useCallback, useEffect } from 'react';
import { useGameStore }         from '../store/useGameStore.js';
import { PubScreen }            from '../components/PubScreen.js';
import { GameOverScreen }       from '../components/GameOverScreen.js';
import { PhasePlayer }          from './PhasePlayer.js';
import { TRANSITION_REGISTRY }  from './registry.js';
import { isBossMarker, getFloorByMarkerIndex } from '@battlecraps/shared';
import type { TransitionType }                from '@battlecraps/shared';

interface TransitionOrchestratorProps {
  /** Normal gameplay component (TableBoard). Rendered when no transition is active. */
  children: React.ReactNode;
  /** Called when the player clicks "Play Again" on the game over / victory screen. */
  onPlayAgain: () => void;
}

export const TransitionOrchestrator: React.FC<TransitionOrchestratorProps> = ({
  children,
  onPlayAgain,
}) => {
  const status             = useGameStore((s) => s.status);
  const pendingTransition  = useGameStore((s) => s.pendingTransition);
  const activeTransition   = useGameStore((s) => s.activeTransition);
  const transitionPhaseIdx = useGameStore((s) => s.transitionPhaseIndex);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  const bossEntryShownFor  = useGameStore((s) => s.bossEntryShownForMarker);
  const markerIntroShownFor      = useGameStore((s) => s.markerIntroShownForMarker);
  const floorRevealShownFor      = useGameStore((s) => s.floorRevealShownForFloor);
  const setActiveTransition      = useGameStore((s) => s.setActiveTransition);
  const setBossEntryShownFor     = useGameStore((s) => s.setBossEntryShownForMarker);
  const setMarkerIntroShownFor   = useGameStore((s) => s.setMarkerIntroShownForMarker);
  const setFloorRevealShownFor   = useGameStore((s) => s.setFloorRevealShownForFloor);
  const advanceTransitionPhase   = useGameStore((s) => s.advanceTransitionPhase);
  const clearTransition          = useGameStore((s) => s.clearTransition);

  // ── Boss entry detection ────────────────────────────────────────────────
  // When the player arrives at a boss marker (status flips to IDLE_TABLE and
  // isBossMarker is true), inject a BOSS_ENTRY transition — but only once
  // per marker index so it doesn't re-trigger on every render.
  useEffect(() => {
    if (
      status === 'IDLE_TABLE' &&
      isBossMarker(currentMarkerIndex) &&
      activeTransition === null &&
      bossEntryShownFor !== currentMarkerIndex
    ) {
      setBossEntryShownFor(currentMarkerIndex);
      setActiveTransition('BOSS_ENTRY');
    }
  }, [
    status,
    currentMarkerIndex,
    activeTransition,
    bossEntryShownFor,
    setActiveTransition,
    setBossEntryShownFor,
  ]);

  // ── Floor reveal detection ──────────────────────────────────────────────
  // When the player arrives at the first marker of a new floor (indices 3
  // and 6), inject a two-phase FLOOR_REVEAL cinematic before they roll.
  // Skipped for floor 1 (index 0) — that's the title screen's job (Phase 6).
  // Also marks markerIntroShownFor so MARKER_INTRO doesn't double-trigger
  // on the same marker immediately after.
  useEffect(() => {
    const currentFloor = getFloorByMarkerIndex(currentMarkerIndex);
    if (
      status === 'IDLE_TABLE' &&
      currentMarkerIndex > 0 &&
      currentMarkerIndex % 3 === 0 &&
      !isBossMarker(currentMarkerIndex) &&
      activeTransition === null &&
      floorRevealShownFor !== currentFloor.id
    ) {
      setFloorRevealShownFor(currentFloor.id);
      setMarkerIntroShownFor(currentMarkerIndex); // prevent MARKER_INTRO double-trigger
      setActiveTransition('FLOOR_REVEAL');
    }
  }, [
    status,
    currentMarkerIndex,
    activeTransition,
    floorRevealShownFor,
    setActiveTransition,
    setFloorRevealShownFor,
    setMarkerIntroShownFor,
  ]);

  // ── Marker intro detection ──────────────────────────────────────────────
  // After the pub, when the player lands on a non-boss marker, show the
  // orientation card once. Boss markers skip this — BossEntryPhase covers
  // orientation for those. Fires on the very first marker too, giving the
  // player their target before their first ever roll.
  // Floor-entry markers skip this — FloorRevealPhase covers them and pre-sets
  // markerIntroShownFor to prevent a double-trigger here.
  useEffect(() => {
    if (
      status === 'IDLE_TABLE' &&
      !isBossMarker(currentMarkerIndex) &&
      activeTransition === null &&
      markerIntroShownFor !== currentMarkerIndex
    ) {
      setMarkerIntroShownFor(currentMarkerIndex);
      setActiveTransition('MARKER_INTRO');
    }
  }, [
    status,
    currentMarkerIndex,
    activeTransition,
    markerIntroShownFor,
    setActiveTransition,
    setMarkerIntroShownFor,
  ]);

  // ── Phase advance handler ───────────────────────────────────────────────
  // Called by PhasePlayer (and forwarded to the phase component as onAdvance).
  // Checks whether this was the last phase in the sequence and either advances
  // to the next phase or calls clearTransition with the completion semantics.
  const handleAdvance = useCallback(() => {
    if (!activeTransition) return;

    const sequence  = TRANSITION_REGISTRY[activeTransition];
    const isLastPhase = transitionPhaseIdx >= sequence.length - 1;

    if (isLastPhase) {
      clearTransition(activeTransition as TransitionType);
    } else {
      advanceTransitionPhase();
    }
  }, [activeTransition, transitionPhaseIdx, clearTransition, advanceTransitionPhase]);

  // ── Routing ─────────────────────────────────────────────────────────────

  // 1. Chip rain / payout animations still running — keep TableBoard mounted.
  if (pendingTransition) return <>{children}</>;

  // 2. Active transition — render current phase component.
  if (activeTransition !== null) {
    const sequence = TRANSITION_REGISTRY[activeTransition];
    const phase    = sequence[transitionPhaseIdx];

    if (!phase) {
      // Empty or exhausted sequence (stub transition) — clear immediately.
      clearTransition(activeTransition as TransitionType);
      return null;
    }

    return <PhasePlayer phase={phase} onAdvance={handleAdvance} />;
  }

  // 3. Game over or victory — render end screen.
  if (status === 'GAME_OVER') {
    return <GameOverScreen onPlayAgain={onPlayAgain} />;
  }

  // 4. Pub (marker cleared, all celebration phases done).
  if (status === 'TRANSITION') {
    return <PubScreen />;
  }

  // 5. Normal gameplay.
  return <>{children}</>;
};
