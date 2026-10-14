// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: HONORABLY DISCHARGED (FB-033, Sarge)
// apps/web/src/components/victory/HonorablyDischargedCinematic.tsx
//
// You beat Sarge. A discharge certificate slides up over the table, a bugle
// sounds, a green HONORABLY DISCHARGED stamp slams onto it, and Sarge grunts
// his approval. Mirrors his loss moment (DISHONORABLE DISCHARGE).
//
// Timeline (ms): 0 certificate slides up → 500 bugle → 650 stamp → 1200 line →
// 3300 fade → 3600 onFinish. Runs inside the store's celebration hold
// (VICTORY_HOLD_MS) so the boss-victory celebration waits for it.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { playBugleCall } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const BUGLE_AT  = 500;
const STAMP_AT  = 650;
const LINE_AT   = 1200;
const FADE_AT   = 3300;
const FINISH_AT = 3600;

const STAMP_GREEN = '#15803d';

export const HonorablyDischargedCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const [stamped, setStamped] = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const timers = [
      window.setTimeout(playBugleCall, BUGLE_AT),
      window.setTimeout(() => setStamped(true), STAMP_AT),
      window.setTimeout(() => setShowLine(true), LINE_AT),
      window.setTimeout(() => setFading(true), FADE_AT),
      window.setTimeout(onFinish, FINISH_AT),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-6 transition-opacity duration-300"
      style={{ background: 'rgba(0,0,0,0.45)', opacity: fading ? 0 : 1 }}
    >
      <div className="relative w-full max-w-sm animate-cert-slide-up">
        {/* The certificate */}
        <div
          className="relative flex flex-col items-center gap-3 px-6 py-6 text-center"
          style={{
            background: 'linear-gradient(180deg, #fbf6e6 0%, #f1e7c7 100%)',
            border:     '6px double #8a6d2f',
            boxShadow:  '0 18px 40px rgba(0,0,0,0.6)',
            color:      '#3b2f1a',
          }}
        >
          <div className="font-pixel text-[9px] tracking-[0.3em]" style={{ color: '#8a6d2f' }}>★ VFW HALL · FLOOR 2 ★</div>
          <div className="font-pixel text-r-12 tracking-widest leading-tight">CERTIFICATE OF DISCHARGE</div>
          <div className="h-px w-3/4" style={{ background: '#8a6d2f66' }} />
          <p className="font-mono text-[12px] leading-snug">
            This certifies that <strong>THE SHOOTER</strong> beat the clock
            in Sarge&apos;s hall and is hereby released from duty.
          </p>
          <div className="mt-2 flex w-full items-end justify-between font-mono text-[10px]" style={{ color: '#6b5a36' }}>
            <span>— SARGE, Pit Boss</span>
            <span>Floor 2</span>
          </div>
        </div>

        {/* The stamp */}
        {stamped && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="font-pixel px-3 py-2 tracking-widest animate-honor-stamp"
              style={{
                fontSize:     'clamp(16px, 5vw, 24px)',
                color:        STAMP_GREEN,
                border:       `4px double ${STAMP_GREEN}`,
                borderRadius: '6px',
                background:   'rgba(240,253,244,0.35)',
                mixBlendMode: 'multiply',
              }}
            >
              HONORABLY DISCHARGED
            </div>
          </div>
        )}

        {/* Sarge's line */}
        {showLine && (
          <div className="mt-4 text-center animate-boss-reveal-1">
            <div
              className="font-pixel italic"
              style={{ fontSize: 'clamp(12px, 3.6vw, 15px)', color: '#f3f4f6', textShadow: '0 2px 6px rgba(0,0,0,0.95)' }}
            >
              &ldquo;{line}&rdquo;
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
