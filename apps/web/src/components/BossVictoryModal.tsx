// =============================================================================
// BATTLECRAPS — BOSS VICTORY MODAL
// apps/web/src/components/BossVictoryModal.tsx
//
// Shown instead of the normal MarkerCelebration when the player defeats a boss
// marker and enters TRANSITION status.
//
// Flow: Boss fight → TRANSITION → BossVictoryModal → (click) → PubScreen
//
// Reveals the comp reward (Member's Jacket = +1 Shooter) and transitions the
// player to the Seven-Proof Pub. The actual shooter bonus is applied server-side
// by recruit.ts when the player recruits or skips.
//
// Visual tone: triumphant, military honors — earned, not given.
// =============================================================================

import React from 'react';
import type { BossConfig } from '@battlecraps/shared';

interface BossVictoryModalProps {
  boss:           BossConfig;
  onVisitPub:     () => void;
}

export const BossVictoryModal: React.FC<BossVictoryModalProps> = ({
  boss,
  onVisitPub,
}) => {
  const rewardLabel   = REWARD_LABELS[boss.compReward];
  const rewardSubtext = REWARD_SUBTEXTS[boss.compReward];

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen
        flex flex-col items-center justify-center gap-7
        border-x-4 border-amber-900/60
        overflow-hidden
      "
      style={{
        background: 'radial-gradient(ellipse at 50% 35%, #1a0d00 0%, #0d0700 55%, #040201 100%)',
      }}
    >
      {/* Gold top bar — victory earned */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, #92400e 30%, #d97706 50%, #92400e 70%, transparent)',
        }}
      />

      {/* Subtle amber glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 35%, rgba(180,90,0,0.08) 0%, transparent 65%)',
        }}
      />

      {/* ── Defeated badge ──────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 px-8 text-center">
        <div className="font-pixel text-[5px] text-amber-600/60 tracking-[0.3em]">
          ENEMY NEUTRALIZED
        </div>

        <div
          className="font-pixel text-[22px]"
          style={{
            color: '#d97706',
            textShadow: '0 0 40px rgba(217,119,6,0.5), 0 0 80px rgba(146,64,14,0.3)',
          }}
        >
          {boss.name.toUpperCase()}
        </div>

        <div className="font-pixel text-[7px] text-amber-400/50 tracking-widest">
          DEFEATED
        </div>
      </div>

      {/* Divider */}
      <div
        className="w-full max-w-xs h-px mx-auto"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(146,64,14,0.7), transparent)' }}
      />

      {/* ── Comp reward reveal ──────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <div className="font-pixel text-[5px] text-amber-600/50 tracking-widest">
          ── FOR VALOR IN THE HIGH LIMIT ROOM ──
        </div>

        <div
          className="w-full max-w-xs py-4 px-6 rounded"
          style={{
            background: 'rgba(40,20,0,0.8)',
            border: '2px solid rgba(217,119,6,0.4)',
            boxShadow: '0 0 30px 4px rgba(217,119,6,0.15)',
          }}
        >
          <div className="font-pixel text-[7px] text-amber-500/60 mb-1 tracking-wide">
            COMP AWARDED
          </div>
          <div
            className="font-pixel text-[13px] text-amber-200"
            style={{ textShadow: '0 0 20px rgba(217,119,6,0.5)' }}
          >
            {rewardLabel}
          </div>
          <div className="font-pixel text-[6px] text-amber-400/60 mt-1.5 leading-relaxed">
            {rewardSubtext}
          </div>
        </div>
      </div>

      {/* ── Continue button ─────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onVisitPub}
        className="
          px-10 py-3 rounded
          font-pixel text-[8px] tracking-widest
          border-2 border-amber-600
          text-amber-100
          transition-all duration-150 active:scale-95
        "
        style={{
          background: 'linear-gradient(180deg, #78350f 0%, #3d1a00 100%)',
          boxShadow: '0 0 20px 4px rgba(217,119,6,0.25)',
        }}
      >
        ▶ COLLECT & VISIT THE PUB
      </button>

      <p className="font-pixel text-[5px] text-amber-900/50 tracking-wide text-center px-10">
        Your crew awaits at the Seven-Proof Pub.<br />
        Fresh shooters. Fresh trouble.
      </p>

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, #92400e 30%, #d97706 50%, #92400e 70%, transparent)',
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Reward display strings — one per CompRewardType
// ---------------------------------------------------------------------------

const REWARD_LABELS: Record<string, string> = {
  EXTRA_SHOOTER:   "MEMBER'S JACKET",
  HYPE_RESET_HALF: 'SEA LEGS',
  GOLDEN_TOUCH:    'GOLDEN TOUCH',
};

const REWARD_SUBTEXTS: Record<string, string> = {
  EXTRA_SHOOTER:
    '+1 SHOOTER this segment — they know you earned your seat.',
  HYPE_RESET_HALF:
    'On Seven Out, Hype resets to half its current value instead of 1.0×.',
  GOLDEN_TOUCH:
    'Your first Come Out roll of the next segment is guaranteed a Natural.',
};
