// =============================================================================
// BATTLECRAPS — BOSS VICTORY COMP PHASE (gated)
// apps/web/src/transitions/phases/BossVictoryCompPhase.tsx
//
// Second phase of the BOSS_VICTORY transition. Shown after BossVictoryPhase
// (the defeat announcement auto-phase). This is the ceremonial comp reveal —
// what the player EARNED for surviving the High Limit Room.
//
// Shows:
//   • "FOR VALOR IN THE HIGH LIMIT ROOM" header
//   • Comp award badge with reward name and description
//   • "COLLECT & VISIT THE PUB" CTA
//
// Reads from celebrationSnapshot (not live store) to preserve the boss identity
// for the correct defeated marker, not the already-incremented next marker.
// =============================================================================

import React, { useState, useEffect } from 'react';
import type { PhaseComponentProps }    from '../types.js';
import { useGameStore }                from '../../store/useGameStore.js';
import { GAUNTLET }                    from '@battlecraps/shared';
import { getFloorTheme }               from '../../lib/floorThemes.js';
import { CompCard, getCompForBossMarker } from '../../components/CompCard.js';

export const BossVictoryCompPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const snapshot = useGameStore((s) => s.celebrationSnapshot);

  const boss     = snapshot ? GAUNTLET[snapshot.markerIndex]?.boss : undefined;
  const theme    = snapshot ? getFloorTheme(snapshot.markerIndex) : null;
  const compDef  = snapshot ? getCompForBossMarker(snapshot.markerIndex) : undefined;

  const [showCard,   setShowCard]   = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setShowCard(true),   600);
    const t2 = setTimeout(() => setShowButton(true), 1400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!boss || !theme) return null;

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-[100dvh]
        flex flex-col items-center justify-center gap-6
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

      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center px-8">
        <div
          className="font-pixel text-[5px] tracking-[0.35em]"
          style={{ color: `${theme.bossTextColor}70` }}
        >
          FOR VALOR IN THE HIGH LIMIT ROOM
        </div>
        <div
          className="font-pixel text-[9px] tracking-widest"
          style={{ color: `${theme.bossTextColor}b0` }}
        >
          {boss.name.toUpperCase()} — DEFEATED
        </div>
      </div>

      {/* Comp award card — large cinematic version, drops in after header */}
      {showCard && (
        <CompCard
          variant="cinematic"
          name={boss.compName}
          icon={compDef?.icon ?? '★'}
          effect={boss.compDescription}
          accentColor={compDef?.accentColor ?? theme.bossStarColor}
          className="animate-comp-deal-in"
        />
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={onAdvance}
        className={`
          px-10 py-3 rounded
          font-pixel text-[8px] tracking-widest
          border-2
          transition-all duration-150 active:scale-95
          transition-opacity duration-500
          ${showButton ? 'opacity-100' : 'opacity-0'}
        `}
        style={{
          color:       theme.bossStarColor,
          borderColor: theme.bossTextColor,
          background:  `linear-gradient(180deg, ${theme.bossStarBg} 0%, rgba(0,0,0,0.8) 100%)`,
          boxShadow:   theme.bossStarGlow,
        }}
      >
        ▶ COLLECT &amp; VISIT THE PUB
      </button>

      <p
        className={`font-pixel text-[5px] tracking-wide text-center px-10 transition-opacity duration-500 ${showButton ? 'opacity-100' : 'opacity-0'}`}
        style={{ color: `${theme.bossTextColor}40` }}
      >
        Your crew awaits at the pub.<br />
        Fresh shooters. Fresh trouble.
      </p>

      {/* Bottom accent bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.bossAccentBar }}
      />
    </div>
  );
};
