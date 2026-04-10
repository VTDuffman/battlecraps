// =============================================================================
// BATTLECRAPS — MARKER CELEBRATION PHASE
// apps/web/src/transitions/phases/MarkerCelebrationPhase.tsx
//
// Phase component shown when a non-boss marker is cleared.
// Reads the marker that was just beaten from celebrationSnapshot (NOT from
// currentMarkerIndex — the snapshot prevents the race condition where the
// already-incremented new marker leaks into the celebration screen).
//
// Phase 3 will enrich this with: the full-screen celebration takeover,
// bankroll delta counter, and floor pip progress display.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore } from '../../store/useGameStore.js';

export const MarkerCelebrationPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const snapshot = useGameStore((s) => s.celebrationSnapshot);

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen h-[100dvh]
        flex flex-col items-center justify-center gap-8
        bg-black border-x-4 border-amber-800/60
      "
      style={{
        background: 'radial-gradient(ellipse at 50% 40%, #2a1500 0%, #0d0700 60%, #000 100%)',
      }}
    >
      {/* Top glow bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, #c47d0a 30%, #f5c842 50%, #c47d0a 70%, transparent)',
        }}
      />

      <div className="flex flex-col items-center gap-4 px-8 text-center">
        <div className="font-pixel text-[8px] text-amber-400/70 tracking-widest">
          ✦ MARKER CLEARED ✦
        </div>

        {/* Show the target that was just cleared from the snapshot */}
        {snapshot && (
          <div className="font-pixel text-[9px] text-amber-600/60 tracking-widest">
            ${(snapshot.targetCents / 100).toLocaleString()} TARGET BEATEN
          </div>
        )}

        <h1
          className="font-pixel text-[20px] tracking-wide"
          style={{
            color: '#f5c842',
            textShadow: '0 0 30px #c47d0a, 0 0 80px #7a4500, 0 0 120px #3d2200',
          }}
        >
          NICE ROLL!
        </h1>

        <p className="font-mono text-[10px] text-amber-300/50 max-w-xs leading-relaxed">
          You&apos;ve hit the marker target. A new shooter and 5 fresh lives await.
          Head to the pub to hire your next crew member.
        </p>
      </div>

      <button
        type="button"
        onClick={onAdvance}
        className="
          px-10 py-3 rounded
          font-pixel text-[9px] tracking-widest
          border-2 border-amber-500
          text-amber-100
          transition-all duration-150 active:scale-95
        "
        style={{
          background: 'linear-gradient(180deg, #7a4500 0%, #3d2200 100%)',
          boxShadow: '0 0 20px 4px rgba(196,125,10,0.3)',
        }}
      >
        ▶ VISIT THE PUB
      </button>

      {/* Bottom glow bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, #c47d0a 30%, #f5c842 50%, #c47d0a 70%, transparent)',
        }}
      />
    </div>
  );
};
