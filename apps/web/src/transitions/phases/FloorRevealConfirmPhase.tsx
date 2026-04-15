// =============================================================================
// BATTLECRAPS — FLOOR REVEAL CONFIRM PHASE (gated)
// apps/web/src/transitions/phases/FloorRevealConfirmPhase.tsx
//
// The second phase of the FLOOR_REVEAL transition. Follows FloorRevealPhase
// after auto-advance completes (or the player taps through early).
//
// Shows:
//   • Floor name and floor number (header)
//   • introLines — 2–3 sentences of atmospheric flavor text
//   • Boss teaser — ominous one-liner about the floor's final boss
//   • CTA button to enter the floor
//
// Reads from the LIVE store (currentMarkerIndex) — same reasoning as
// FloorRevealPhase: the pub has resolved, live state is correct.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore }            from '../../store/useGameStore.js';
import { getFloorByMarkerIndex }   from '@battlecraps/shared';
import { getFloorTheme }           from '../../lib/floorThemes.js';

export const FloorRevealConfirmPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);

  const floor = getFloorByMarkerIndex(currentMarkerIndex);
  const theme = getFloorTheme(currentMarkerIndex);

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-6
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 25%, ${theme.feltPrimary}dd 0%, #030303 60%, #000 100%)`,
        borderColor: theme.borderHigh,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Header */}
      <div className="flex flex-col items-center gap-1 text-center">
        <div
          className="font-pixel text-[6px] tracking-[0.4em]"
          style={{ color: `${theme.accentDim}aa` }}
        >
          FLOOR {floor.id}
        </div>
        <h2
          className="font-pixel text-[18px] tracking-wide"
          style={{
            color:      theme.accentBright,
            textShadow: `0 0 20px ${theme.accentBright}60`,
          }}
        >
          {floor.name.toUpperCase()}
        </h2>
      </div>

      {/* Divider */}
      <div
        className="w-24 h-px"
        style={{ background: `${theme.accentDim}40` }}
      />

      {/* Intro lines */}
      <div className="flex flex-col gap-3 px-10 max-w-sm text-center">
        {floor.introLines.map((line, i) => (
          <p
            key={i}
            className="font-mono leading-relaxed"
            style={{
              fontSize: '10px',
              color:    `${theme.accentPrimary}${i === 0 ? 'bb' : i === 1 ? '90' : '65'}`,
            }}
          >
            {line}
          </p>
        ))}
      </div>

      {/* Boss teaser block */}
      <div
        className="mx-8 px-5 py-3 rounded text-center"
        style={{
          background:  'rgba(0,0,0,0.55)',
          border:      `1px solid ${theme.bossBorderColor}`,
        }}
      >
        <div
          className="font-pixel text-[5px] tracking-widest mb-1.5"
          style={{ color: `${theme.bossTextColor}80` }}
        >
          ★ {floor.bossName.toUpperCase()} — {floor.bossTitle.toUpperCase()}
        </div>
        <p
          className="font-mono italic"
          style={{
            fontSize: '9px',
            color:    `${theme.bossTextColor}90`,
          }}
        >
          {floor.bossTeaser}
        </p>
      </div>

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
        ▶ ENTER {floor.name.toUpperCase()}
      </button>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />
    </div>
  );
};
