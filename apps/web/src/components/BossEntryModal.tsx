// =============================================================================
// BATTLECRAPS — BOSS ENTRY MODAL
// apps/web/src/components/BossEntryModal.tsx
//
// Shown ONCE when the player first enters a boss marker after the pub.
// Preceded by a normal MarkerCelebration (the honor of making it this far).
// This screen adds the dread — "you have been summoned to the High Limit Room."
//
// Visual tone: dark olive, muted red — militaristic, ominous, not quite safe.
// =============================================================================

import React from 'react';
import type { BossConfig } from '@battlecraps/shared';
import { getBossMinBet, GAUNTLET } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { getFloorTheme } from '../lib/floorThemes.js';

interface BossEntryModalProps {
  boss:        BossConfig;
  markerIndex: number;
  onEnter:     () => void;
}

export const BossEntryModal: React.FC<BossEntryModalProps> = ({
  boss,
  markerIndex,
  onEnter,
}) => {
  const bossPointHits  = useGameStore((s) => s.bossPointHits);
  const startingMinBet = getBossMinBet(markerIndex, bossPointHits);
  const theme          = getFloorTheme(markerIndex);

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen
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

      {/* Ambient glow behind content */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: theme.bossGlow }}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 px-8 text-center">
        {/* Star badge */}
        <div
          className="w-12 h-12 rounded flex items-center justify-center font-pixel text-[18px]"
          style={{
            color:      theme.bossStarColor,
            background: theme.bossStarBg,
            border:     theme.bossStarBorder,
            boxShadow:  theme.bossStarGlow,
          }}
        >
          ★
        </div>

        <div className="font-pixel text-[6px] tracking-[0.3em]" style={{ color: `${theme.bossTextColor}b3` }}>
          YOU HAVE BEEN SUMMONED TO
        </div>

        <h1
          className="font-pixel text-[16px] tracking-wide"
          style={{
            color:      theme.bossTextColor,
            textShadow: theme.bossTitleShadow,
          }}
        >
          THE HIGH LIMIT ROOM
        </h1>

        <div className="font-pixel text-[9px] tracking-widest" style={{ color: `${theme.bossTextColor}cc` }}>
          {boss.name.toUpperCase()}
        </div>
      </div>

      {/* ── Flavor text ─────────────────────────────────────────────────────── */}
      <div
        className="px-8 py-4 mx-6 rounded"
        style={{
          background: 'rgba(0,0,0,0.55)',
          border:     `1px solid ${theme.bossBorderColor}`,
        }}
      >
        <p className="font-mono text-[9px] text-center leading-relaxed italic" style={{ color: `${theme.bossTextColor}99` }}>
          &ldquo;{boss.flavorText}&rdquo;
        </p>
        <div
          className="mt-1 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${theme.bossBorderColor}, transparent)` }}
        />
        <p className="mt-2 font-pixel text-[5px] text-center tracking-wide" style={{ color: `${theme.bossTextColor}66` }}>
          — {boss.name}
        </p>
      </div>

      {/* ── Rule briefing ───────────────────────────────────────────────────── */}
      <div className="px-8 w-full max-w-xs">
        <div className="font-pixel text-[5px] tracking-widest mb-2 text-center" style={{ color: `${theme.bossTextColor}99` }}>
          ── HOUSE RULES ──
        </div>

        {boss.rule === 'RISING_MIN_BETS' && boss.risingMinBets && (
          <div className="space-y-1.5">
            <RuleRow icon="⬆" text={`Minimum Pass Line bet starts at $${startingMinBet !== null ? (startingMinBet / 100).toFixed(0) : '—'}`} />
            <RuleRow icon="⬆" text={`Rises by ${(boss.risingMinBets.incrementPct * 100).toFixed(0)}% of target each Point Hit`} />
            <RuleRow icon="⏸" text="Min-bet HOLDS on a Seven Out — the floor never drops" />
            <RuleRow icon="⚠" text={`Caps at $${Math.round(((GAUNTLET[markerIndex]?.targetCents ?? 0) * boss.risingMinBets.capPct) / 100)}`} danger />
          </div>
        )}
      </div>

      {/* ── Enter button ────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={onEnter}
        className="
          px-10 py-3 rounded
          font-pixel text-[8px] tracking-widest
          border-2
          transition-all duration-150 active:scale-95
        "
        style={{
          color:      theme.bossStarColor,
          borderColor: theme.bossTextColor,
          background: `linear-gradient(180deg, ${theme.bossStarBg} 0%, rgba(0,0,0,0.8) 100%)`,
          boxShadow:  theme.bossStarGlow,
        }}
      >
        ▶ ENTER THE ROOM
      </button>

      <p className="font-pixel text-[5px] tracking-wide text-center px-8" style={{ color: `${theme.bossTextColor}4d` }}>
        There is no shame in surviving this far.<br />
        There will be, if you leave early.
      </p>

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{ background: theme.bossAccentBar }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Rule row helper
// ---------------------------------------------------------------------------

const RuleRow: React.FC<{ icon: string; text: string; danger?: boolean }> = ({ icon, text, danger }) => (
  <div className="flex items-start gap-2">
    <span className={`font-pixel text-[7px] flex-none mt-0.5 ${danger ? 'text-red-400' : 'text-red-600/70'}`}>
      {icon}
    </span>
    <span className={`font-mono text-[8px] leading-snug ${danger ? 'text-red-300/80' : 'text-red-400/60'}`}>
      {text}
    </span>
  </div>
);

