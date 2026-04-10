// =============================================================================
// BATTLECRAPS — VICTORY EXPLOSION PHASE (auto, 3000ms)
// apps/web/src/transitions/phases/VictoryExplosionPhase.tsx
//
// First phase of the VICTORY transition. Fires when all 9 gauntlet markers
// have been cleared (the floor 3 boss is defeated). Auto-advances after 3s
// with tap-to-skip.
//
// Shows:
//   • "✦ GAUNTLET CLEARED ✦" header badge
//   • "YOU WIN" title — maximum weight, electric gold glow
//   • Three floor badges confirming all floors were conquered
//
// Visual tone: the darkness of Floor 3 (near-black obsidian) with the electric
// gold that only The Strip uses at full brightness. Three floors of colour
// visible in the floor badges — a visual summary of the whole run.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { FLOORS }                  from '@battlecraps/shared';
import { getFloorTheme }           from '../../lib/floorThemes.js';

// Use Floor 3 as the dominant victory palette.
const theme = getFloorTheme(8);

export const VictoryExplosionPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen h-[100dvh]
        flex flex-col items-center justify-center gap-7
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 40%, ${theme.feltPrimary}cc 0%, #000 65%)`,
        borderColor: theme.borderHigh,
      }}
      onClick={onAdvance}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Header badge */}
      <div
        className="font-pixel text-[7px] tracking-[0.4em]"
        style={{ color: `${theme.accentPrimary}cc` }}
      >
        ✦ GAUNTLET CLEARED ✦
      </div>

      {/* Main title */}
      <h1
        className="font-pixel text-center leading-none px-4"
        style={{
          fontSize:   'clamp(48px, 14vw, 72px)',
          color:      theme.accentBright,
          textShadow: `
            0 0 30px ${theme.accentBright}cc,
            0 0 80px ${theme.accentPrimary}80,
            0 0 160px ${theme.accentPrimary}40
          `,
        }}
      >
        YOU<br />WIN
      </h1>

      {/* Three floor badges — all conquered */}
      <div className="flex items-center gap-3">
        {FLOORS.map((floor) => {
          const ft = getFloorTheme((floor.id - 1) * 3);
          return (
            <div
              key={floor.id}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded"
              style={{
                background:  `${ft.feltPrimary}60`,
                border:      `1px solid ${ft.accentPrimary}60`,
                boxShadow:   `0 0 10px 2px ${ft.accentPrimary}20`,
              }}
            >
              <div
                className="font-pixel text-[4px] tracking-widest"
                style={{ color: `${ft.accentPrimary}cc` }}
              >
                FLOOR {floor.id}
              </div>
              <div
                className="font-pixel text-[7px]"
                style={{ color: ft.accentBright }}
              >
                ✓
              </div>
              <div
                className="font-pixel text-[4px] tracking-wide"
                style={{ color: `${ft.accentDim}cc` }}
              >
                {floor.name.toUpperCase()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tap to skip */}
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
