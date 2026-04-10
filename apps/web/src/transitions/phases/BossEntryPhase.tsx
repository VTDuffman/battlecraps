// =============================================================================
// BATTLECRAPS — BOSS ENTRY PHASE
// apps/web/src/transitions/phases/BossEntryPhase.tsx
//
// Phase component shown once when the player enters a boss marker after the pub.
// Reads boss config from the LIVE currentMarkerIndex (not a snapshot) because
// this transition happens AFTER celebration — the player is entering a new
// marker, not leaving one. The live state is correct here.
//
// Phase 5 will enrich this with: 1.8s auto dread phase before the CTA appears,
// rule icon visuals, and more dramatic boss name reveal animation.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { BossEntryModal } from '../../components/BossEntryModal.js';
import { useGameStore } from '../../store/useGameStore.js';
import { GAUNTLET } from '@battlecraps/shared';

export const BossEntryPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  const boss = GAUNTLET[currentMarkerIndex]?.boss;

  if (!boss) return null;

  return (
    <BossEntryModal
      boss={boss}
      markerIndex={currentMarkerIndex}
      onEnter={onAdvance}
    />
  );
};
