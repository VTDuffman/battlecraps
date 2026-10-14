// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: THE ROSE (FB-034, Mme. Le Prix)
// apps/web/src/components/victory/TheRoseCinematic.tsx
//
// You beat Mme. Le Prix. She doesn't clap — she tosses you a rose. A big red
// rose is thrown in from the upper left with a lazy spin, lands centre stage
// with a pink bloom and a bounce, and a spiral of petals bursts off it and
// swirls away while more petals shower down over the table; a harp flourish
// (its chord lands with the rose); then her line, softly.
//
// Timeline (ms): 0 rose thrown → 1100 harp flourish → 1800 lands (bloom,
// petal burst) → 2000 petal shower → 2600 line → 5300 fade → 5700 onFinish.
// Runs inside the store's celebration hold (VICTORY_HOLD_MS_BY_ID.THE_ROSE).
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playHarpFlourish } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const FLOURISH_AT = 1100;
const LAND_AT     = 1800;
const SHOWER_AT   = 2000;
const LINE_AT     = 2600;
const FADE_AT     = 5300;
const FINISH_AT   = 5700;

const BURST_COUNT  = 16;
const SHOWER_COUNT = 22;
const SWIRL_STEPS  = 10;

const PETAL_STYLE: React.CSSProperties = {
  borderRadius: '80% 10% 80% 10%',
  background:   'radial-gradient(circle at 30% 30%, #fb7185, #be123c 70%)',
  boxShadow:    '0 1px 3px rgba(0,0,0,0.5)',
};

/** Deterministic pseudo-random in [0, 1) so the layout is stable per render. */
function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

interface PetalPath { xs: number[]; ys: number[]; rot: number[]; size: number; delay: number; dur: number }

/** Burst petals: spiral outward from the rose, then sink with gravity. */
function burstPaths(): PetalPath[] {
  return Array.from({ length: BURST_COUNT }, (_, i) => {
    const start = (i / BURST_COUNT) * Math.PI * 2;
    const turn  = (rand(i) > 0.5 ? 1 : -1) * (1.2 + rand(i + 50) * 1.2);   // radians of swirl
    const reach = 110 + rand(i + 100) * 150;
    const xs: number[] = [], ys: number[] = [], rot: number[] = [];
    for (let k = 0; k <= SWIRL_STEPS; k++) {
      const t = k / SWIRL_STEPS;
      const a = start + turn * t;
      const r = reach * Math.sqrt(t);
      xs.push(Math.cos(a) * r);
      ys.push(Math.sin(a) * r * 0.7 - 40 * Math.sin(Math.PI * t) + 160 * t * t);  // pop, then fall
      rot.push(t * (rand(i + 7) > 0.5 ? 540 : -540));
    }
    return { xs, ys, rot, size: 12 + rand(i + 3) * 8, delay: rand(i + 9) * 0.12, dur: 2.8 + rand(i + 11) * 0.8 };
  });
}

/** Shower petals: fall from above the screen across its width, swaying. */
function showerPaths(w: number, h: number): PetalPath[] {
  return Array.from({ length: SHOWER_COUNT }, (_, i) => {
    const x0   = (rand(i + 200) - 0.5) * w;
    const sway = 30 + rand(i + 300) * 50;
    const xs: number[] = [], ys: number[] = [], rot: number[] = [];
    for (let k = 0; k <= SWIRL_STEPS; k++) {
      const t = k / SWIRL_STEPS;
      xs.push(x0 + Math.sin(t * Math.PI * 2.5 + i) * sway);
      ys.push(-h * 0.6 + t * h * 1.1);
      rot.push(t * (rand(i + 400) > 0.5 ? 400 : -400));
    }
    return { xs, ys, rot, size: 10 + rand(i + 500) * 7, delay: rand(i + 600) * 1.2, dur: 3 + rand(i + 700) * 0.8 };
  });
}

const Petal: React.FC<{ path: PetalPath }> = ({ path }) => (
  <motion.span
    className="absolute left-1/2 top-1/2 block"
    style={{ ...PETAL_STYLE, width: path.size, height: path.size * 1.35, marginLeft: -path.size / 2, marginTop: -path.size / 2 }}
    initial={{ x: path.xs[0], y: path.ys[0], rotate: 0, opacity: 0 }}
    animate={{ x: path.xs, y: path.ys, rotate: path.rot, opacity: [0, 1, 1, 1, 0] }}
    transition={{ duration: path.dur, delay: path.delay, ease: 'linear' }}
  />
);

