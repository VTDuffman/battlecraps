// =============================================================================
// BATTLECRAPS — ROLL LOG
// apps/web/src/components/RollLog.tsx
//
// QA Transaction Log — a fixed, scrollable overlay panel in the bottom-right
// corner that displays the last 50 roll receipts, newest at the top.
//
// Colour coding:
//   'roll'  → white/gray  — dice result headline
//   'win'   → green       — payout line
//   'loss'  → red         — cleared / lost bet
//   'info'  → yellow      — modifier note (Hype, crew bonus)
//
// The panel is always visible during play. Scroll to audit older rolls.
// =============================================================================

import React, { useState } from 'react';
import type { RollReceipt, RollReceiptLine, RollReceiptLineKind } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Line colour map
// ---------------------------------------------------------------------------

const LINE_COLOUR: Record<RollReceiptLineKind, string> = {
  roll:  'text-white/80',
  win:   'text-green-400',
  loss:  'text-red-400',
  info:  'text-yellow-400',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ReceiptLine: React.FC<{ line: RollReceiptLine }> = ({ line }) => (
  <div className={`leading-tight ${LINE_COLOUR[line.kind]}`}>
    {line.kind === 'win'  && <span className="mr-1 select-none">+</span>}
    {line.kind === 'loss' && <span className="mr-1 select-none">−</span>}
    {line.text}
  </div>
);

const ReceiptEntry: React.FC<{ receipt: RollReceipt }> = ({ receipt }) => {
  const isWin  = receipt.netDelta > 0;
  const isLoss = receipt.netDelta < 0;

  const deltaColour = isWin ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-white/40';
  const deltaStr = isWin
    ? `+$${(receipt.netDelta / 100).toFixed(2)}`
    : isLoss
    ? `-$${(Math.abs(receipt.netDelta) / 100).toFixed(2)}`
    : '—';

  // Display time as HH:MM:SS
  const time = new Date(receipt.timestamp).toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div className="py-1.5 border-b border-white/10 last:border-0">
      {/* Timestamp */}
      <div className="text-[8px] text-white/30 mb-0.5 font-mono">{time}</div>

      {/* Receipt lines */}
      {receipt.lines.map((line, i) => (
        <ReceiptLine key={i} line={line} />
      ))}

      {/* Net delta */}
      <div className={`mt-0.5 font-semibold ${deltaColour}`}>
        Net: {deltaStr}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export const RollLog: React.FC = () => {
  const rollHistory = useGameStore((s) => s.rollHistory);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="
        fixed bottom-4 right-4 z-50
        w-56
        bg-black/75 backdrop-blur-sm
        border border-gold/30
        rounded
        text-[9px] font-mono
        shadow-lg shadow-black/60
        select-none
      "
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="
          w-full flex items-center justify-between
          px-2 py-1
          border-b border-gold/20
          font-pixel text-[7px] text-gold/70 tracking-widest
          hover:text-gold transition-colors
          cursor-pointer
        "
      >
        <span>ROLL LOG</span>
        <span className="text-[8px] text-white/40">{collapsed ? '▲' : '▼'}</span>
      </button>

      {/* ── Scrollable receipt list ──────────────────────────────────────── */}
      {!collapsed && (
        <div className="max-h-[30dvh] overflow-y-auto overscroll-contain px-2">
          {rollHistory.length === 0 ? (
            <div className="py-3 text-center text-white/30 italic">
              No rolls yet.
            </div>
          ) : (
            rollHistory.map((receipt) => (
              <ReceiptEntry key={receipt.timestamp} receipt={receipt} />
            ))
          )}
        </div>
      )}
    </div>
  );
};
