// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: THE CROWN SINKS (FB-037, The Sovereign)
// apps/web/src/components/victory/TheCrownSinksCinematic.tsx
//
// You beat The Sovereign, and the last king of Atlantis loses his crown. The
// throne room is under water: light shafts sway down from the surface,
// bubbles rise. His crown slips loose and sinks — slow, rocking like a
// pendulum, drifting side to side as the water drags at it — and settles into
// the sand with a soft puff, tilted, while the light above fades. A glassy
// chime; then his line. Built at the scale of THE ROSE (big wins, big losses).
//
// Timeline (ms): 0 under water (rumble + bubbles) → 400 the crown starts to
// sink → 4000 it lands (thud, sand puff) → 4400 chime + line → 7600 fade →
// 8000 onFinish. Runs inside the celebration hold (VICTORY_HOLD_MS_BY_ID).
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playSandThud, playSunkenChime, playUnderwater } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const SINK_AT   = 400;
const SINK_S    = 3.6;
const LAND_AT   = SINK_AT + SINK_S * 1000;   // 4000
const LINE_AT   = 4400;
const FADE_AT   = 7600;   // ~3 s to read
const FINISH_AT = 8000;

function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export const TheCrownSinksCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const [sinking,  setSinking]  = useState(false);
  const [landed,   setLanded]   = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading,   setFading]   = useState(false);

  const bubbles = useMemo(() => Array.from({ length: 26 }, (_, i) => ({
    left: rand(i) * 100, size: 4 + rand(i + 50) * 10, delay: rand(i + 100) * 4, dur: 3 + rand(i + 150) * 3, sway: 8 + rand(i + 200) * 16,
  })), []);
  const sand = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    dx: (rand(i + 300) - 0.5) * 180, dy: -(20 + rand(i + 350) * 50), size: 3 + rand(i + 400) * 5,
  })), []);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    playUnderwater();
    at(SINK_AT,   () => setSinking(true));
    at(LAND_AT,   () => { setLanded(true); playSandThud(); });
    at(LINE_AT,   () => { setShowLine(true); playSunkenChime(); });
    at(FADE_AT,   () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const crownSize = 'clamp(110px, 30vw, 160px)';

  return (
    <div
      className="fixed inset-0 overflow-hidden transition-opacity duration-500"
      style={{ opacity: fading ? 0 : 1, background: 'linear-gradient(180deg, #0e7490 0%, #0b4f6c 35%, #072f45 70%, #031a28 100%)' }}
    >
      {/* light shafts from the surface — fading as the crown goes down */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0.9 }}
        animate={{ opacity: landed ? 0.35 : 0.9 }}
        transition={{ duration: 2 }}
      >
        {[18, 38, 62, 82].map((left, i) => (
          <motion.div
            key={left}
            className="absolute top-0"
            style={{
              left: `${left}%`, width: '14vw', height: '85vh', transformOrigin: 'top center',
              background: 'linear-gradient(180deg, rgba(207,250,254,0.30), rgba(207,250,254,0.05) 70%, transparent)',
              filter: 'blur(6px)',
            }}
            initial={{ rotate: -12 + i * 6 }}
            animate={reduceMotion ? {} : { rotate: [-12 + i * 6, -4 + i * 6, -12 + i * 6] }}
            transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </motion.div>

      {/* rising bubbles */}
      {!reduceMotion && bubbles.map((b, i) => (
        <motion.span
          key={i}
          className="absolute block rounded-full"
          style={{ left: `${b.left}%`, bottom: '-4vh', width: b.size, height: b.size, border: '1px solid rgba(207,250,254,0.7)', background: 'rgba(207,250,254,0.12)' }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: '-110vh', x: [0, b.sway, -b.sway, 0], opacity: [0, 0.9, 0.9, 0] }}
          transition={{ duration: b.dur, delay: b.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}

      {/* the sand */}
      <div className="absolute inset-x-0 bottom-0" style={{
        height: '20vh',
        background: 'radial-gradient(ellipse 120% 60% at 50% 0%, #c9a66b 0%, #9c7a45 40%, #5e4524 100%)',
        borderRadius: '50% 50% 0 0 / 22% 22% 0 0',
        boxShadow: 'inset 0 6px 14px rgba(0,0,0,0.35)',
      }} />

      {/* the crown */}
      <div className="absolute inset-x-0 flex justify-center" style={{ top: 0, bottom: '17vh' }}>
        <motion.span
          className="absolute block select-none leading-none"
          style={{ fontSize: crownSize, bottom: 0, filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.6)) drop-shadow(0 0 16px rgba(253,224,71,0.5))' }}
          initial={reduceMotion ? { y: 0, opacity: 0, rotate: -18 } : { y: '-62vh', rotate: 0, x: 0, opacity: 1 }}
          animate={reduceMotion
            ? { y: 0, opacity: 1, rotate: -18 }
            : sinking
              ? {
                  // a slow pendulum sink, the water dragging it side to side, easing as it nears the floor
                  y:      ['-62vh', '-46vh', '-30vh', '-16vh', '-6vh', '-1vh', '0vh'],
                  x:      [0, -28, 22, -16, 10, -4, 0],
                  rotate: [0, -24, 20, -16, 10, -22, -18],
                }
              : { y: '-62vh' }}
          transition={reduceMotion ? { duration: 0.8 } : { duration: SINK_S, times: [0, 0.18, 0.38, 0.58, 0.78, 0.92, 1], ease: 'easeInOut' }}
        >
          👑
        </motion.span>

        {/* the sand puff where it lands */}
        {landed && !reduceMotion && sand.map((p, i) => (
          <motion.span
            key={i}
            className="absolute block rounded-full"
            style={{ bottom: 0, width: p.size, height: p.size, background: '#d6b47a' }}
            initial={{ x: 0, y: 0, opacity: 0.9 }}
            animate={{ x: p.dx, y: [0, p.dy, p.dy * 0.4], opacity: [0.9, 0.7, 0] }}
            transition={{ duration: 1.6, ease: 'easeOut' }}
          />
        ))}
      </div>

      {/* his line */}
      {showLine && (
        <div className="absolute inset-x-0 flex justify-center px-6" style={{ top: '16vh' }}>
          <motion.div
            className="max-w-md text-center italic"
            style={{
              fontFamily:    'Georgia, "Times New Roman", serif',
              fontSize:      'clamp(18px, 5vw, 24px)',
              color:         '#e0f2fe',
              letterSpacing: '0.02em',
              textShadow:    '0 2px 8px rgba(0,0,0,0.85), 0 0 18px rgba(14,116,144,0.9)',
            }}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            &ldquo;{line}&rdquo;
            <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: 'rgba(253,224,71,0.8)' }}>
              — THE SOVEREIGN
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