export const TheRoseCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion();
  const [landed,   setLanded]   = useState(false);
  const [shower,   setShower]   = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading,   setFading]   = useState(false);

  const burst   = useMemo(burstPaths, []);
  const raining = useMemo(() => showerPaths(window.innerWidth, window.innerHeight), []);

  useEffect(() => {
    const timers = [
      window.setTimeout(playHarpFlourish, FLOURISH_AT),
      window.setTimeout(() => setLanded(true), LAND_AT),
      window.setTimeout(() => setShower(true), SHOWER_AT),
      window.setTimeout(() => setShowLine(true), LINE_AT),
      window.setTimeout(() => setFading(true), FADE_AT),
      window.setTimeout(onFinish, FINISH_AT),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 overflow-hidden transition-opacity duration-500"
      style={{ background: 'radial-gradient(ellipse at center, rgba(110,10,48,0.45), rgba(0,0,0,0.6))', opacity: fading ? 0 : 1 }}
    >
      {/* Petal shower — from above, across the whole table */}
      {shower && !reduceMotion && (
        <div className="absolute left-1/2 top-1/2">
          {raining.map((p, i) => <Petal key={`s${i}`} path={p} />)}
        </div>
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center px-5">
        {/* The rose, its landing bloom, and the petal burst */}
        <div className="relative" style={{ width: 200, height: 200 }}>
          {landed && (
            <motion.span
              className="absolute left-1/2 top-1/2 block rounded-full"
              style={{ width: 320, height: 320, marginLeft: -160, marginTop: -160,
                       background: 'radial-gradient(circle, rgba(251,113,133,0.55), rgba(190,18,60,0.18) 45%, transparent 70%)' }}
              initial={{ scale: 0.2, opacity: 0 }}
              animate={{ scale: [0.2, 1.25, 1], opacity: [0, 1, 0.55] }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          )}

          <motion.span
            className="absolute left-1/2 top-1/2 block select-none leading-none"
            style={{
              fontSize: 'clamp(120px, 34vw, 180px)',
              marginLeft: '-0.5em', marginTop: '-0.5em', width: '1em', height: '1em',
              filter: 'drop-shadow(0 10px 16px rgba(0,0,0,0.65)) drop-shadow(0 0 18px rgba(244,63,94,0.45))',
            }}
            initial={reduceMotion
              ? { opacity: 0, rotate: -28 }
              : { x: '-42vw', y: '-60vh', rotate: -300, opacity: 0, scale: 0.5 }}
            animate={reduceMotion
              ? { opacity: 1, rotate: -28 }
              : {
                  // Thrown from the upper left: a lazy spin, a bounce, settles.
                  x:       ['-42vw', '-20vw', '0vw', '0vw', '0vw', '0vw'],
                  y:       ['-60vh', '-36vh', '0vh', '-5vh', '0vh', '0vh'],
                  rotate:  [-300, -160, -40, -20, -30, -28],
                  opacity: [0, 1, 1, 1, 1, 1],
                  scale:   [0.5, 0.85, 1.08, 0.96, 1.03, 1],
                }}
            transition={reduceMotion
              ? { duration: 0.6 }
              : { duration: 2.1, times: [0, 0.4, 0.86, 0.92, 0.97, 1], ease: 'easeOut' }}
          >
            🌹
          </motion.span>

          {landed && !reduceMotion && burst.map((p, i) => <Petal key={`b${i}`} path={p} />)}
        </div>

        {/* Her line — soft, elegant, unhurried */}
        {showLine && (
          <motion.div
            className="mt-8 max-w-md text-center italic"
            style={{
              fontFamily:    'Georgia, "Times New Roman", serif',
              fontSize:      'clamp(19px, 5.2vw, 26px)',
              color:         '#fde2e4',
              letterSpacing: '0.02em',
              textShadow:    '0 2px 8px rgba(0,0,0,0.95), 0 0 20px rgba(190,18,60,0.55)',
            }}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          >
            &ldquo;{line}&rdquo;
            <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: '#f9a8d4', opacity: 0.85 }}>
              — MME. LE PRIX
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
