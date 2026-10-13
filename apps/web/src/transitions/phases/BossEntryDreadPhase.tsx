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

import React, { useEffect }      from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore }            from '../../store/useGameStore.js';
import { GAUNTLET }                from '@battlecraps/shared';
import { getFloorByMarkerIndex }   from '@battlecraps/shared';
import { getFloorTheme }           from '../../lib/floorThemes.js';
import { playBossImpact }          from '../../hooks/useCrowdAudio.js';

/** When the slammed sigil lands — matches the 290ms delays in index.css. */
const IMPACT_MS = 290;

export const BossEntryDreadPhase: React.FC<PhaseComponentProps> = () => {
  // onAdvance intentionally unused — no interaction in dread phase.
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);

  const boss  = GAUNTLET[currentMarkerIndex]?.boss;
  const floor = getFloorByMarkerIndex(currentMarkerIndex);
  const theme = getFloorTheme(currentMarkerIndex);

  // Impact boom as the sigil lands. The Null Space (Floor 9) stays silent,
  // matching the rest of the audio system.
  const isNullSpace = GAUNTLET[currentMarkerIndex]?.floor === 9;
  useEffect(() => {
    if (!boss || isNullSpace) return;
    const t = window.setTimeout(playBossImpact, IMPACT_MS);
    return () => window.clearTimeout(t);
  }, [boss, isNullSpace]);

  if (!boss) return null;

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-5
        border-x-4
        overflow-hidden
        animate-boss-impact-shake
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

      {/* Boss sigil — slams in oversized, lands with a shockwave, then pulses */}
      <div className="relative w-28 h-28 flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-full pointer-events-none animate-boss-shockwave"
          style={{ border: `3px solid ${theme.bossStarColor}`, boxShadow: theme.bossStarGlow }}
          aria-hidden="true"
        />
        <div
          className="w-28 h-28 rounded flex items-center justify-center animate-boss-sigil"
          style={{
            fontSize:   'clamp(52px, 15vw, 64px)',
            lineHeight: 1,
            color:      theme.bossStarColor,
            background: theme.bossStarBg,
            border:     theme.bossStarBorder,
            boxShadow:  theme.bossStarGlow,
          }}
          role="img"
          aria-label={`${boss.name} sigil`}
        >
          {boss.sigil}
        </div>
      </div>

      {/* Venue */}
      <div className="flex flex-col items-center gap-1.5 text-center px-8 animate-boss-reveal-1">
        <div
          className="font-pixel text-[7.5px] tracking-[0.4em]"
          style={{ color: `${theme.bossTextColor}70` }}
        >
          YOU HAVE BEEN SUMMONED TO
        </div>
        <div
          className="font-pixel text-r-15 tracking-wide"
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
        className="font-pixel text-center px-6 animate-boss-reveal-2"
        style={{
          fontSize:   'clamp(30px, 9vw, 42px)',
          color:      theme.bossTextColor,
          textShadow: theme.bossTitleShadow,
        }}
      >
        {boss.name.toUpperCase()}
      </div>

      {/* Dread tagline — boss's opening bark */}
      <div
        className="font-pixel text-[13.5px] tracking-[0.3em] text-center px-8 animate-boss-reveal-3"
        style={{
          color:      `${theme.bossStarColor}cc`,
          textShadow: `0 0 16px ${theme.bossTextColor}40`,
        }}
      >
        {boss.dreadTagline}
      </div>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.bossAccentBar }}
      />
    </div>
  );
};
