// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: THE ORDER COLLECTS (FB-036, The Hierophant)
// apps/web/src/components/defeat/TheOrderCollectsCinematic.tsx
//
// The Hierophant ended your run, and the order takes what's left. Hooded
// figures close in from the edges; your bankroll drains into the offering
// bowl as a stream of coins; above it his eye opens wide and burns; a bell
// tolls three times; the candles go out one by one until only the dark is
// left. "The order always collects." Built at the scale of THE ROSE.
//
// Timeline (ms): 0 dim + figures close in → 400 bowl, candles, shut eye →
// 600–2600 bankroll drains into the bowl (coin clinks) → 2600 the eye opens
// and burns → 2700 / 3400 / 4100 bell tolls → 4200 candles out (8 × 80) →
// 5000 black → 5100 line → 7900 fade → 8300 onFinish (game over continues;
// under the store's 9 s safety net).
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore.js';
import { useAnimatedCounter } from '../../hooks/useAnimatedCounter.js';
import { playBellToll, playCandleSnuff, playChoirChord, playCoinChime } from '../../hooks/useCrowdAudio.js';
import { HierophantEye } from '../cinematics/HierophantEye.js';
import type { DefeatCinematicProps } from './registry.js';

const DRAIN_AT   = 600;
const DRAIN_MS   = 2000;
const EYE_AT     = 2600;
const TOLLS      = [2700, 3400, 4100];
const SNUFF_AT   = 4200;
const SNUFF_STEP = 80;
const BLACK_AT   = 5000;
const LINE_AT    = 5100;
const FADE_AT    = 7900;
const FINISH_AT  = 8300;

const CANDLES = 8;
const AMBER = '#f59e0b';

/** A hooded member of the order — a silhouette with a faint glint under the hood. */
const Hooded: React.FC<{ side: 'left' | 'right'; depth: number; reduceMotion: boolean; fadeOut: boolean }> = ({ side, depth, reduceMotion, fadeOut }) => {
  const h   = depth === 0 ? 'min(62vh, 520px)' : 'min(50vh, 420px)';
  const end = depth === 0 ? '2vw' : '14vw';
  return (
    <motion.div
      className="absolute bottom-0"
      style={{
        [side]: 0,
        width: `calc(${h} * 0.42)`, height: h,
        zIndex: depth === 0 ? 3 : 2,
        filter: depth === 0 ? 'none' : 'brightness(0.7)',
      }}
      initial={{ x: side === 'left' ? '-110%' : '110%', opacity: 0 }}
      animate={{
        x: side === 'left' ? end : `-${end}`,
        opacity: fadeOut ? 0 : 1,
      }}
      transition={{
        x: { duration: reduceMotion ? 0.4 : 2.6 + depth * 0.5, ease: 'easeOut' },
        opacity: { duration: fadeOut ? 1.2 : 0.8 },
      }}
    >
      {/* robe */}
      <div className="absolute inset-0" style={{
        borderRadius: '48% 48% 8% 8% / 30% 30% 4% 4%',
        background: 'linear-gradient(180deg, #1a0a1e 0%, #0d0510 70%, #050207 100%)',
        boxShadow: '0 0 30px rgba(0,0,0,0.8)',
      }} />
      {/* hood opening */}
      <div className="absolute left-1/2" style={{
        top: '7%', width: '46%', height: '16%', transform: 'translateX(-50%)',
        borderRadius: '50% 50% 45% 45%', background: '#000',
        boxShadow: 'inset 0 6px 14px rgba(245,158,11,0.10)',
      }}>
        {/* a glint of eyes */}
        <span className="absolute block rounded-full" style={{ left: '30%', top: '52%', width: 4, height: 2, background: 'rgba(245,158,11,0.7)', boxShadow: `0 0 6px ${AMBER}` }} />
        <span className="absolute block rounded-full" style={{ right: '30%', top: '52%', width: 4, height: 2, background: 'rgba(245,158,11,0.7)', boxShadow: `0 0 6px ${AMBER}` }} />
      </div>
    </motion.div>
  );
};

