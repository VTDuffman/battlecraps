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

const CloseIcon: React.FC = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
  </svg>
);

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
  const [collapsed, setCollapsed] = useState(true);

  const open  = () => setCollapsed(false);
  const close = () => setCollapsed(true);

  return (
    <>
      {/* ── Background scrim (tap to close) ─────────────────────────────── */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={close}
          aria-hidden="true"
        />
      )}

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
        {/* ── Grab handle (open state only) ───────────────────────────────── */}
        {!collapsed && (
          <div className="flex justify-center pt-2 pb-0.5">
            <div className="w-12 h-1.5 bg-white/20 rounded-full" />
          </div>
        )}

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="w-full flex items-center justify-between px-2 py-1 border-b border-gold/20">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="
              font-pixel text-[7px] text-gold/70 tracking-widest
              hover:text-gold transition-colors
              cursor-pointer
            "
          >
            ROLL LOG
          </button>

          {/* Close (×) when open; expand (▲) when collapsed */}
          <button
            type="button"
            onClick={collapsed ? open : close}
            aria-label={collapsed ? 'Open roll log' : 'Close roll log'}
            className="
              flex items-center justify-center
              min-w-[44px] min-h-[44px]
              -mr-2 -my-1
              text-white/40 hover:text-white transition-colors
              cursor-pointer
            "
          >
            {collapsed
              ? <span className="text-[8px]">▲</span>
              : <CloseIcon />
            }
          </button>
        </div>

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
    </>
  );
};
