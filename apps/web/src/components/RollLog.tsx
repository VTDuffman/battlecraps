// =============================================================================
// BATTLECRAPS — ROLL LOG
// apps/web/src/components/RollLog.tsx
//
// QA Transaction Log — a full-width bottom-sheet drawer that slides up from
// the bottom of the screen.  In the collapsed state only a 40 px "tab" handle
// is visible; tapping it expands the sheet to 50dvh.
//
// Colour coding:
//   'roll'  → white/gray  — dice result headline
//   'win'   → green       — payout line
//   'loss'  → red         — cleared / lost bet
//   'info'  → yellow      — modifier note (Hype, crew bonus)
// =============================================================================

import React, { useState } from 'react';
import type { RollReceipt, RollReceiptLine, RollReceiptLineKind } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';

// Height of the persistent collapsed handle, in pixels.
export const ROLL_LOG_TAB_H = 40;

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

  const time = new Date(receipt.timestamp).toLocaleTimeString([], {
    hour:   '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  return (
    <div className="py-1.5 border-b border-white/10 last:border-0">
      <div className="text-[8px] text-white/30 mb-0.5 font-mono">{time}</div>
      {receipt.lines.map((line, i) => (
        <ReceiptLine key={i} line={line} />
      ))}
      <div className={`mt-0.5 font-semibold ${deltaColour}`}>
        Net: {deltaStr}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main panel — bottom-sheet drawer
//
// Animation strategy: the entire sheet (tab + content) is 50dvh tall and
// position:fixed.  When collapsed, translateY(calc(100% - 40px)) pushes
// it below the viewport leaving only the 40px tab visible.  When expanded,
// translateY(0) reveals the full sheet.  CSS transition handles the slide.
// ---------------------------------------------------------------------------

export const RollLog: React.FC = () => {
  const rollHistory = useGameStore((s) => s.rollHistory);
  const [expanded, setExpanded] = useState(false);

  const toggle = () => setExpanded((e) => !e);
  const close  = () => setExpanded(false);

  return (
    <>
      {/* ── Background scrim (tap to close) ─────────────────────────────── */}
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ── Bottom-sheet drawer ─────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto z-50 transition-transform duration-300 ease-in-out"
        style={{
          transform: expanded
            ? 'translateY(0)'
            : `translateY(calc(100% - ${ROLL_LOG_TAB_H}px))`,
        }}
      >
        {/* ── Tab / handle — always visible, acts as the toggle trigger ──── */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={expanded}
          aria-label={expanded ? 'Collapse roll log' : 'Expand roll log'}
          className="
            w-full flex items-center justify-between gap-2 px-3
            bg-black/80 backdrop-blur-sm
            border-t border-x border-gold/30
            rounded-t select-none cursor-pointer
          "
          style={{ height: ROLL_LOG_TAB_H }}
        >
          {/* Grab pill — visual affordance for a pull-up sheet */}
          <div className="w-10 h-1 bg-white/20 rounded-full flex-none" />

          <span className="font-pixel text-[7px] text-gold/70 tracking-widest">
            ROLL LOG{rollHistory.length > 0 ? ` (${rollHistory.length})` : ''}
          </span>

          {/* Chevron — ▲ = expand, ▼ = collapse */}
          <span className="text-white/40 text-[10px] flex-none w-5 text-right">
            {expanded ? '▼' : '▲'}
          </span>
        </button>

        {/* ── Scrollable receipt list ──────────────────────────────────────── */}
        <div
          className="
            bg-black/80 backdrop-blur-sm
            border-x border-b border-gold/30
            overflow-y-auto overscroll-contain
            px-2
          "
          style={{ height: `calc(50dvh - ${ROLL_LOG_TAB_H}px)` }}
        >
          {rollHistory.length === 0 ? (
            <div className="py-3 text-center text-white/30 text-[9px] font-mono italic">
              No rolls yet.
            </div>
          ) : (
            <div className="text-[9px] font-mono">
              {rollHistory.map((receipt) => (
                <ReceiptEntry key={receipt.timestamp} receipt={receipt} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
