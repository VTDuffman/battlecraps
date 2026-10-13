// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: DOCK CLOSED (FB-032, The Foreman)
// apps/web/src/components/defeat/DockClosedCinematic.tsx
//
// You came up short. The register goes dead on BALANCE DUE, then the loading
// dock's steel roll-up door rattles down over the table and slams shut:
// CLANG, shake, "DOCK CLOSED" stenciled across it, the Foreman's parting shot.
//
// Timeline (ms): 0 balance due + thunk → 900 door drops (rattle) → 1550 impact
// (clang, shake, stencil) → 1850 line → 3700 onFinish (game over continues).
// Reduced motion: the door fades in; no shake.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { playDeadThunk, playDoorClang, playDoorRattle } from '../../hooks/useCrowdAudio.js';
import type { DefeatCinematicProps } from './registry.js';

const DROP_AT   = 900;
const IMPACT_AT = 1550;
const LINE_AT   = 1850;
const FINISH_AT = 3700;

type Step = 'balance' | 'dropping' | 'landed' | 'line';

export const DockClosedCinematic: React.FC<DefeatCinematicProps> = ({ line, balanceDueCents, onFinish }) => {
  const [step, setStep] = useState<Step>('balance');
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    playDeadThunk();
    const timers = [
      window.setTimeout(() => { setStep('dropping'); playDoorRattle(); }, DROP_AT),
      window.setTimeout(() => { setStep('landed');   playDoorClang();  }, IMPACT_AT),
      window.setTimeout(() => setStep('line'), LINE_AT),
      window.setTimeout(onFinish, FINISH_AT),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const doorVisible = step !== 'balance';
  const landed      = step === 'landed' || step === 'line';

  return (
    <div
      className={`fixed inset-0 overflow-hidden${landed && !reduceMotion ? ' animate-dock-impact-shake' : ''}`}
      style={{ background: 'rgba(0,0,0,0.35)' }}
    >
      {/* BALANCE DUE — the register goes dead (the door slams over it) */}
      {balanceDueCents !== null && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="font-pixel px-5 py-3 tracking-widest animate-balance-due"
            style={{
              fontSize:     'clamp(20px, 6.5vw, 34px)',
              color:        '#f87171',
              background:   'rgba(20,0,0,0.85)',
              border:       '3px solid #b91c1c',
              borderRadius: '6px',
              textShadow:   '0 0 10px rgba(248,113,113,0.6)',
            }}
          >
            BALANCE DUE ${Math.round(balanceDueCents / 100)}
          </div>
        </div>
      )}

      {/* The roll-up door */}
      {doorVisible && (
        <div
          className={`absolute inset-0 flex flex-col ${reduceMotion ? 'animate-dock-door-fade' : 'animate-dock-door-drop'}`}
          aria-hidden="true"
        >
          {/* Corrugated steel slats */}
          <div
            className="relative flex-1"
            style={{
              background: 'repeating-linear-gradient(180deg, #4b5563 0px, #9ca3af 7px, #6b7280 13px, #374151 18px, #4b5563 20px)',
              boxShadow:  'inset 0 12px 24px rgba(0,0,0,0.65), inset 0 -6px 12px rgba(0,0,0,0.4)',
            }}
          >
            {/* Stencil + parting shot */}
            {landed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
                <div
                  className="font-pixel tracking-[0.18em] animate-dock-stencil"
                  style={{
                    fontSize:   'clamp(30px, 10vw, 58px)',
                    color:      '#fbbf24',
                    opacity:    0.92,
                    transform:  'rotate(-3deg)',
                    textShadow: '2px 2px 0 rgba(0,0,0,0.55)',
                    mixBlendMode: 'hard-light',
                  }}
                >
                  DOCK CLOSED
                </div>
                {step === 'line' && (
                  <div className="flex flex-col items-center gap-1 animate-boss-reveal-1">
                    <div
                      className="font-pixel italic leading-snug"
                      style={{ fontSize: 'clamp(12px, 3.6vw, 16px)', color: '#f3f4f6', textShadow: '0 2px 6px rgba(0,0,0,0.95)' }}
                    >
                      "{line}"
                    </div>
                    <div className="font-pixel text-[9px] tracking-widest" style={{ color: 'rgba(243,244,246,0.6)' }}>
                      — THE FOREMAN
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Bottom bar: hazard stripes + handle */}
          <div
            className="relative h-8 flex-none"
            style={{
              background: 'repeating-linear-gradient(45deg, #facc15 0px, #facc15 14px, #111827 14px, #111827 28px)',
              borderTop:  '3px solid #1f2937',
              boxShadow:  '0 -4px 10px rgba(0,0,0,0.5)',
            }}
          >
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-20 rounded"
              style={{ background: '#1f2937', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
