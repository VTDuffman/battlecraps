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

  return (
    <div
      className="
        relative w-full max-w-lg mx-auto min-h-screen
        flex flex-col items-center justify-center gap-6
        border-x-4 border-red-900/60
        overflow-hidden
      "
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, #1a0800 0%, #0d0400 55%, #050201 100%)',
      }}
    >
      {/* Ominous red top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, #7f1d1d 30%, #dc2626 50%, #7f1d1d 70%, transparent)',
        }}
      />

      {/* Flickering red glow behind content */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 40%, rgba(180,20,20,0.08) 0%, transparent 65%)',
        }}
      />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-3 px-8 text-center">
        {/* Star badge */}
        <div
          className="w-12 h-12 rounded flex items-center justify-center font-pixel text-[18px] text-red-400"
          style={{
            background: 'rgba(127,29,29,0.4)',
            border: '2px solid rgba(220,38,38,0.5)',
            boxShadow: '0 0 20px 4px rgba(220,38,38,0.2)',
          }}
        >
          ★
        </div>

        <div className="font-pixel text-[6px] text-red-500/70 tracking-[0.3em]">
          YOU HAVE BEEN SUMMONED TO
        </div>

        <h1
          className="font-pixel text-[16px] tracking-wide"
          style={{
            color: '#dc2626',
            textShadow: '0 0 30px rgba(220,38,38,0.6), 0 0 80px rgba(127,29,29,0.4)',
          }}
        >
          THE HIGH LIMIT ROOM
        </h1>

        <div className="font-pixel text-[9px] text-red-300/80 tracking-widest">
          {boss.name.toUpperCase()}
        </div>
      </div>

      {/* ── Flavor text ─────────────────────────────────────────────────────── */}
      <div
        className="px-8 py-4 mx-6 rounded"
        style={{
          background: 'rgba(30,10,0,0.7)',
          border: '1px solid rgba(127,29,29,0.4)',
        }}
      >
        <p className="font-mono text-[9px] text-red-200/60 text-center leading-relaxed italic">
          &ldquo;{boss.flavorText}&rdquo;
        </p>
        <div
          className="mt-1 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(127,29,29,0.5), transparent)' }}
        />
        <p className="mt-2 font-pixel text-[5px] text-red-400/40 text-center tracking-wide">
          — {boss.name}
        </p>
      </div>

      {/* ── Rule briefing ───────────────────────────────────────────────────── */}
      <div className="px-8 w-full max-w-xs">
        <div className="font-pixel text-[5px] text-red-500/60 tracking-widest mb-2 text-center">
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
          border-2 border-red-700
          text-red-200
          transition-all duration-150 active:scale-95
        "
        style={{
          background: 'linear-gradient(180deg, #7f1d1d 0%, #450a0a 100%)',
          boxShadow: '0 0 20px 4px rgba(185,28,28,0.3)',
        }}
      >
        ▶ ENTER THE ROOM
      </button>

      <p className="font-pixel text-[5px] text-red-900/60 tracking-wide text-center px-8">
        There is no shame in surviving this far.<br />
        There will be, if you leave early.
      </p>

      {/* Bottom bar */}
      <div
        className="absolute bottom-0 left-0 right-0 h-1"
        style={{
          background: 'linear-gradient(90deg, transparent, #7f1d1d 30%, #dc2626 50%, #7f1d1d 70%, transparent)',
        }}
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

