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
import { isBossMarker, getFloorByMarkerIndex, GAUNTLET } from '@battlecraps/shared';
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
  const lastHydratedAt     = useGameStore((s) => s.lastHydratedAt);
  const pendingTransition  = useGameStore((s) => s.pendingTransition);
  const activeTransition   = useGameStore((s) => s.activeTransition);
  const transitionPhaseIdx = useGameStore((s) => s.transitionPhaseIndex);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  const bossEntryShownFor  = useGameStore((s) => s.bossEntryShownForMarker);
  const markerIntroShownFor      = useGameStore((s) => s.markerIntroShownForMarker);
  const floorRevealShownFor      = useGameStore((s) => s.floorRevealShownForFloor);
  const titleShown               = useGameStore((s) => s.titleShown);
  const victoryShown             = useGameStore((s) => s.victoryShown);
  const victoryComplete          = useGameStore((s) => s.victoryComplete);
  const setActiveTransition      = useGameStore((s) => s.setActiveTransition);
  const setBossEntryShownFor     = useGameStore((s) => s.setBossEntryShownForMarker);
  const setMarkerIntroShownFor   = useGameStore((s) => s.setMarkerIntroShownForMarker);
  const setFloorRevealShownFor   = useGameStore((s) => s.setFloorRevealShownForFloor);
  const setVictoryShown          = useGameStore((s) => s.setVictoryShown);
  const advanceTransitionPhase   = useGameStore((s) => s.advanceTransitionPhase);
  const clearTransition          = useGameStore((s) => s.clearTransition);

  // ── Transition detection — single consolidated effect ──────────────────
  //
  // All five detection cases share the same dependency set. Splitting them
  // into five separate useEffect hooks causes a stale-closure race: each
  // effect closure captures the state values from the render snapshot, not
  // the values written by earlier effects in the same cycle. The prioritised
  // if/else if chain below issues at most one setActiveTransition() call per
  // firing and returns after the first match, eliminating that race.
  //
  // Priority order (highest → lowest):
  //   1. TITLE        — marker 0, brand-new player
  //   2. BOSS_ENTRY   — arrived at a boss marker
  //   3. FLOOR_REVEAL — arrived at floor 2/3 opener (indices 3, 6)
  //   4. VICTORY      — status=GAME_OVER, all 9 markers cleared
  //   5. MARKER_INTRO — any other non-boss marker not yet introduced
  useEffect(() => {
    if (activeTransition !== null) return;

    // Priority 1 — Title splash (new player, marker 0, never shown before)
    if (
      status === 'IDLE_TABLE' &&
      currentMarkerIndex === 0 &&
      !titleShown
    ) {
      setMarkerIntroShownFor(0);
      setActiveTransition('TITLE');
      return;
    }

    // Priority 2 — Boss entry
    if (
      status === 'IDLE_TABLE' &&
      isBossMarker(currentMarkerIndex) &&
      bossEntryShownFor !== currentMarkerIndex
    ) {
      setBossEntryShownFor(currentMarkerIndex);
      setActiveTransition('BOSS_ENTRY');
      return;
    }

    // Priority 3 — Floor reveal (indices 3 and 6 — non-boss floor openers)
    {
      const currentFloor = getFloorByMarkerIndex(currentMarkerIndex);
      if (
        status === 'IDLE_TABLE' &&
        currentMarkerIndex > 0 &&
        currentMarkerIndex % 3 === 0 &&
        !isBossMarker(currentMarkerIndex) &&
        floorRevealShownFor !== currentFloor.id
      ) {
        setFloorRevealShownFor(currentFloor.id);
        setMarkerIntroShownFor(currentMarkerIndex); // prevent MARKER_INTRO double-trigger
        setActiveTransition('FLOOR_REVEAL');
        return;
      }
    }

    // Priority 4 — Victory cinematic
    if (
      status === 'GAME_OVER' &&
      currentMarkerIndex >= GAUNTLET.length &&
      !victoryShown
    ) {
      setVictoryShown();
      setActiveTransition('VICTORY');
      return;
    }

    // Priority 5 — Marker intro (non-boss marker, not yet introduced)
    if (
      status === 'IDLE_TABLE' &&
      !isBossMarker(currentMarkerIndex) &&
      markerIntroShownFor !== currentMarkerIndex
    ) {
      setMarkerIntroShownFor(currentMarkerIndex);
      setActiveTransition('MARKER_INTRO');
    }
  }, [
    status,
    currentMarkerIndex,
    activeTransition,
    titleShown,
    bossEntryShownFor,
    floorRevealShownFor,
    victoryShown,
    markerIntroShownFor,
    lastHydratedAt,
    setActiveTransition,
    setBossEntryShownFor,
    setFloorRevealShownFor,
    setMarkerIntroShownFor,
    setVictoryShown,
  ]);

  // ── Victory complete → new run ──────────────────────────────────────────
  // After the VICTORY sendoff phase calls clearTransition('VICTORY'),
  // victoryComplete flips to true. This effect calls onPlayAgain() which
  // bootstraps a fresh run. connectToRun resets victoryComplete to false.
  // Kept as its own effect — it has a distinct dependency and no race risk.
  useEffect(() => {
    if (victoryComplete) onPlayAgain();
  }, [victoryComplete, onPlayAgain]);

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

  // 3. Game over or victory.
  if (status === 'GAME_OVER') {
    // Victory path: suppress GameOverScreen while the VICTORY cinematic fires
    // (victoryShown not yet set) or while the new run is bootstrapping
    // (victoryComplete = true, onPlayAgain() called, waiting for connectToRun).
    if (victoryComplete) return null;
    if (currentMarkerIndex >= GAUNTLET.length && !victoryShown) return null;
    return <GameOverScreen onPlayAgain={onPlayAgain} />;
  }

  // 4. Pub (marker cleared, all celebration phases done).
  if (status === 'TRANSITION') {
    return <PubScreen />;
  }

  // 5. Normal gameplay.
  return <>{children}</>;
};
