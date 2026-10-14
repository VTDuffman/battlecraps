// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: HONORABLY DISCHARGED (FB-033, Sarge)
// apps/web/src/components/victory/HonorablyDischargedCinematic.tsx
//
// You beat Sarge. A discharge certificate slides up over the table and
// settles; a beat later a small ink stamp comes down from above and SLAMS onto
// the blank band at the bottom (thud + the certificate jolts), then a bugle
// sounds and Sarge grunts his approval. Mirrors his loss moment
// (DISHONORABLE DISCHARGE).
//
// Timeline (ms): 0 certificate slides up (480) → 1300 stamp comes down →
// 1520 impact (thud, shake) → 1750 bugle → 2300 line → 4300 fade → 4600 onFinish.
// Runs inside the store's celebration hold (VICTORY_HOLD_MS).
// =============================================================================

import React, { useEffect, useState } from 'react';
import { playBugleCall, playStampThud } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const STAMP_AT  = 1300;
const IMPACT_AT = 1520; // ~55% into the 400ms stamp animation, where it lands
const BUGLE_AT  = 1750;
const LINE_AT   = 2300;
const FADE_AT   = 4300;
const FINISH_AT = 4600;

const STAMP_GREEN = '#15803d';

export const HonorablyDischargedCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const [stamped,  setStamped]  = useState(false);
  const [impact,   setImpact]   = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading,   setFading]   = useState(false);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStamped(true), STAMP_AT),
      window.setTimeout(() => { setImpact(true); playStampThud(); }, IMPACT_AT),
      window.setTimeout(playBugleCall, BUGLE_AT),
      window.setTimeout(() => setShowLine(true), LINE_AT),
      window.setTimeout(() => setFading(true), FADE_AT),
      window.setTimeout(onFinish, FINISH_AT),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-5 transition-opacity duration-300"
      style={{ background: 'rgba(0,0,0,0.45)', opacity: fading ? 0 : 1 }}
    >
      <div className="relative w-full max-w-md animate-cert-slide-up">
        {/* The certificate — jolts when the stamp lands */}
        <div
          className={`relative flex flex-col items-center gap-3 px-7 py-7 text-center${impact ? ' animate-stamp-impact' : ''}`}
          style={{
            background: 'linear-gradient(180deg, #fbf6e6 0%, #f1e7c7 100%)',
            border:     '6px double #8a6d2f',
            boxShadow:  '0 18px 40px rgba(0,0,0,0.6)',
            color:      '#3b2f1a',
          }}
        >
          <div className="font-pixel text-[10px] tracking-[0.3em]" style={{ color: '#8a6d2f' }}>★ VFW HALL · FLOOR 2 ★</div>
          <div className="font-pixel text-r-15 tracking-widest leading-tight">CERTIFICATE OF DISCHARGE</div>
          <div className="h-px w-3/4" style={{ background: '#8a6d2f66' }} />
          <p className="font-mono text-[13px] leading-relaxed">
            This certifies that <strong>THE SHOOTER</strong> beat the clock
            in Sarge&apos;s hall and is hereby released from duty.
          </p>

          {/* Blank band reserved for the stamp, so it never covers the text */}
          <div className="relative flex h-24 w-full items-center justify-center">
            {stamped && (
              <div
                className="font-pixel px-2.5 py-1.5 tracking-widest whitespace-nowrap animate-honor-stamp"
                style={{
                  fontSize:     'clamp(11px, 3.2vw, 14px)',
                  color:        STAMP_GREEN,
                  border:       `3px double ${STAMP_GREEN}`,
                  borderRadius: '5px',
                  background:   'rgba(240,253,244,0.25)',
                  mixBlendMode: 'multiply',
                  opacity:      0.9,
                }}
              >
                HONORABLY DISCHARGED
              </div>
            )}
          </div>

          <div className="flex w-full items-end justify-between border-t pt-1 font-mono text-[11px]" style={{ color: '#6b5a36', borderColor: '#8a6d2f55' }}>
            <span>— SARGE, Pit Boss</span>
            <span>Floor 2</span>
          </div>
        </div>

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
