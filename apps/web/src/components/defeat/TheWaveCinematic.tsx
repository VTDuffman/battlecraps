// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: THE WAVE (FB-037, The Sovereign)
// apps/web/src/components/defeat/TheWaveCinematic.tsx
//
// The Sovereign ended your run. Unlike the waves in his fight, this one does
// not go back out. A dark wall of water surges up from the bottom and crashes
// over the whole table — foam bursting, the screen jolting — and everything is
// under. Your crew (the real rail portraits) and your money come loose and sink
// slowly into the deep, turning as they go, while the light above fades to
// black. "Your run will not outlast this tide." Built at the scale of THE ROSE.
//
// Timeline (ms): 0 the wall rises (roar) → 900 it breaks (crash, jolt, foam) →
// 1200 under water (rumble, bubbles) → 1400 your crew and bills sink (staggered,
// ~3 s each) → 4400 the light goes out → 4800 line → 7700 fade → 8100 onFinish
// (game over continues; under the store's 9 s safety net).
// =============================================================================

import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playUnderwater, playUndertow, playWaveCrash } from '../../hooks/useCrowdAudio.js';
import { measureRailCrew, setRailHidden, type RailMember } from '../cinematics/railCrew.js';
import type { DefeatCinematicProps } from './registry.js';

const RISE_S     = 0.9;
const BREAK_AT   = 900;
const UNDER_AT   = 1200;
const SINK_AT    = 1400;
const SINK_STEP  = 240;
const SINK_S     = 3.0;
const DARK_AT    = 4400;
const LINE_AT    = 4800;
const FADE_AT    = 7700;
const FINISH_AT  = 8100;
const BILLS      = 7;

