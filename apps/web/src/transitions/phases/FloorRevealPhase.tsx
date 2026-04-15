// =============================================================================
// BATTLECRAPS — FLOOR REVEAL PHASE (auto, 3000ms)
// apps/web/src/transitions/phases/FloorRevealPhase.tsx
//
// Chapter-card cinematic shown once when the player enters a new floor (marker
// indices 3 and 6 — after clearing Floor 1 and Floor 2 bosses respectively).
//
// Shows:
//   • "FLOOR N" badge
//   • Floor name (large)
//   • Floor tagline (atmospheric one-liner)
//   • "TAP TO SKIP" affordance
//
// Reads from the LIVE store (currentMarkerIndex) — by the time this fires,
// the pub has been resolved and the logical state already reflects the new
// floor's first marker. The snapshot is NOT relevant here.
//
// Advance mode: 'auto' at 3000ms. Tap-to-skip button calls onAdvance early.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore }            from '../../store/useGameStore.js';
import { getFloorByMarkerIndex }   from '@battlecraps/shared';
import { getFloorTheme }           from '../../lib/floorThemes.js';

export const FloorRevealPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);

  const floor = getFloorByMarkerIndex(currentMarkerIndex);
  const theme = getFloorTheme(currentMarkerIndex);

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-5
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 30%, ${theme.feltPrimary}ff 0%, #030303 70%, #000 100%)`,
        borderColor: theme.borderHigh,
      }}
      onClick={onAdvance}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Floor number badge */}
      <div
        className="font-pixel text-[6px] tracking-[0.5em] border px-5 py-1.5 rounded"
        style={{
          color:       `${theme.accentPrimary}cc`,
          borderColor: `${theme.accentDim}50`,
          background:  `${theme.feltPrimary}30`,
        }}
      >
        FLOOR {floor.id}
      </div>

      {/* Floor name — the chapter title */}
      <h1
        className="font-pixel text-center px-6"
        style={{
          fontSize:   'clamp(28px, 8vw, 44px)',
          color:      theme.accentBright,
          textShadow: `0 0 40px ${theme.accentBright}80, 0 0 100px ${theme.accentPrimary}40`,
          lineHeight: 1.1,
        }}
      >
        {floor.name.toUpperCase()}
      </h1>

      {/* Tagline */}
      <p
        className="font-mono text-center tracking-widest px-10"
        style={{
          fontSize: '11px',
          color:    `${theme.accentPrimary}80`,
        }}
      >
        {floor.tagline}
      </p>

      {/* Tap-to-skip hint */}
      <button
        type="button"
        onClick={onAdvance}
        className="absolute bottom-6 font-pixel text-[5px] tracking-widest opacity-30 hover:opacity-60 transition-opacity"
        style={{ color: theme.accentPrimary }}
      >
        TAP TO CONTINUE
      </button>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />
    </div>
  );
};
