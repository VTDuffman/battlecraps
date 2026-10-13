// =============================================================================
// BATTLECRAPS — DEV RUN BADGE + OVERLAYS (FB-028)
// apps/web/src/components/DevRunBadge.tsx
//
// Persistent marker shown on Developer Mode runs so a dev run is never mistaken
// for a real one in screenshots, recordings, or feedback. Also mounts the
// dev-only table overlays (dice control, live dev panel), lazy-loaded so players never download
// them. Renders nothing for real runs. Badge sits top-center so it never
// collides with the left/right HUD rows.
// =============================================================================

import React, { Suspense, lazy } from 'react';
import { useGameStore } from '../store/useGameStore.js';

const DevDiceControl = lazy(() => import('./dev/DevDiceControl.js'));
const DevPanel       = lazy(() => import('./dev/DevPanel.js'));

export const DevRunBadge: React.FC = () => {
  const isDevRun = useGameStore((s) => s.isDevRun);
  if (!isDevRun) return null;

  return (
    <>
      <div
        className="absolute top-1 left-1/2 -translate-x-1/2 z-[60] pointer-events-none
                   rounded-full px-3 py-0.5 font-mono text-xs font-bold tracking-widest
                   text-white shadow-lg"
        style={{ backgroundColor: '#d0208a' }}
        aria-label="Developer Mode run"
      >
        DEV RUN
      </div>
      <Suspense fallback={null}>
        <DevDiceControl />
        <DevPanel />
      </Suspense>
    </>
  );
};
