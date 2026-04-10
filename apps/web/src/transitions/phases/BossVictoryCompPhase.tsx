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

import React from 'react';
import type { PhaseComponentProps } from '../types.js';
import { useGameStore }            from '../../store/useGameStore.js';
import { GAUNTLET }                from '@battlecraps/shared';
import type { CompRewardType }     from '@battlecraps/shared';
import { getFloorTheme }           from '../../lib/floorThemes.js';

// ---------------------------------------------------------------------------
// Reward display strings
// ---------------------------------------------------------------------------

const REWARD_LABELS: Record<CompRewardType, string> = {
  EXTRA_SHOOTER:   "MEMBER'S JACKET",
  HYPE_RESET_HALF: 'SEA LEGS',
  GOLDEN_TOUCH:    'GOLDEN TOUCH',
};

const REWARD_SUBTEXTS: Record<CompRewardType, string> = {
  EXTRA_SHOOTER:
    '+1 SHOOTER this segment — they know you earned your seat.',
  HYPE_RESET_HALF:
    'On Seven Out, Hype resets to half its current value instead of 1.0×.',
  GOLDEN_TOUCH:
    'Your first Come Out roll of the next segment is guaranteed a Natural.',
};

// ---------------------------------------------------------------------------

export const BossVictoryCompPhase: React.FC<PhaseComponentProps> = ({ onAdvance }) => {
  const snapshot = useGameStore((s) => s.celebrationSnapshot);

  const boss  = snapshot ? GAUNTLET[snapshot.markerIndex]?.boss : undefined;
  const theme = snapshot ? getFloorTheme(snapshot.markerIndex) : null;

  if (!boss || !theme) return null;

  const rewardLabel   = REWARD_LABELS[boss.compReward];
  const rewardSubtext = REWARD_SUBTEXTS[boss.compReward];

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen h-[100dvh]
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

      {/* Comp award card */}
      <div
        className="w-full max-w-xs mx-auto py-5 px-6 rounded flex flex-col items-center gap-2"
        style={{
          background: 'rgba(0,0,0,0.65)',
          border:     `2px solid ${theme.bossTextColor}50`,
          boxShadow:  `0 0 30px 4px ${theme.bossTextColor}18`,
        }}
      >
        <div
          className="font-pixel text-[5px] tracking-widest"
          style={{ color: `${theme.bossTextColor}60` }}
        >
          COMP AWARDED
        </div>

        <div
          className="font-pixel text-[15px] text-center mt-1"
          style={{
            color:      theme.bossStarColor,
            textShadow: `0 0 20px ${theme.bossTextColor}60`,
          }}
        >
          {rewardLabel}
        </div>

        <div
          className="h-px w-20 mt-1"
          style={{ background: `${theme.bossTextColor}30` }}
        />

        <p
          className="font-pixel text-[6px] text-center leading-relaxed mt-1"
          style={{ color: `${theme.bossStarColor}80` }}
        >
          {rewardSubtext}
        </p>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onAdvance}
        className="
          px-10 py-3 rounded
          font-pixel text-[8px] tracking-widest
          border-2
          transition-all duration-150 active:scale-95
        "
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
        className="font-pixel text-[5px] tracking-wide text-center px-10"
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
