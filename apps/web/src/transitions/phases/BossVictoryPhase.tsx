// =============================================================================
// BATTLECRAPS — BOSS VICTORY PHASE
// apps/web/src/transitions/phases/BossVictoryPhase.tsx
//
// Phase component shown when a boss marker is cleared.
// Derives boss config from celebrationSnapshot.markerIndex (the OLD index —
// the boss that was just beaten) so it never reads the already-incremented
// currentMarkerIndex during the celebration window.
//
// Phase 5 will enrich this with: animated comp reveal, boss portrait defeat
// animation, and delayed CTA for weight.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { BossVictoryModal } from '../../components/BossVictoryModal.js';
import { useGameStore } from '../../store/useGameStore.js';
import { GAUNTLET } from '@battlecraps/shared';

export const BossVictoryPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const snapshot = useGameStore((s) => s.celebrationSnapshot);

  // Read boss config from the snapshot's marker index, not the live store.
  // This prevents the race condition where currentMarkerIndex has already
  // advanced past the boss that was defeated.
  const boss = snapshot ? GAUNTLET[snapshot.markerIndex]?.boss : undefined;

  if (!boss) return null;

  return <BossVictoryModal boss={boss} onVisitPub={onAdvance} />;
};
