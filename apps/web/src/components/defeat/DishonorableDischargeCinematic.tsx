// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: DISHONORABLE DISCHARGE (FB-033, Sarge)
// apps/web/src/components/defeat/DishonorableDischargeCinematic.tsx
//
// Sarge ended your run. The same discharge paper as his win moment slides up,
// a red DISHONORABLE DISCHARGE stamp slams into the blank band (thud + jolt),
// your dog tags drop onto the form with a metallic jingle, and Sarge has the
// last word.
//
// Timeline (ms): 600 form slides up (a beat first so TIME'S UP + the whistle
// land) → 1900 stamp → 2120 impact → 2600 dog tags fall → 2950 jingle →
// 3400 line → 5900 fade → 6200 onFinish (game over continues).
// =============================================================================

import React, { useEffect, useState } from 'react';
import { playDogTagsJingle, playStampThud } from '../../hooks/useCrowdAudio.js';
import { DischargeForm } from '../cinematics/DischargeForm.js';
import type { DefeatCinematicProps } from './registry.js';

const FORM_AT   = 600;
const STAMP_AT  = 1900;
const IMPACT_AT = 2120;
const TAGS_AT   = 2600;
const CLINK_AT  = 2950; // where the tags land in the drop animation
const LINE_AT   = 3400;
const FADE_AT   = 5900;
const FINISH_AT = 6200;

const STAMP_RED = '#b91c1c';

/** One stamped-steel dog tag. */
const DogTag: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <div
    className="absolute flex flex-col items-start justify-center gap-0.5 rounded-[10px] pl-5 pr-2 font-mono text-[7px] font-bold leading-none"
    style={{
      width:      62,
      height:     36,
      background: 'linear-gradient(135deg, #e5e7eb 0%, #9ca3af 45%, #d1d5db 60%, #6b7280 100%)',
      border:     '1px solid #4b5563',
      boxShadow:  '0 3px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.6)',
      color:      '#374151',
      ...style,
    }}
  >
    {/* Chain hole */}
    <span className="absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ background: '#374151', boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.6)' }} />
    <span>SHOOTER</span>
    <span>VFW-2 · NO RANK</span>
  </div>
);

export const DishonorableDischargeCinematic: React.FC<DefeatCinematicProps> = ({ line, onFinish }) => {
  const [formIn,   setFormIn]   = useState(false);
  const [stamped,  setStamped]  = useState(false);
  const [impact,   setImpact]   = useState(false);
  const [tags,     setTags]     = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading,   setFading]   = useState(false);

  useEffect(() => {
    const timers = [
      window.setTimeout(() => setFormIn(true), FORM_AT),
      window.setTimeout(() => setStamped(true), STAMP_AT),
      window.setTimeout(() => { setImpact(true); playStampThud(); }, IMPACT_AT),
      window.setTimeout(() => setTags(true), TAGS_AT),
      window.setTimeout(playDogTagsJingle, CLINK_AT),
      window.setTimeout(() => setShowLine(true), LINE_AT),
      window.setTimeout(() => setFading(true), FADE_AT),
      window.setTimeout(onFinish, FINISH_AT),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 flex items-center justify-center px-5 transition-opacity duration-300"
      style={{ background: 'rgba(0,0,0,0.6)', opacity: fading ? 0 : 1 }}
    >
      {formIn && (
        <div className="relative w-full max-w-md animate-cert-slide-up">
          <DischargeForm
            title="NOTICE OF DISCHARGE"
            body={<>Be advised that <strong>THE SHOOTER</strong> failed to beat the clock in Sarge&apos;s hall and is hereby removed from duty.</>}
            stampText="DISHONORABLE DISCHARGE"
            stampColor={STAMP_RED}
            stamped={stamped}
            impact={impact}
          >
            {/* Dog tags, dropped onto the form */}
            {tags && (
              <div className="pointer-events-none absolute animate-dogtags-drop" style={{ right: '8%', bottom: '15%', width: 80, height: 56 }} aria-hidden="true">
                {/* Ball chain */}
                <svg className="absolute -left-6 -top-5" width="70" height="40" viewBox="0 0 70 40" fill="none">
                  <path d="M8 34 C 4 10, 40 -2, 56 18" stroke="#6b7280" strokeWidth="2.5" strokeDasharray="1 3" strokeLinecap="round" />
                </svg>
                <DogTag style={{ left: 0, top: 6, transform: 'rotate(-8deg)' }} />
                <DogTag style={{ left: 12, top: 16, transform: 'rotate(10deg)' }} />
              </div>
            )}
          </DischargeForm>

          {showLine && (
            <div className="mt-4 text-center animate-boss-reveal-1">
              <div
                className="font-pixel italic"
                style={{ fontSize: 'clamp(12px, 3.6vw, 15px)', color: '#f3f4f6', textShadow: '0 2px 6px rgba(0,0,0,0.95)' }}
              >
                &ldquo;{line}&rdquo;
              </div>
              <div className="mt-1 font-pixel text-[9px] tracking-widest" style={{ color: 'rgba(243,244,246,0.6)' }}>— SARGE</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
