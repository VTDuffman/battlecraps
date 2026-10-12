// =============================================================================
// BATTLECRAPS — PINK SLIP MODAL
// apps/web/src/components/PinkSlipModal.tsx
//
// Shown when The Executive triggers a PIP (Performance Improvement Plan)
// termination — the instant-death condition when Action Required rating meets
// another bad roll. Appears as a
// cold, formal HR document before the standard GameOverScreen.
//
// Visual tone: bureaucratic, clinical — white paper, black serif text.
// =============================================================================

import React from 'react';
import { createPortal } from 'react-dom';
import { useGameStore } from '../store/useGameStore.js';

export const PinkSlipModal: React.FC = () => {
  const pipTermination      = useGameStore((s) => s.pipTermination);
  const clearPipTermination = useGameStore((s) => s.clearPipTermination);

  if (!pipTermination) return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9982] bg-black/80" />

      {/* Document wrapper */}
      <div className="fixed inset-0 z-[9983] flex items-center justify-center px-6 py-8 pointer-events-none">
        <div
          className="
            w-full max-w-sm pointer-events-auto
            flex flex-col
            border border-stone-400
            shadow-2xl
          "
          style={{
            background: '#f5f0e8',
            animation: 'pink-slip-enter 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
          }}
        >
          {/* Red top bar — the colour of the pink slip */}
          <div className="h-2 w-full bg-red-700" />

          {/* Header */}
          <div className="px-8 pt-7 pb-4 border-b border-stone-300 text-center">
            <div
              className="text-[10px] tracking-[0.35em] font-mono text-stone-500 uppercase mb-2"
            >
              INTERNAL MEMO — CONFIDENTIAL
            </div>
            <div
              className="text-[13px] font-mono font-bold tracking-widest text-stone-900 uppercase"
            >
              Performance Improvement Plan
            </div>
          </div>

          {/* Body */}
          <div className="px-8 py-6 flex flex-col gap-4">
            {/* To / From / Re fields */}
            <div className="flex flex-col gap-1.5">
              {[
                ['TO',   'Player (Current Occupant, Table)'],
                ['FROM', 'The Executive, Office of Standards'],
                ['RE',   'Continued Performance Deficiency'],
              ].map(([label, value]) => (
                <div key={label} className="flex gap-3 text-[11px] font-mono">
                  <span className="text-stone-500 w-9 shrink-0 text-right">{label}:</span>
                  <span className="text-stone-800">{value}</span>
                </div>
              ))}
            </div>

            {/* Separator */}
            <div className="h-px bg-stone-300" />

            {/* Main text */}
            <div className="flex flex-col gap-3 font-mono text-[12px] text-stone-800 leading-relaxed">
              <p>
                Effective immediately, your employment has been terminated.
              </p>
              <p>
                Performance metrics have fallen below acceptable thresholds on
                three consecutive review cycles. This outcome is final and not
                subject to appeal.
              </p>
              <p className="italic text-stone-600">
                We wish you the best in your future endeavors.
              </p>
            </div>

            {/* Signature */}
            <div className="mt-1 border-t border-stone-300 pt-4">
              <div className="font-mono text-[11px] text-stone-700 italic text-right">
                — The Executive
              </div>
            </div>

            {/* Stamp overlay */}
            <div
              className="absolute top-20 right-8 rotate-[-12deg] pointer-events-none select-none"
              style={{
                border: '3px solid rgba(185,28,28,0.65)',
                color:  'rgba(185,28,28,0.65)',
                padding: '2px 8px',
                fontFamily: 'monospace',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              TERMINATED
            </div>
          </div>

          {/* Acknowledge button */}
          <div className="px-8 pb-7 flex justify-center border-t border-stone-300 pt-5">
            <button
              type="button"
              onClick={clearPipTermination}
              className="
                px-8 py-2.5
                font-mono text-[11px] tracking-[0.25em] uppercase
                bg-stone-900 text-stone-100
                border border-stone-700
                hover:bg-stone-800
                active:scale-95
                transition-all duration-100
              "
            >
              ACKNOWLEDGED
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
};
