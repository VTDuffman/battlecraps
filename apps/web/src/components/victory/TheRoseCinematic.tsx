// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: THE ROSE (FB-034, Mme. Le Prix)
// apps/web/src/components/victory/TheRoseCinematic.tsx
//
// You beat Mme. Le Prix. She doesn't clap — she tosses you a rose. A single
// red rose arcs in from the top, lands on the table with a small bounce and
// settles at an angle; a few petals shake loose and drift away; a harp
// flourish; then her line, softly.
//
// Timeline (ms): 0 rose thrown → 600 harp flourish → 1150 lands (petals) →
// 1800 line → 3900 fade → 4200 onFinish. Runs inside the store's celebration
// hold (VICTORY_HOLD_MS).
// =============================================================================

import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playHarpFlourish } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const FLOURISH_AT = 600;
const LAND_AT     = 1150;
const LINE_AT     = 1800;
const FADE_AT     = 3900;
const FINISH_AT   = 4200;

/** Petals that shake loose on landing: drift (dx, dy) px, spin (deg), delay (s). */
const PETALS: ReadonlyArray<{ dx: number; dy: number; spin: number; delay: number }> = [
  { dx: -70, dy:  50, spin: -160, delay: 0.00 },
  { dx:  60, dy:  70, spin:  200, delay: 0.05 },
  { dx: -30, dy:  95, spin:  120, delay: 0.12 },
  { dx:  95, dy:  35, spin: -220, delay: 0.08 },
  { dx: -105, dy: 80, spin:  180, delay: 0.16 },
  { dx:  25, dy: 110, spin: -140, delay: 0.22 },
];

const Petal: React.FC<{ dx: number; dy: number; spin: number; delay: number }> = ({ dx, dy, spin, delay }) => (
  <motion.span
    className="absolute left-1/2 top-1/2 block"
    style={{
      width: 11, height: 15, marginLeft: -5, marginTop: -7,
      borderRadius: '80% 10% 80% 10%',
      background: 'radial-gradient(circle at 30% 30%, #fb7185, #be123c 70%)',
      boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
    }}
    initial={{ x: 0, y: 0, rotate: 0, opacity: 0, scale: 0.6 }}
    animate={{
      x:       [0, dx * 0.5, dx],
      y:       [0, -28, dy],          // pop up off the rose, then drift down
      rotate:  [0, spin * 0.4, spin],
      opacity: [0, 1, 0],
      scale:   [0.6, 1, 0.85],
    }}
    transition={{ duration: 2.2, delay, ease: 'easeOut' }}
  />
);

export const TheRoseCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion();
  const [landed,   setLanded]   = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading,   setFading]   = useState(false);

  useEffect(() => {
    const timers = [
      window.setTimeout(playHarpFlourish, FLOURISH_AT),
      window.setTimeout(() => setLanded(true), LAND_AT),
      window.setTimeout(() => setShowLine(true), LINE_AT),
      window.setTimeout(() => setFading(true), FADE_AT),
      window.setTimeout(onFinish, FINISH_AT),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-5 transition-opacity duration-300"
      style={{ background: 'radial-gradient(ellipse at center, rgba(80,7,36,0.35), rgba(0,0,0,0.55))', opacity: fading ? 0 : 1 }}
    >
      {/* The rose + its petals, centred on the landing spot */}
      <div className="relative" style={{ width: 120, height: 120 }}>
        <motion.span
          className="absolute left-1/2 top-1/2 block select-none leading-none"
          style={{
            fontSize: 'clamp(64px, 16vw, 92px)',
            marginLeft: '-0.5em', marginTop: '-0.5em', width: '1em', height: '1em',
            filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.6))',
          }}
          initial={reduceMotion
            ? { opacity: 0, rotate: -28 }
            : { x: '-38vw', y: '-55vh', rotate: -220, opacity: 0, scale: 0.7 }}
          animate={reduceMotion
            ? { opacity: 1, rotate: -28 }
            : {
                // Thrown from the upper left, a lazy spin, a little bounce, settles.
                x:       ['-38vw', '-14vw', '0vw', '0vw', '0vw'],
                y:       ['-55vh', '-32vh', '0vh', '-3vh', '0vh'],
                rotate:  [-220, -120, -36, -24, -28],
                opacity: [0, 1, 1, 1, 1],
                scale:   [0.7, 0.95, 1, 1.04, 1],
              }}
          transition={reduceMotion
            ? { duration: 0.6 }
            : { duration: 1.4, times: [0, 0.4, 0.8, 0.9, 1], ease: 'easeOut' }}
        >
          🌹
        </motion.span>

        {landed && !reduceMotion && PETALS.map((p, i) => <Petal key={i} {...p} />)}
      </div>

      {/* Her line — soft, elegant, unhurried */}
      {showLine && (
        <motion.div
          className="mt-6 max-w-md text-center italic"
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize:   'clamp(17px, 4.6vw, 22px)',
            color:      '#fde2e4',
            letterSpacing: '0.02em',
            textShadow: '0 2px 8px rgba(0,0,0,0.95), 0 0 18px rgba(190,18,60,0.45)',
          }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          &ldquo;{line}&rdquo;
          <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: '#f9a8d4', opacity: 0.8 }}>
            — MME. LE PRIX
          </div>
        </motion.div>
      )}
    </div>
  );
};