function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export const TheWaveCinematic: React.FC<DefeatCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const [crew, setCrew]       = useState<RailMember[]>([]);
  const [broke, setBroke]     = useState(false);
  const [sinking, setSinking] = useState(false);
  const [dark, setDark]       = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading, setFading]   = useState(false);

  useLayoutEffect(() => { setCrew(measureRailCrew()); }, []);

  const bubbles = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    left: rand(i) * 100, size: 3 + rand(i + 40) * 9, delay: rand(i + 80) * 3, dur: 2.2 + rand(i + 120) * 2.5,
  })), []);
  const bills = useMemo(() => Array.from({ length: BILLS }, (_, i) => ({
    x: 15 + rand(i + 200) * 70, delay: rand(i + 240) * 1.2, spin: (rand(i + 280) > 0.5 ? 1 : -1) * (180 + rand(i + 320) * 360),
  })), []);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    // The crash in playWaveCrash lands ~0.66 s in — just before the wall breaks.
    at(BREAK_AT - 650, playWaveCrash);
    at(BREAK_AT, () => setBroke(true));
    at(UNDER_AT, playUnderwater);
    at(SINK_AT,  () => { setSinking(true); playUndertow(); });
    crew.forEach((m, i) => at(SINK_AT + i * SINK_STEP, () => setRailHidden(m.slot, true)));
    at(DARK_AT,   () => setDark(true));
    at(LINE_AT,   () => setShowLine(true));
    at(FADE_AT,   () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      crew.forEach((m) => setRailHidden(m.slot, false));
    };
  }, [crew]); // eslint-disable-line react-hooks/exhaustive-deps

  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  return (
    <div className={`fixed inset-0 overflow-hidden transition-opacity duration-500 ${broke && !reduceMotion ? 'animate-dock-impact-shake' : ''}`} style={{ opacity: fading ? 0 : 1 }}>
      {/* the wall of water — rises and does not go back */}
      <motion.div
        className="absolute inset-x-0 bottom-0"
        style={{ background: 'linear-gradient(180deg, rgba(8,64,84,0.92) 0%, rgba(4,40,58,0.96) 40%, rgba(2,20,32,0.98) 100%)' }}
        initial={{ height: reduceMotion ? '100%' : '0%' }}
        animate={{ height: '100%' }}
        transition={{ duration: reduceMotion ? 0 : RISE_S, ease: [0.5, 0, 0.75, 0] }}
      >
        {/* the breaking crest */}
        {!reduceMotion && (
          <motion.div
            className="absolute inset-x-0"
            style={{
              top: -30, height: 50,
              background: 'radial-gradient(ellipse 30px 16px at 8% 55%, rgba(255,255,255,0.95), transparent 70%), radial-gradient(ellipse 36px 18px at 26% 40%, rgba(255,255,255,0.9), transparent 70%), radial-gradient(ellipse 28px 14px at 46% 60%, rgba(255,255,255,0.95), transparent 70%), radial-gradient(ellipse 40px 18px at 66% 42%, rgba(255,255,255,0.9), transparent 70%), radial-gradient(ellipse 30px 15px at 86% 58%, rgba(255,255,255,0.95), transparent 70%), linear-gradient(180deg, transparent, rgba(236,254,255,0.85) 55%, rgba(165,243,252,0.4))',
            }}
            animate={broke ? { opacity: 0, y: 30, scaleY: 2.2 } : { opacity: 1, scaleY: [1, 1.3, 1] }}
            transition={broke ? { duration: 0.7 } : { duration: 0.5, repeat: Infinity }}
          />
        )}
      </motion.div>

      {/* the splash as it breaks */}
      {broke && !reduceMotion && Array.from({ length: 22 }, (_, i) => (
        <motion.span
          key={`s${i}`}
          className="absolute block rounded-full"
          style={{ left: `${rand(i + 400) * 100}%`, top: '2vh', width: 6 + rand(i + 440) * 10, height: 6 + rand(i + 440) * 10, background: 'rgba(236,254,255,0.85)' }}
          initial={{ y: 0, opacity: 1 }}
          animate={{ y: [0, -30 - rand(i + 480) * 60, 120], opacity: [1, 0.9, 0] }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        />
      ))}

      {/* bubbles, once everything is under */}
      {broke && !reduceMotion && bubbles.map((b, i) => (
        <motion.span
          key={`b${i}`}
          className="absolute block rounded-full"
          style={{ left: `${b.left}%`, bottom: '-3vh', width: b.size, height: b.size, border: '1px solid rgba(207,250,254,0.6)' }}
          initial={{ y: 0, opacity: 0 }}
          animate={{ y: '-108vh', opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: b.dur, delay: b.delay, repeat: Infinity, ease: 'linear' }}
        />
      ))}

      {/* your crew, sinking into the deep */}
      {sinking && crew.map((m, i) => (
        <motion.div
          key={m.slot}
          className="absolute flex items-center justify-center rounded-sm border-2"
          style={{
            left: m.x - m.size / 2, top: m.y - m.size / 2, width: m.size, height: m.size,
            background: '#0f2a1d', borderColor: 'rgba(212,160,23,0.6)',
          }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={reduceMotion
            ? { opacity: 0 }
            : {
                x:      [0, (i % 2 ? 18 : -18), (i % 2 ? -10 : 10), (i % 2 ? 8 : -8)],
                y:      [0, (vh - m.y) * 0.25, (vh - m.y) * 0.6, vh - m.y + 60],
                rotate: [0, i % 2 ? 25 : -25, i % 2 ? -15 : 15, i % 2 ? 40 : -40],
                opacity:[1, 0.95, 0.75, 0],
                scale:  [1, 0.95, 0.85, 0.7],
              }}
          transition={{ duration: reduceMotion ? 0.6 : SINK_S, delay: (i * SINK_STEP) / 1000, ease: 'easeIn' }}
        >
          <span className="select-none leading-none" style={{ fontSize: m.size * 0.6 }}>{m.emoji}</span>
        </motion.div>
      ))}

      {/* your money, going down with them */}
      {sinking && !reduceMotion && bills.map((b, i) => (
        <motion.span
          key={`m${i}`}
          className="absolute block select-none leading-none"
          style={{ left: `${b.x}%`, top: '14vh', fontSize: 26, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}
          initial={{ y: 0, rotate: 0, opacity: 0 }}
          animate={{ y: vh * 0.95, rotate: b.spin, opacity: [0, 1, 0.8, 0] }}
          transition={{ duration: SINK_S + 0.6, delay: b.delay, ease: 'easeIn' }}
        >
          💵
        </motion.span>
      ))}

      {/* the light goes out */}
      <motion.div
        className="absolute inset-0 bg-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: dark ? 0.82 : 0 }}
        transition={{ duration: 1.2 }}
      />

      {/* his line */}
      {showLine && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <motion.div
            className="max-w-md text-center italic"
            style={{
              fontFamily:    'Georgia, "Times New Roman", serif',
              fontSize:      'clamp(20px, 5.6vw, 28px)',
              color:         '#a5f3fc',
              letterSpacing: '0.02em',
              textShadow:    '0 0 18px rgba(14,116,144,0.95), 0 2px 6px rgba(0,0,0,0.9)',
            }}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          >
            &ldquo;{line}&rdquo;
            <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: 'rgba(253,224,71,0.75)' }}>
              — THE SOVEREIGN
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