export const TheOrderCollectsCinematic: React.FC<DefeatCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const startBankroll = useMemo(() => useGameStore.getState().bankroll, []);

  const [setIn,    setSetIn]    = useState(false);
  const [draining, setDraining] = useState(false);
  const [eyeOpen,  setEyeOpen]  = useState(false);
  const [snuffed,  setSnuffed]  = useState(0);
  const [black,    setBlack]    = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading,   setFading]   = useState(false);

  const { display } = useAnimatedCounter(draining ? 0 : startBankroll);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(400,      () => setSetIn(true));
    at(DRAIN_AT, () => setDraining(true));
    for (let i = 0; i < 6; i++) at(DRAIN_AT + 150 + i * 300, () => playCoinChime('drop'));
    at(EYE_AT,   () => { setEyeOpen(true); playChoirChord('minor'); });
    TOLLS.forEach((ms) => at(ms, playBellToll));
    for (let i = 0; i < CANDLES; i++) {
      at(SNUFF_AT + i * SNUFF_STEP, () => { setSnuffed(i + 1); if (i % 2 === 0) playCandleSnuff(); });
    }
    at(BLACK_AT,  () => setBlack(true));
    at(LINE_AT,   () => setShowLine(true));
    at(FADE_AT,   () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A steady stream of coins from the bankroll readout up into the bowl.
  const stream = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    x: ((i * 37) % 60) - 30,
    delay: (i / 18) * (DRAIN_MS / 1000 - 0.5),
  })), []);

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500" style={{ opacity: fading ? 0 : 1 }}>
      {/* The dim, deepening to black */}
      <motion.div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 40%, rgba(42,15,46,0.88), rgba(5,2,7,0.97))' }}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
      />
      <motion.div
        className="absolute inset-0 z-[5] bg-black"
        initial={{ opacity: 0 }} animate={{ opacity: black ? 1 : 0 }} transition={{ duration: 0.8 }}
      />

      {/* The order closes in */}
      {(['left', 'right'] as const).flatMap((side) => [1, 0].map((depth) => (
        <Hooded key={`${side}${depth}`} side={side} depth={depth} reduceMotion={reduceMotion} fadeOut={black} />
      )))}

      {/* Eye, bowl, candles, bankroll */}
      {setIn && (
        <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-5 px-4">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6 }}>
            <HierophantEye open={eyeOpen} initiallyOpen={false} burning={eyeOpen} reduceMotion={reduceMotion} />
          </motion.div>

          {/* bowl in a row of candles */}
          <div className="relative flex items-end gap-2">
            {Array.from({ length: CANDLES }, (_, i) => {
              const out = snuffed > i;
              const mid = i === CANDLES / 2;
              return (
                <React.Fragment key={i}>
                  {mid && (
                    <div className="relative mx-2 flex flex-col items-center">
                      <motion.div
                        style={{
                          width: 'min(34vw, 150px)', height: 'min(11vw, 46px)', borderRadius: '6px 6px 75px 75px',
                          background: 'linear-gradient(180deg, #fbbf24 0%, #b45309 45%, #78350f 100%)',
                          boxShadow: 'inset 0 3px 0 rgba(255,255,255,0.35), 0 6px 16px rgba(0,0,0,0.7)',
                        }}
                        animate={{ boxShadow: draining
                          ? 'inset 0 3px 0 rgba(255,255,255,0.35), 0 6px 16px rgba(0,0,0,0.7), 0 0 30px 8px rgba(245,158,11,0.55)'
                          : 'inset 0 3px 0 rgba(255,255,255,0.35), 0 6px 16px rgba(0,0,0,0.7)' }}
                        transition={{ duration: 0.8 }}
                      />
                      <div style={{ width: 60, height: 9, background: '#78350f', borderRadius: 2 }} />
                    </div>
                  )}
                  <span
                    className={`block select-none leading-none ${!out && !reduceMotion ? 'animate-candle-flicker' : ''}`}
                    style={{
                      fontSize: 22, animationDelay: `${-i * 0.3}s`,
                      opacity: out ? 0.35 : 1,
                      filter: out ? 'grayscale(1) brightness(0.4)' : `drop-shadow(0 0 8px ${AMBER})`,
                      transition: 'opacity 300ms, filter 300ms',
                    }}
                  >
                    🕯️
                  </span>
                </React.Fragment>
              );
            })}

            {/* coins streaming up into the bowl */}
            {draining && !reduceMotion && stream.map((c, i) => (
              <motion.span
                key={i}
                className="pointer-events-none absolute left-1/2 block select-none text-[15px] leading-none"
                style={{ marginLeft: c.x }}
                initial={{ y: 90, opacity: 0 }}
                animate={{ y: [90, 10, -6], opacity: [0, 1, 0] }}
                transition={{ duration: 0.7, delay: c.delay, ease: 'easeIn' }}
              >
                🪙
              </motion.span>
            ))}
          </div>

          {/* your bankroll, draining */}
          <div className="text-center">
            <div className="font-pixel text-r-8 tracking-[0.3em]" style={{ color: 'rgba(252,211,77,0.55)' }}>YOUR BANKROLL</div>
            <div className="mt-1 font-pixel text-r-14 font-bold" style={{ color: draining ? '#f87171' : '#fcd34d', transition: 'color 400ms' }}>
              ${Math.round(display / 100).toLocaleString('en-US')}
            </div>
          </div>
        </div>
      )}

      {/* His line, in the dark */}
      {showLine && (
        <div className="absolute inset-0 z-[6] flex items-center justify-center px-6">
          <motion.div
            className="max-w-md text-center italic"
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 'clamp(20px, 5.6vw, 28px)', color: '#fcd34d', letterSpacing: '0.03em',
              textShadow: `0 0 18px ${AMBER}, 0 2px 6px rgba(0,0,0,0.9)`,
            }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            &ldquo;{line}&rdquo;
            <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: 'rgba(245,158,11,0.65)' }}>
              — THE HIEROPHANT
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
