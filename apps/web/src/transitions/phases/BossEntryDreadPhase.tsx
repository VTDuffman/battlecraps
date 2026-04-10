// =============================================================================
// BATTLECRAPS — BOSS ENTRY DREAD PHASE (auto, 1800ms)
// apps/web/src/transitions/phases/BossEntryDreadPhase.tsx
//
// Prepended to the BOSS_ENTRY sequence. Fires for 1800ms before the rule
// briefing CTA appears, deliberately preventing the player from button-mashing
// through the boss introduction. No tap-to-skip — the dread is mandatory.
//
// Shows only the boss's identity and venue. No rules, no CTA. Just weight.
//
// Reads from the LIVE store (currentMarkerIndex) because this fires while
// entering a boss marker — the logical state is already correct here.
// =============================================================================

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore }            from '../../store/useGameStore.js';
import { GAUNTLET }                from '@battlecraps/shared';
import { getFloorByMarkerIndex }   from '@battlecraps/shared';
import { getFloorTheme }           from '../../lib/floorThemes.js';

export const BossEntryDreadPhase: React.FC<PhaseComponentProps> = () => {
  // onAdvance intentionally unused — no interaction in dread phase.
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);

  const boss  = GAUNTLET[currentMarkerIndex]?.boss;
  const floor = getFloorByMarkerIndex(currentMarkerIndex);
  const theme = getFloorTheme(currentMarkerIndex);

  if (!boss) return null;

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

      {/* Star badge — oversized for drama */}
      <div
        className="w-16 h-16 rounded flex items-center justify-center font-pixel text-[28px]"
        style={{
          color:      theme.bossStarColor,
          background: theme.bossStarBg,
          border:     theme.bossStarBorder,
          boxShadow:  theme.bossStarGlow,
        }}
      >
        ★
      </div>

      {/* Venue */}
      <div className="flex flex-col items-center gap-1.5 text-center px-8">
        <div
          className="font-pixel text-[5px] tracking-[0.4em]"
          style={{ color: `${theme.bossTextColor}70` }}
        >
          YOU HAVE BEEN SUMMONED TO
        </div>
        <div
          className="font-pixel text-[10px] tracking-wide"
          style={{
            color:      `${theme.bossTextColor}cc`,
            textShadow: `0 0 20px ${theme.bossTextColor}40`,
          }}
        >
          {floor.bossVenue.toUpperCase()}
        </div>
      </div>

      {/* Boss name — the moment of recognition */}
      <div
        className="font-pixel text-center px-6"
        style={{
          fontSize:   'clamp(20px, 6vw, 28px)',
          color:      theme.bossTextColor,
          textShadow: theme.bossTitleShadow,
        }}
      >
        {boss.name.toUpperCase()}
      </div>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.bossAccentBar }}
      />
    </div>
  );
};
