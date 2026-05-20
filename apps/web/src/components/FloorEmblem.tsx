// =============================================================================
// BATTLECRAPS — FLOOR EMBLEM
// apps/web/src/components/FloorEmblem.tsx
//
// A semi-transparent casino-table logo watermark printed on the felt in the
// dice travel zone. Changes with each floor of the Gauntlet — each floor has
// its own thematic font and visual identity, like real casino table branding.
//
// Floors:
//   1 — The Loading Dock : Share Tech Mono (stencil/industrial, street-level)
//   2 — VFW Hall         : Special Elite (typewriter/stencil, military)
//   3 — The Riverboat    : IM Fell English Italic (1800s broadsheet, old-money)
//   4 — The Strip        : Bebas Neue (tall condensed Las Vegas marquee)
//   5 — The Lodge        : UnifrakturMaguntia (occult gothic blackletter)
//   6 — Atlantis         : Cinzel (classical Roman marble-inscription serif)
//   7 — The Station      : Orbitron Bold (geometric space-station sans)
//   8 — The Signal       : Audiowide (alien-tech geometric sans)
//   9 — The Null Space   : Share Tech Mono (phosphor terminal monospace)
//
// Rendered at low opacity so the felt breathing overlay (z-[1]) passes over it
// naturally. pointer-events-none so dice interactions are never blocked.
// =============================================================================

import React from 'react';
import { GAUNTLET, type FloorId } from '@battlecraps/shared';
import { useGameStore, selectHypeTier, type GameState } from '../store/useGameStore.js';
import { getFloorTheme } from '../lib/floorThemes.js';

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

const FLOOR_CONFIGS: Record<FloorId, FloorConfig> = {
  1: {
    roman:         'I',
    displayName:   'LOADING DOCK',
    fontFamily:    '"Share Tech Mono", monospace',
    fontWeight:    400,
    letterSpacing: '0.18em',
    nameSize:      'clamp(28px, 5dvh, 44px)',
    decorTop: (
      <span style={{ fontSize: '0.8em', letterSpacing: '0.12em', opacity: 0.85 }}>
        # # # # # # # # #
      </span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.7em', letterSpacing: '0.14em', opacity: 0.7 }}>
        -- FREIGHT ACCESS --
      </span>
    ),
    color:       'rgba(255, 153, 0, 0.18)',
    textShadow:  '0 0 30px rgba(255, 153, 0, 0.20)',
    subLabel:    'GAUNTLET FLOOR I',
  },

  2: {
    roman:         'II',
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
    subLabel:    'GAUNTLET FLOOR II',
  },

  3: {
    roman:         'III',
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
    subLabel:    'GAUNTLET FLOOR III',
  },

  4: {
    roman:         'IV',
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
    subLabel:    'GAUNTLET FLOOR IV',
  },

  5: {
    roman:         'V',
    displayName:   'THE LODGE',
    fontFamily:    '"UnifrakturMaguntia", serif',
    fontWeight:    400,
    letterSpacing: '0.06em',
    nameSize:      'clamp(32px, 6dvh, 50px)',
    decorTop: (
      <span style={{ fontSize: '0.85em', letterSpacing: '0.30em' }}>
        ✦ &nbsp; ✦ &nbsp; ✦
      </span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.65em', letterSpacing: '0.18em', opacity: 0.75 }}>
        — THE INNER SANCTUM —
      </span>
    ),
    color:      'rgba(201, 148, 58, 0.18)',
    textShadow: '0 0 40px rgba(201, 148, 58, 0.22)',
    subLabel:   'GAUNTLET FLOOR V',
  },

  6: {
    roman:         'VI',
    displayName:   'ATLANTIS',
    fontFamily:    '"Cinzel", serif',
    fontWeight:    400,
    letterSpacing: '0.22em',
    nameSize:      'clamp(38px, 7dvh, 58px)',
    decorTop: (
      <span style={{ fontSize: '0.8em', letterSpacing: '0.30em', opacity: 0.85 }}>
        ≈ &nbsp; ≈ &nbsp; ≈ &nbsp; ≈ &nbsp; ≈
      </span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.65em', letterSpacing: '0.14em', opacity: 0.72 }}>
        ∼ THE THRONE ROOM ∼
      </span>
    ),
    color:      'rgba(0, 201, 160, 0.18)',
    textShadow: '0 0 50px rgba(0, 201, 160, 0.24)',
    subLabel:   'GAUNTLET FLOOR VI',
  },

  7: {
    roman:         'VII',
    displayName:   'THE STATION',
    fontFamily:    '"Orbitron", sans-serif',
    fontWeight:    700,
    letterSpacing: '0.18em',
    nameSize:      'clamp(22px, 4dvh, 36px)',
    decorTop: (
      <span style={{ fontSize: '0.8em', letterSpacing: '0.45em', opacity: 0.80 }}>
        ◦ ○ ◦ ○ ◦
      </span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.60em', letterSpacing: '0.20em', opacity: 0.70 }}>
        ⊕ COMMAND MODULE ⊕
      </span>
    ),
    color:      'rgba(200, 216, 232, 0.18)',
    textShadow: '0 0 40px rgba(200, 216, 232, 0.20)',
    subLabel:   'GAUNTLET FLOOR VII',
  },

  8: {
    roman:         'VIII',
    displayName:   'THE SIGNAL',
    fontFamily:    '"Audiowide", sans-serif',
    fontWeight:    400,
    letterSpacing: '0.14em',
    nameSize:      'clamp(26px, 4.5dvh, 40px)',
    decorTop: (
      <span style={{ fontSize: '0.75em', letterSpacing: '0.35em', opacity: 0.80 }}>
        / / / / / / /
      </span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.62em', letterSpacing: '0.16em', opacity: 0.72 }}>
        {'>> RECEIVING CHAMBER <<'}
      </span>
    ),
    color:      'rgba(57, 255, 20, 0.16)',
    textShadow: '0 0 40px rgba(57, 255, 20, 0.20)',
    subLabel:   'GAUNTLET FLOOR VIII',
  },

  9: {
    roman:         'IX',
    displayName:   'THE NULL SPACE',
    fontFamily:    '"Share Tech Mono", monospace',
    fontWeight:    400,
    letterSpacing: '0.14em',
    nameSize:      'clamp(20px, 3.8dvh, 34px)',
    decorTop: (
      <span style={{ fontSize: '0.75em', letterSpacing: '0.30em', opacity: 0.75 }}>
        _ _ _ _ _ _ _
      </span>
    ),
    decorBottom: (
      <span style={{ fontSize: '0.62em', letterSpacing: '0.18em', opacity: 0.68 }}>
        NULL : CONVERGENCE
      </span>
    ),
    color:      'rgba(0, 0, 0, 0.11)',
    textShadow: '0 1px 4px rgba(0, 0, 0, 0.05)',
    subLabel:   'GAUNTLET FLOOR IX',
  },
};

