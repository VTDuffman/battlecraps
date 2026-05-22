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

interface ReceiptLineProps {
  line:         RollReceiptLine;
  originalDice?: [number, number];
  nudgedFrom?:   [number, number];
}

const ReceiptLine: React.FC<ReceiptLineProps> = ({ line, originalDice, nudgedFrom }) => (
  <div className={`leading-tight ${LINE_COLOUR[line.kind]}`}>
    {line.kind === 'win'  && <span className="mr-1 select-none">+</span>}
    {line.kind === 'loss' && <span className="mr-1 select-none">−</span>}
    {line.kind === 'roll' && originalDice !== undefined ? (
      <>
        <span className="line-through opacity-40 mr-1">[{originalDice.join(',')}]</span>
        <span className="opacity-60 mr-1">➔ Lefty ➔</span>
        {line.text}
      </>
    ) : line.kind === 'roll' && nudgedFrom !== undefined ? (
      <>
        <span className="line-through opacity-40 mr-1">[{nudgedFrom.join(',')}]</span>
        <span className="opacity-60 mr-1">➔ Prof ➔</span>
        {line.text}
      </>
    ) : (
      line.text
    )}
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
      <div className="text-r-12 text-white/30 mb-0.5 font-mono">{time}</div>
      {receipt.lines.map((line, i) => (
        <ReceiptLine
          key={i}
          line={line}
          originalDice={line.kind === 'roll' ? receipt.originalDice : undefined}
          nudgedFrom={line.kind === 'roll' ? receipt.nudgedFrom : undefined}
        />
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
// Layout strategy: when collapsed the tab is a flex-none in-flow item that
// sits directly below the crew rail (no overlap). When expanded the wrapper
// switches to absolute bottom-0 so the full sheet slides up over the table
// content — which the user has approved as acceptable.
// The scrim is absolute within the overflow-hidden game container.
// ---------------------------------------------------------------------------

export const RollLog: React.FC = () => {
  const rollHistory = useGameStore((s) => s.rollHistory);
  const [expanded, setExpanded] = useState(false);

  const toggle = () => setExpanded((e) => !e);
  const close  = () => setExpanded(false);

  return (
    <>
      {/* ── Background scrim (tap to close) — absolute within game container */}
      {expanded && (
        <div
          className="absolute inset-0 z-40 bg-black/30"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ── Sheet wrapper ────────────────────────────────────────────────── */}
      {/* Collapsed: flex-none, 40px tab in normal flow — no crew overlap.   */}
      {/* Expanded:  absolute bottom-0, 50dvh sheet overlaying content above. */}
      <div
        data-testid="roll-log"
        className={[
          'z-50',
          expanded
            ? 'absolute bottom-0 left-0 right-0'
            : 'flex-none w-full',
        ].join(' ')}
        style={expanded ? { height: '50dvh' } : {}}
      >
        {/* ── Tab / handle ─────────────────────────────────────────────────── */}
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
          <div className="w-10 h-1 bg-white/20 rounded-full flex-none" />

          <span className="font-pixel text-[10.5px] text-gold/70 tracking-widest">
            ROLL LOG{rollHistory.length > 0 ? ` (${rollHistory.length})` : ''}
          </span>

          <span className="text-white/40 text-r-15 flex-none w-5 text-right">
            {expanded ? '▼' : '▲'}
          </span>
        </button>

        {/* ── Scrollable receipt list — only rendered when expanded ────────── */}
        {expanded && (
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
              <div className="py-3 text-center text-white/30 text-[13.5px] font-mono italic">
                No rolls yet.
              </div>
            ) : (
              <div className="text-[13.5px] font-mono">
                {rollHistory.map((receipt) => (
                  <ReceiptEntry key={receipt.timestamp} receipt={receipt} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};
