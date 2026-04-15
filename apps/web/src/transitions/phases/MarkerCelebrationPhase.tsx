// =============================================================================
// BATTLECRAPS — MARKER CELEBRATION PHASE
// apps/web/src/transitions/phases/MarkerCelebrationPhase.tsx
//
// Full-screen takeover shown when a non-boss marker is cleared.
// Reads exclusively from celebrationSnapshot (not currentMarkerIndex) so it
// displays the marker that was just BEATEN, not the next target — this is
// the Phase 1 race condition fix in its display form.
//
// Shows:
//   • The target that was beaten
//   • The bankroll delta (profit on the clearing roll)
//   • Floor pip progress (where we are in the floor's 3 markers)
//   • CTA to visit the pub
// =============================================================================

import React from 'react';
import type { PhaseComponentProps }  from '../types.js';
import { useGameStore }              from '../../store/useGameStore.js';
import { getFloorByMarkerIndex }     from '@battlecraps/shared';
import { getFloorTheme }             from '../../lib/floorThemes.js';

export const MarkerCelebrationPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const snapshot = useGameStore((s) => s.celebrationSnapshot);

  // If snapshot is somehow null (shouldn't happen in normal flow), fall back
  // gracefully rather than crashing.
  if (!snapshot) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-black">
        <button
          type="button"
          onClick={onAdvance}
          className="font-pixel text-[9px] text-amber-400 border border-amber-600 px-8 py-3 rounded"
        >
          ▶ VISIT THE PUB
        </button>
      </div>
    );
  }

  const { markerIndex, targetCents, floorId, bankrollBefore, bankrollAfter } = snapshot;

  const theme       = getFloorTheme(markerIndex);
  const floor       = getFloorByMarkerIndex(markerIndex);
  const posInFloor  = markerIndex % 3;          // 0, 1, or 2
  const deltaCents  = bankrollAfter - bankrollBefore;
  const deltaSign   = deltaCents >= 0 ? '+' : '';
  const deltaStr    = `${deltaSign}$${(Math.abs(deltaCents) / 100).toLocaleString()}`;

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-7
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 40%, ${theme.feltPrimary}ee 0%, #060606 65%, #000 100%)`,
        borderColor: theme.borderHigh,
      }}
    >
      {/* Top glow bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Header badge */}
      <div
        className="font-pixel text-[7px] tracking-[0.3em]"
        style={{ color: `${theme.accentPrimary}99` }}
      >
        ✦ MARKER CLEARED ✦
      </div>

      {/* Main headline */}
      <div className="flex flex-col items-center gap-3 text-center">
        <h1
          className="font-pixel text-[22px] tracking-wide"
          style={{
            color:      theme.accentBright,
            textShadow: `0 0 30px ${theme.accentBright}80, 0 0 80px ${theme.accentPrimary}50`,
          }}
        >
          NICE ROLL!
        </h1>

        {/* Target beaten */}
        <div
          className="font-pixel text-[9px] tracking-widest"
          style={{ color: `${theme.accentPrimary}80` }}
        >
          ${(targetCents / 100).toLocaleString()} TARGET CLEARED
        </div>

        {/* Bankroll delta */}
        <div
          className="font-pixel text-[14px]"
          style={{
            color:      deltaCents >= 0 ? theme.accentBright : '#f87171',
            textShadow: `0 0 16px ${deltaCents >= 0 ? theme.accentBright : '#ef4444'}60`,
          }}
        >
          {deltaStr}
        </div>
      </div>

      {/* Floor pip progress */}
      <div className="flex flex-col items-center gap-3">
        <div
          className="font-pixel text-[5px] tracking-widest"
          style={{ color: `${theme.accentDim}80` }}
        >
          FLOOR {floorId} — {floor.name.toUpperCase()}
        </div>

        <div className="flex items-center gap-4">
          {[0, 1, 2].map((i) => {
            const isCleared  = i <= posInFloor;
            const isBossSlot = i === 2;

            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className="w-3.5 h-3.5 rounded-full"
                  style={{
                    background: isCleared
                      ? theme.accentBright
                      : `${theme.accentDim}25`,
                    boxShadow: isCleared
                      ? `0 0 10px 2px ${theme.accentBright}60`
                      : 'none',
                    outline: isBossSlot
                      ? `1px solid ${theme.accentDim}60`
                      : 'none',
                    outlineOffset: '2px',
                  }}
                />
                {isBossSlot && (
                  <div
                    className="font-pixel text-[4px]"
                    style={{ color: `${theme.accentDim}70` }}
                  >
                    BOSS
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Flavour line */}
      <p
        className="font-mono text-[9px] text-center max-w-xs leading-relaxed px-8"
        style={{ color: `${theme.accentPrimary}50` }}
      >
        A new shooter and 5 fresh lives await.
        Head to the pub to hire your next crew member.
      </p>

      {/* CTA */}
      <button
        type="button"
        onClick={onAdvance}
        className="
          px-10 py-3 rounded
          font-pixel text-[9px] tracking-widest
          border-2
          text-amber-100
          transition-all duration-150 active:scale-95
        "
        style={{
          borderColor: theme.accentPrimary,
          background:  `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #0d0700 100%)`,
          boxShadow:   `0 0 20px 4px ${theme.accentPrimary}30`,
        }}
      >
        ▶ VISIT THE PUB
      </button>

      {/* Bottom glow bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />
    </div>
  );
};
