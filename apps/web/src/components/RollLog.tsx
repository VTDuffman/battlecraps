// =============================================================================
// BATTLECRAPS — ROLL LOG
// apps/web/src/components/RollLog.tsx
//
// Bottom Sheet Drawer — "View Log" trigger opens a panel occupying the bottom
// 60% of the screen. The drawer body carries data-tutorial-zone="roll-log".
//
// Colour coding:
//   'roll'  → white       — dice result headline
//   'win'   → green-400   — payout line
//   'loss'  → red-400     — cleared / lost bet
//   'info'  → yellow-400  — modifier note (Hype, crew bonus)
// =============================================================================

import React, { useState } from 'react';
import type { RollReceipt, RollReceiptLine, RollReceiptLineKind } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';

// ---------------------------------------------------------------------------
// Line colour map
// ---------------------------------------------------------------------------

const LINE_COLOUR: Record<RollReceiptLineKind, string> = {
  roll:  'text-white',
  win:   'text-green-400',
  loss:  'text-red-400',
  info:  'text-yellow-400',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ReceiptLine: React.FC<{ line: RollReceiptLine }> = ({ line }) => (
  <div className={`leading-snug font-dense ${LINE_COLOUR[line.kind]}`}>
    {line.kind === 'win'  && <span className="mr-1 select-none">+</span>}
    {line.kind === 'loss' && <span className="mr-1 select-none">−</span>}
    {line.text}
  </div>
);

const ReceiptEntry: React.FC<{ receipt: RollReceipt }> = ({ receipt }) => {
  const isWin  = receipt.netDelta > 0;
  const isLoss = receipt.netDelta < 0;

  const deltaColour = isWin ? 'text-green-400' : isLoss ? 'text-red-400' : 'text-gray-200';
  const deltaStr = isWin
    ? `+$${(receipt.netDelta / 100).toFixed(2)}`
    : isLoss
    ? `-$${(Math.abs(receipt.netDelta) / 100).toFixed(2)}`
    : '—';

  const time = new Date(receipt.timestamp).toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div className="py-2 border-b border-white/10 last:border-0">
      {/* Timestamp */}
      <div className="text-xs text-gray-300 mb-0.5 font-dense">{time}</div>

      {/* Receipt lines */}
      {receipt.lines.map((line, i) => (
        <ReceiptLine key={i} line={line} />
      ))}

      {/* Net delta */}
      <div className={`mt-1 text-sm font-semibold font-dense ${deltaColour}`}>
        Net: {deltaStr}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

interface RollLogProps {
  forceOpen?: boolean;
}

export const RollLog: React.FC<RollLogProps> = ({ forceOpen }) => {
  const rollHistory = useGameStore((s) => s.rollHistory);
  const [isOpen, setIsOpen] = useState(false);

  const drawerOpen = forceOpen ?? isOpen;

  return (
    <>
      {/* ── Trigger button — in-flow bar anchored between Dice Zone and Crew Rail ── */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="
          w-full px-4 py-1.5
          bg-black/30 font-dense text-gray-300 text-xs font-semibold tracking-widest uppercase
          border-t border-white/10
          hover:text-gray-100 hover:bg-black/40 active:scale-y-95 transition-all
        "
      >
        {drawerOpen ? '▲ Close Log' : '▼ View Log'}
      </button>

      {/* ── Bottom sheet drawer ───────────────────────────────────────────── */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-40
          h-[60%]
          bg-felt-dark border-t border-gold/40
          flex flex-col
          shadow-[0_-4px_24px_rgba(0,0,0,0.7)]
          transition-transform duration-300 ease-in-out
          ${drawerOpen ? 'translate-y-0' : 'translate-y-full'}
        `}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="font-dense font-bold text-gold text-base tracking-wide">Roll Log</span>
          <span className="font-dense text-gray-200 text-sm">
            {rollHistory.length} roll{rollHistory.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Scrollable history — tutorial zone target */}
        <div
          data-tutorial-zone="roll-log"
          className="flex-1 overflow-y-auto overscroll-contain px-4"
        >
          {rollHistory.length === 0 ? (
            <div className="py-6 text-center text-gray-300 font-dense italic">
              No rolls yet.
            </div>
          ) : (
            rollHistory.map((receipt) => (
              <ReceiptEntry key={receipt.timestamp} receipt={receipt} />
            ))
          )}
        </div>
      </div>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
};