const selectMarker     = (s: GameState) => s.currentMarkerIndex;
const selectSettleSeq  = (s: GameState) => s._settleSeq;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const EMBLEM_ANIM: Record<2 | 3 | 4, string> = {
  2: 'animate-emblem-heat',
  3: 'animate-emblem-fire',
  4: 'animate-emblem-nuclear',
};

const EMBLEM_TEXT_ANIM: Record<2 | 3 | 4, string> = {
  2: 'animate-emblem-text-heat',
  3: 'animate-emblem-text-fire',
  4: 'animate-emblem-text-nuclear',
};

export const FloorEmblem: React.FC = () => {
  const currentMarkerIndex = useGameStore(selectMarker);
  const hypeTier           = useGameStore(selectHypeTier);
  const settleSeq          = useGameStore(selectSettleSeq);

  const floorNum = (GAUNTLET[currentMarkerIndex]?.floor ?? 1) as FloorId;
  const cfg      = FLOOR_CONFIGS[floorNum];
  if (!cfg) return null;

  const theme         = getFloorTheme(currentMarkerIndex);
  const animClass     = hypeTier !== 0 ? EMBLEM_ANIM[hypeTier] : '';
  const textAnimClass = hypeTier !== 0 ? EMBLEM_TEXT_ANIM[hypeTier] : '';

  // settleSeq is used as React key so both animation elements restart from phase 0
  // at the exact moment the dice land — keeping the glow and text pulse in sync.
  const animKey = `${settleSeq}-${hypeTier}`;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
      aria-hidden
    >
      {/* ── Outer border frame — like the printed border on casino felt ─── */}
      <div
        key={animKey}
        className={`flex flex-col items-center gap-1 px-6 py-4 ${animClass}`}
        style={{
          color:         cfg.color,
          border:        `1px solid ${cfg.color}`,
          borderRadius:  '2px',
          outline:       `3px solid ${cfg.color}`,
          outlineOffset: '5px',
          // Used by animate-emblem-* keyframes for the glow color
          '--emblem-color': theme.accentPrimary,
        } as React.CSSProperties}
      >
        {/* ── Inner text wrapper — scales with hype pulse ────────────────── */}
        <div key={animKey} className={`flex flex-col items-center gap-1 ${textAnimClass}`}>
          {/* ── Floor number label ───────────────────────────────────────── */}
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

          {/* ── Top decoration ───────────────────────────────────────────── */}
          <div
            style={{
              fontFamily: cfg.fontFamily,
              color:      cfg.color,
            }}
          >
            {cfg.decorTop}
          </div>

          {/* ── Main floor name ──────────────────────────────────────────── */}
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

          {/* ── Bottom decoration ────────────────────────────────────────── */}
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
    </div>
  );
};
