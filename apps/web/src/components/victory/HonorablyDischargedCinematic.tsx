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
// Runs inside the store's celebration hold (VICTORY_HOLD_MS_BY_ID).
// =============================================================================

import React, { useEffect, useState } from 'react';
import { playBugleCall, playStampThud } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';
import { DischargeForm } from '../cinematics/DischargeForm.js';

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
        <DischargeForm
          title="CERTIFICATE OF DISCHARGE"
          body={<>This certifies that <strong>THE SHOOTER</strong> beat the clock in Sarge&apos;s hall and is hereby released from duty.</>}
          stampText="HONORABLY DISCHARGED"
          stampColor={STAMP_GREEN}
          stamped={stamped}
          impact={impact}
        />

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
