// =============================================================================
// BATTLECRAPS — PHASE PLAYER
// apps/web/src/transitions/PhasePlayer.tsx
//
// Renders the current phase component and wires up its advance trigger.
// Handles auto-advance timing for 'auto' phases.
// Defers to the phase component for 'gated' and 'animation' phases.
// =============================================================================

import React, { useEffect } from 'react';
import type { TransitionPhase } from './types.js';
import { PHASE_COMPONENT_MAP } from './registry.js';

interface PhasePlayerProps {
  phase: TransitionPhase;
  onAdvance: () => void;
}

export const PhasePlayer: React.FC<PhasePlayerProps> = ({ phase, onAdvance }) => {
  // Auto-advance: fire onAdvance after `duration` ms.
  // The `phase.id` in the dep array guarantees the timer resets cleanly
  // when the orchestrator moves to a new phase, even within the same transition.
  useEffect(() => {
    if (phase.advanceMode !== 'auto' || !phase.duration) return;
    const timer = setTimeout(onAdvance, phase.duration);
    return () => clearTimeout(timer);
  }, [phase.id, phase.advanceMode, phase.duration, onAdvance]);

  const PhaseComponent = PHASE_COMPONENT_MAP[phase.component];

  if (!PhaseComponent) {
    console.error(
      `[PhasePlayer] Unknown phase component: "${phase.component}". ` +
      `Check PHASE_COMPONENT_MAP in registry.ts.`,
    );
    return null;
  }

  // The component key forces a remount when the phase id changes,
  // so CSS entrance animations re-fire correctly on each new phase.
  return <PhaseComponent key={phase.id} onAdvance={onAdvance} />;
};
