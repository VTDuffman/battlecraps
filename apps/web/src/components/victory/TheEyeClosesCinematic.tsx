// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: THE EYE CLOSES (FB-036, The Hierophant)
// apps/web/src/components/victory/TheEyeClosesCinematic.tsx
//
// You beat The Hierophant, and the order stops watching. His great eye opens
// in a ring of candles before the sealed sanctum doors and looks you over;
// then it slowly closes. The candles go out one by one around the ring, and
// in the dark the sanctum doors grind open — warm light floods in under a
// rising choir. Then his line: leave before the observers decide otherwise.
// Built at the scale of THE ROSE (big wins, big losses).
//
// Timeline (ms): 0 doors + dark → 300 candles light → 500 eye opens (bell) →
// 900–2300 it looks you over → 2400 it closes → 3300 candles out (12 × 75) →
// 4300 doors part, light floods (rumble + choir) → 4600 line → 7800 fade →
// 8200 onFinish. Runs inside the celebration hold (VICTORY_HOLD_MS_BY_ID).
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playBellToll, playCandleSnuff, playChoirChord, playDoorsOpen } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';
import { HierophantEye } from '../cinematics/HierophantEye.js';

const CANDLES_AT = 300;
const EYE_AT     = 500;
const CLOSE_AT   = 2400;
const SNUFF_AT   = 3300;
const SNUFF_STEP = 75;
const DOORS_AT   = 4300;
const LINE_AT    = 4600;
const FADE_AT    = 7800;   // ~3 s to read his (long) line
const FINISH_AT  = 8200;

const CANDLE_COUNT = 12;
const AMBER = '#f59e0b';

export const TheEyeClosesCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const [candlesLit, setCandlesLit] = useState(false);
  const [eyeIn,      setEyeIn]      = useState(false);
  const [closed,     setClosed]     = useState(false);
  const [snuffed,    setSnuffed]    = useState(0);
  const [doorsOpen,  setDoorsOpen]  = useState(false);
  const [showLine,   setShowLine]   = useState(false);
  const [fading,     setFading]     = useState(false);

  const ring = useMemo(() => Array.from({ length: CANDLE_COUNT }, (_, i) => {
    const a = (i / CANDLE_COUNT) * Math.PI * 2 - Math.PI / 2;
    return { x: Math.cos(a), y: Math.sin(a) * 0.82 };
  }), []);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(CANDLES_AT, () => setCandlesLit(true));
    at(EYE_AT,     () => { setEyeIn(true); playBellToll(); });
    at(CLOSE_AT,   () => setClosed(true));
    for (let i = 0; i < CANDLE_COUNT; i++) {
      at(SNUFF_AT + i * SNUFF_STEP, () => { setSnuffed(i + 1); if (i % 3 === 0) playCandleSnuff(); });
    }
    at(DOORS_AT,  () => { setDoorsOpen(true); playDoorsOpen(); playChoirChord('major'); });
    at(LINE_AT,   () => setShowLine(true));
    at(FADE_AT,   () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const radius = 'min(40vw, 190px)';

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500" style={{ opacity: fading ? 0 : 1, background: '#0b0410' }}>
      {/* Light behind the doors */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 50%, #fff7d6 0%, #fcd34d 22%, #b45309 48%, rgba(11,4,16,0) 75%)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: doorsOpen ? 1 : 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* The sanctum doors */}
      {(['left', 'right'] as const).map((side) => (
        <motion.div
          key={side}
          className="absolute top-0 h-full"
          style={{
            width: '50.5%',
            [side]: 0,
            background: side === 'left'
              ? 'linear-gradient(90deg, #1c0b20 0%, #2b1230 70%, #3a1a3e 100%)'
              : 'linear-gradient(270deg, #1c0b20 0%, #2b1230 70%, #3a1a3e 100%)',
            boxShadow: side === 'left' ? 'inset -6px 0 12px rgba(0,0,0,0.6)' : 'inset 6px 0 12px rgba(0,0,0,0.6)',
          }}
          initial={{ x: 0 }}
          animate={{ x: doorsOpen ? (side === 'left' ? '-100%' : '100%') : 0 }}
          transition={{ duration: reduceMotion ? 0.4 : 1.6, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* carved panels */}
          <div className="absolute inset-6 rounded-sm" style={{ border: '2px solid rgba(245,158,11,0.18)' }} />
          <div className="absolute inset-12 rounded-sm" style={{ border: '1px solid rgba(245,158,11,0.12)' }} />
        </motion.div>
      ))}

      {/* Candle ring + the eye (in front of the doors; gone once they part) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 1 }}
        animate={{ opacity: doorsOpen ? 0 : 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="relative" style={{ width: 0, height: 0 }}>
          {ring.map((c, i) => {
            const out = snuffed > i;
            return (
              <div
                key={i}
                className="absolute"
                style={{ left: `calc(${c.x} * ${radius})`, top: `calc(${c.y} * ${radius})`, transform: 'translate(-50%, -50%)' }}
              >
                <motion.span
                  className={`block select-none leading-none ${!out && !reduceMotion ? 'animate-candle-flicker' : ''}`}
                  style={{ fontSize: 26, animationDelay: `${-i * 0.23}s`, filter: out ? 'grayscale(1) brightness(0.45)' : `drop-shadow(0 0 10px ${AMBER})` }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: candlesLit ? (out ? 0.55 : 1) : 0, scale: candlesLit ? 1 : 0.5 }}
                  transition={{ duration: 0.4, delay: candlesLit && !out ? i * 0.04 : 0 }}
                >
                  🕯️
                </motion.span>
                {/* smoke wisp as it goes out */}
                {out && !reduceMotion && (
                  <motion.span
                    className="absolute left-1/2 top-0 block rounded-full"
                    style={{ width: 8, height: 8, marginLeft: -4, background: 'rgba(214,211,209,0.55)', filter: 'blur(3px)' }}
                    initial={{ y: 0, opacity: 0.8, scale: 0.6 }}
                    animate={{ y: -40, opacity: 0, scale: 2.2, x: (i % 2 ? 6 : -6) }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {eyeIn && (
          <motion.div
            className="absolute"
            initial={{ opacity: 0, scaleY: 0.05 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: reduceMotion ? 0.3 : 0.6, ease: 'easeOut' }}
          >
            <HierophantEye open={!closed} initiallyOpen lookAround reduceMotion={reduceMotion} />
          </motion.div>
        )}
      </motion.div>

      {/* His line, in the light */}
      {showLine && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <motion.div
            className="max-w-md text-center italic"
            style={{
              fontFamily:    'Georgia, "Times New Roman", serif',
              fontSize:      'clamp(18px, 5vw, 24px)',
              color:         '#2a0f2e',
              letterSpacing: '0.02em',
              textShadow:    '0 1px 0 rgba(255,247,214,0.8), 0 0 18px rgba(255,247,214,0.9)',
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          >
            &ldquo;{line}&rdquo;
            <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: '#78350f' }}>
              — THE HIEROPHANT
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
