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
import { isBossMarker }         from '@battlecraps/shared';
import type { TransitionType }  from '@battlecraps/shared';

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
  const setActiveTransition      = useGameStore((s) => s.setActiveTransition);
  const setBossEntryShownFor     = useGameStore((s) => s.setBossEntryShownForMarker);
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
