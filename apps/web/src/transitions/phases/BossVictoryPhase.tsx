// =============================================================================
// BATTLECRAPS — BOSS VICTORY PHASE (auto, 2000ms)
// apps/web/src/transitions/phases/BossVictoryPhase.tsx
//
// First phase of the BOSS_VICTORY transition — the pure defeat announcement.
// Auto-advances after 2000ms so the player has a beat to absorb the victory
// before the comp reveal (BossVictoryCompPhase) appears.
//
// Phase 5 split: this phase covers the DEFEAT moment. The comp award ceremony
// lives in BossVictoryCompPhase (gated, the second phase).
//
// Reads from celebrationSnapshot (not currentMarkerIndex) to preserve the
// defeated boss's identity during the celebration window — the race condition
// fix that ensures we show the BEATEN boss, not the next marker's state.
//
// Tap-to-skip: subtle "TAP TO CONTINUE" button is present since this is
// auto-advancing (player can skip past the 2s if they've already read it).
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore }            from '../../store/useGameStore.js';
import { GAUNTLET }                from '@battlecraps/shared';
import { getFloorTheme }           from '../../lib/floorThemes.js';

export const BossVictoryPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const snapshot = useGameStore((s) => s.celebrationSnapshot);

  const boss  = snapshot ? GAUNTLET[snapshot.markerIndex]?.boss : undefined;
  const theme = snapshot ? getFloorTheme(snapshot.markerIndex) : null;

  if (!boss || !theme) return null;

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen h-[100dvh]
        flex flex-col items-center justify-center gap-5
        border-x-4
        overflow-hidden
      "
      style={{
        background:  theme.bossBg,
        borderColor: theme.bossBorderColor,
      }}
    >
      {/* Top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: theme.bossAccentBar }}
      />

      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: theme.bossGlow }}
      />

      {/* Defeated badge */}
      <div className="flex flex-col items-center gap-3 px-8 text-center">
        <div
          className="font-pixel text-[5px] tracking-[0.4em]"
          style={{ color: `${theme.bossTextColor}70` }}
        >
          ENEMY NEUTRALIZED
        </div>

        {/* Boss name */}
        <div
          className="font-pixel text-center"
          style={{
            fontSize:   'clamp(24px, 7vw, 36px)',
            color:      theme.bossTextColor,
            textShadow: theme.bossTitleShadow,
          }}
        >
          {boss.name.toUpperCase()}
        </div>

        {/* DEFEATED label */}
        <div
          className="font-pixel text-[11px] tracking-widest"
          style={{
            color:      `${theme.bossStarColor}cc`,
            textShadow: `0 0 16px ${theme.bossTextColor}60`,
          }}
        >
          DEFEATED
        </div>
      </div>

      {/* Tap to skip */}
      <button
        type="button"
        onClick={onAdvance}
        className="absolute bottom-6 font-pixel text-[5px] tracking-widest opacity-30 hover:opacity-60 transition-opacity"
        style={{ color: theme.bossTextColor }}
      >
        TAP TO CONTINUE
      </button>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.bossAccentBar }}
      />
    </div>
  );
};
