// =============================================================================
// BATTLECRAPS — FLOOR EMBLEM
// apps/web/src/components/FloorEmblem.tsx
//
// A semi-transparent casino-table logo watermark printed on the felt in the
// dice travel zone. Changes with each floor of the Gauntlet — each floor has
// its own thematic font and visual identity, like real casino table branding.
//
// Floors:
//   1 — VFW Hall      : Special Elite (typewriter/stencil, military)
//   2 — The Riverboat : IM Fell English Italic (1800s broadsheet, old-money)
//   3 — The Strip     : Bebas Neue (tall condensed Las Vegas marquee)
//
// Rendered at low opacity so the felt breathing overlay (z-[1]) passes over it
// naturally. pointer-events-none so dice interactions are never blocked.
// =============================================================================

import React from 'react';
import { GAUNTLET } from '@battlecraps/shared';
import { useGameStore, type GameState } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Per-floor emblem configuration
// ---------------------------------------------------------------------------

interface FloorConfig {
  roman:        string;
  displayName:  string;
  fontFamily:   string;
  fontStyle?:   string;
  fontWeight?:  string | number;
  letterSpacing?: string;
  nameSize:     string;
  /** Decorative line above the name */
  decorTop:     React.ReactNode;
  /** Decorative line below the name */
  decorBottom:  React.ReactNode;
  /** Base color (applied to all text) */
  color:        string;
  /** Optional CSS text-shadow on the main name */
  textShadow?:  string;
  /** Sub-label line shown below the name (optional) */
  subLabel?:    string;
}

const FLOOR_CONFIGS: Record<number, FloorConfig> = {
  1: {
    roman:         'I',
    displayName:   'VFW HALL',
    fontFamily:    '"Special Elite", serif',
    fontWeight:    400,
    letterSpacing: '0.1em',
    nameSize:      'clamp(34px, 6.5dvh, 52px)',
    decorTop: (
      <span style={{ fontSize: '0.9em', letterSpacing: '0.4em' }}>★ ★ ★</span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.7em', letterSpacing: '0.2em', opacity: 0.7 }}>
        — HIGH STAKES —
      </span>
    ),
    color:       'rgba(162, 138, 68, 0.20)',
    subLabel:    'GAUNTLET FLOOR I',
  },

  2: {
    roman:         'II',
    displayName:   'The Riverboat',
    fontFamily:    '"IM Fell English", serif',
    fontStyle:     'italic',
    fontWeight:    400,
    letterSpacing: '0.04em',
    nameSize:      'clamp(30px, 5.5dvh, 46px)',
    decorTop: (
      <span style={{ fontSize: '0.85em', letterSpacing: '0.35em', fontStyle: 'normal' }}>
        ♦ &nbsp; ♦ &nbsp; ♦
      </span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.7em', letterSpacing: '0.08em', fontStyle: 'normal', opacity: 0.75 }}>
        ∿ ∿ ∿ &nbsp; Salon Privé &nbsp; ∿ ∿ ∿
      </span>
    ),
    color:       'rgba(20, 158, 148, 0.20)',
    textShadow:  '0 0 40px rgba(20, 158, 148, 0.25)',
    subLabel:    'GAUNTLET FLOOR II',
  },

  3: {
    roman:         'III',
    displayName:   'THE STRIP',
    fontFamily:    '"Bebas Neue", sans-serif',
    fontWeight:    400,
    letterSpacing: '0.14em',
    nameSize:      'clamp(52px, 10dvh, 76px)',
    decorTop: (
      <span style={{ fontSize: '0.75em', letterSpacing: '0.5em' }}>· · · · · · ·</span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.75em', letterSpacing: '0.5em' }}>· · · · · · ·</span>
    ),
    color:       'rgba(245, 200, 66, 0.18)',
    textShadow:  '0 0 60px rgba(245, 200, 66, 0.30), 0 0 20px rgba(255, 80, 180, 0.20)',
    subLabel:    'GAUNTLET FLOOR III',
  },
};

const selectMarker = (s: GameState) => s.currentMarkerIndex;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const FloorEmblem: React.FC = () => {
  const currentMarkerIndex = useGameStore(selectMarker);

  const floorNum = GAUNTLET[currentMarkerIndex]?.floor ?? 1;
  const cfg      = FLOOR_CONFIGS[floorNum];
  if (!cfg) return null;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      aria-hidden
    >
      {/* ── Outer border frame — like the printed border on casino felt ─── */}
      <div
        className="flex flex-col items-center gap-1 px-6 py-4"
        style={{
          color:   cfg.color,
          border:  `1px solid ${cfg.color}`,
          borderRadius: '2px',
          // Soft double-border effect via outline
          outline: `3px solid ${cfg.color}`,
          outlineOffset: '5px',
        }}
      >
        {/* ── Floor number label ─────────────────────────────────────────── */}
        <div
          style={{
            fontFamily:    '"Press Start 2P", monospace',
            fontSize:      'clamp(5px, 1dvh, 7px)',
            color:         cfg.color,
            letterSpacing: '0.3em',
            opacity:       0.9,
          }}
        >
          {cfg.subLabel ?? `GAUNTLET FLOOR ${cfg.roman}`}
        </div>

        {/* ── Top decoration ─────────────────────────────────────────────── */}
        <div
          style={{
            fontFamily: cfg.fontFamily,
            color:      cfg.color,
          }}
        >
          {cfg.decorTop}
        </div>

        {/* ── Main floor name ────────────────────────────────────────────── */}
        <div
          style={{
            fontFamily:    cfg.fontFamily,
            fontStyle:     cfg.fontStyle   ?? 'normal',
            fontWeight:    cfg.fontWeight  ?? 400,
            fontSize:      cfg.nameSize,
            letterSpacing: cfg.letterSpacing ?? '0.05em',
            color:         cfg.color,
            textShadow:    cfg.textShadow,
            lineHeight:    1.0,
          }}
        >
          {cfg.displayName}
        </div>

        {/* ── Bottom decoration ──────────────────────────────────────────── */}
        <div
          style={{
            fontFamily: cfg.fontFamily,
            color:      cfg.color,
          }}
        >
          {cfg.decorBottom}
        </div>
      </div>
    </div>
  );
};
