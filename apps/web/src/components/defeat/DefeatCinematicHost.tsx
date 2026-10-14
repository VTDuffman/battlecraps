// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC HOST (FB-032)
// apps/web/src/components/defeat/DefeatCinematicHost.tsx
//
// Renders the active boss defeat cinematic (store.pendingDefeat) over the
// table. While it plays, the store holds the GAME_OVER status flip; the
// cinematic's onFinish releases it. Full-screen and input-blocking so nobody
// rolls on a finished run. Mounted in TableBoard.
// =============================================================================

import React from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../../store/useGameStore.js';
import { DEFEAT_CINEMATICS } from './registry.js';

export const DefeatCinematicHost: React.FC = () => {
  const pendingDefeat = useGameStore((s) => s.pendingDefeat);
  const finish        = useGameStore((s) => s.finishDefeatCinematic);

  if (!pendingDefeat) return null;
  const Cinematic = DEFEAT_CINEMATICS[pendingDefeat.id];

  return createPortal(
    <div className="fixed inset-0 z-[130]" role="alert" aria-label="Defeat">
      <Cinematic
        key={pendingDefeat.key}
        line={pendingDefeat.line}
        balanceDueCents={pendingDefeat.balanceDueCents}
        pipTermination={pendingDefeat.pipTermination}
        onFinish={finish}
      />
    </div>,
    document.body,
  );
};
