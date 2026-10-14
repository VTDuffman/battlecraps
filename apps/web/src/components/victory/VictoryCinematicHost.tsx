// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC HOST (FB-033)
// apps/web/src/components/victory/VictoryCinematicHost.tsx
//
// Renders the active boss victory cinematic (store.pendingVictory) over the
// table while the celebration is held. Non-blocking (the table is already in
// its post-roll celebration state). Mounted in TableBoard; if the table
// unmounts early (the celebration took over), the pending cinematic is
// cleared so it never replays later.
// =============================================================================

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../../store/useGameStore.js';
import { VICTORY_CINEMATICS } from './registry.js';

export const VictoryCinematicHost: React.FC = () => {
  const pendingVictory = useGameStore((s) => s.pendingVictory);
  const finish         = useGameStore((s) => s.finishVictoryCinematic);

  // Clear on unmount so a cut-short cinematic can't resurface on the next table.
  useEffect(() => () => { useGameStore.getState().finishVictoryCinematic(); }, []);

  if (!pendingVictory) return null;
  const Cinematic = VICTORY_CINEMATICS[pendingVictory.id];

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[125]" role="status" aria-label="Victory">
      <Cinematic key={pendingVictory.key} line={pendingVictory.line} onFinish={finish} />
    </div>,
    document.body,
  );
};
