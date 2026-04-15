// =============================================================================
// BATTLECRAPS — TITLE SCREEN PHASE (gated)
// apps/web/src/transitions/phases/TitleScreenPhase.tsx
//
// First-load cinematic shown exactly once per browser (gated by localStorage
// 'bc_title_shown'). Introduces the game to a new player before their first
// roll. Returning players and quick restarts (Play Again) skip this entirely.
//
// Shows:
//   • "BATTLECRAPS" title — massive pixel text with gold glow
//   • Game classification / tagline
//   • Flavor line setting the stakes
//   • "▶ ROLL FOR YOUR LIFE" CTA
//
// Visual tone: Floor 1 colors (the familiar entry point) on a near-black
// background. The felt color bleeds in just enough to signal this is a
// table game before the player has ever seen the table.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { getFloorTheme }           from '../../lib/floorThemes.js';

// Always uses Floor 1 theme — the player hasn't entered any floor yet.
const theme = getFloorTheme(0);

export const TitleScreenPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-8
        border-x-4
      "
      style={{
        background:  `radial-gradient(ellipse at 50% 45%, ${theme.feltPrimary}60 0%, #010101 55%, #000 100%)`,
        borderColor: theme.borderHigh,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />

      {/* Game type badge */}
      <div
        className="font-pixel text-[5px] tracking-[0.5em] border px-5 py-1.5 rounded"
        style={{
          color:       `${theme.accentPrimary}99`,
          borderColor: `${theme.accentDim}40`,
        }}
      >
        A CRAPS ROGUELITE
      </div>

      {/* Title */}
      <div className="flex flex-col items-center gap-3 text-center">
        <h1
          className="font-pixel text-center px-4 leading-none"
          style={{
            fontSize:   'clamp(36px, 11vw, 56px)',
            color:      theme.accentBright,
            textShadow: `
              0 0 30px ${theme.accentBright}90,
              0 0 80px ${theme.accentPrimary}60,
              0 0 140px ${theme.accentPrimary}30
            `,
          }}
        >
          BATTLE<br />CRAPS
        </h1>

        <p
          className="font-mono text-center"
          style={{
            fontSize: '10px',
            color:    `${theme.accentPrimary}70`,
          }}
        >
          Three floors. Nine markers. One shooter standing.
        </p>
      </div>

      {/* Divider */}
      <div
        className="w-16 h-px"
        style={{ background: `${theme.accentDim}40` }}
      />

      {/* Stakes line */}
      <p
        className="font-mono text-center max-w-xs px-8 leading-relaxed"
        style={{
          fontSize: '9px',
          color:    `${theme.accentPrimary}50`,
        }}
      >
        Climb from the VFW Hall to the Penthouse.
        Beat the bosses. Clear the markers.
        Don't seven out.
      </p>

      {/* CTA */}
      <button
        type="button"
        onClick={onAdvance}
        className="
          px-12 py-3.5 rounded
          font-pixel text-[10px] tracking-widest
          border-2
          text-amber-100
          transition-all duration-150 active:scale-95
        "
        style={{
          borderColor: theme.accentPrimary,
          background:  `linear-gradient(180deg, ${theme.feltPrimary}cc 0%, #050505 100%)`,
          boxShadow:   `0 0 24px 6px ${theme.accentPrimary}35`,
        }}
      >
        ▶ ROLL FOR YOUR LIFE
      </button>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.pubAccentBar }}
      />
    </div>
  );
};
