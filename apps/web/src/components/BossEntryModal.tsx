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
  const theme = getFloorTheme(markerIndex);

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

      {/* ── Entry lines — boss dialogue ──────────────────────────────────────── */}
      <div
        className="px-8 py-4 mx-6 rounded"
        style={{
          background: 'rgba(0,0,0,0.55)',
          border:     `1px solid ${theme.bossBorderColor}`,
        }}
      >
        {boss.entryLines.map((line, i) => (
          <p
            key={i}
            className="font-mono text-[9px] text-center leading-relaxed italic"
            style={{ color: `${theme.bossTextColor}99` }}
          >
            {i === 0 ? <>&ldquo;{line}</> : i === boss.entryLines.length - 1 ? <>{line}&rdquo;</> : line}
          </p>
        ))}
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
        <p className="font-mono text-[8px] text-center leading-snug" style={{ color: `${theme.bossTextColor}80` }}>
          {boss.ruleBlurb}
        </p>
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


