// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: ESCAPE VELOCITY (FB-038, The Commander)
// apps/web/src/components/victory/EscapeVelocityCinematic.tsx
//
// You beat The Commander, and you break orbit. Your ship hangs in a low orbit
// over a huge planet; the main engines ignite and roar; the ship powers up and
// away, the planet falls behind, and the stars stretch into hyperspace streaks
// until a flash marks the jump. Then quiet stars, and his line. Built at the
// scale of THE ROSE (big wins, big losses).
//
// Timeline (ms): 0 low orbit → 600 ignition (roar) → 900 the ship powers away
// → 1200 the planet falls away → 1700 stars streak → 3600 the jump (flash,
// boom) → 4000 quiet stars → 4400 line → 7600 fade → 8000 onFinish. Runs inside
// the celebration hold (VICTORY_HOLD_MS_BY_ID).
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playEngineRoar, playHyperJump } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const IGNITE_AT = 600;
const LAUNCH_AT = 900;
const STREAK_AT = 1700;
const JUMP_AT   = 3600;
const LINE_AT   = 4400;
const FADE_AT   = 7600;   // ~3 s to read
const FINISH_AT = 8000;

function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export const EscapeVelocityCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const [ignited,  setIgnited]  = useState(false);
  const [launched, setLaunched] = useState(false);
  const [streak,   setStreak]   = useState(false);
  const [jumped,   setJumped]   = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading,   setFading]   = useState(false);

  const stars = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    angle: rand(i) * 360, dist: 8 + rand(i + 70) * 46, size: 1 + rand(i + 140) * 1.8, twinkle: 1.5 + rand(i + 210) * 2,
  })), []);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(IGNITE_AT, () => { setIgnited(true); playEngineRoar(); });
    at(LAUNCH_AT, () => setLaunched(true));
    at(STREAK_AT, () => setStreak(true));
    at(JUMP_AT - 500, playHyperJump);   // its boom lands ~0.5 s in
    at(JUMP_AT,   () => setJumped(true));
    at(LINE_AT,   () => setShowLine(true));
    at(FADE_AT,   () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500"
      style={{ opacity: fading ? 0 : 1, background: 'radial-gradient(ellipse at 50% 40%, #111a3a 0%, #070b1e 60%, #02030a 100%)' }}>

      {/* stars — still, then stretching into hyperspace streaks from the centre */}
      <div className="absolute left-1/2 top-[40%]">
        {stars.map((s, i) => (
          <motion.span
            key={i}
            className="absolute block rounded-full"
            style={{
              height: s.size, width: s.size, left: 0, top: 0, background: '#e2e8f0',
              transformOrigin: '0 50%', rotate: s.angle,
            }}
            initial={{ x: `${s.dist}vmin`, opacity: 0.8 }}
            animate={streak && !jumped && !reduceMotion
              ? { x: [`${s.dist}vmin`, `${s.dist * 2.2}vmin`], width: [s.size, 60 + s.dist * 3], opacity: [0.8, 1] }
              : jumped
                ? { x: `${s.dist}vmin`, width: s.size, opacity: [0, 0.8] }
                : { opacity: reduceMotion ? 0.8 : [0.4, 0.9, 0.4] }}
            transition={streak && !jumped
              ? { duration: (JUMP_AT - STREAK_AT) / 1000, ease: 'easeIn' }
              : jumped ? { duration: 1.2 } : { duration: s.twinkle, repeat: Infinity }}
          />
        ))}
      </div>

      {/* the planet — huge below, then falling away */}
      <motion.div
        className="absolute left-1/2 rounded-full"
        style={{
          width: '160vmax', height: '160vmax', marginLeft: '-80vmax', top: '62vh',
          background: 'radial-gradient(circle at 50% 8%, #7dd3fc 0%, #2563eb 6%, #1e3a8a 14%, #0b1a4a 30%)',
          boxShadow: '0 -10px 60px 10px rgba(125,211,252,0.35)',
        }}
        initial={{ y: 0, scale: 1 }}
        animate={launched && !reduceMotion ? { y: '60vh', scale: 0.6, opacity: [1, 1, 0] } : { y: 0, scale: 1 }}
        transition={{ duration: 2.4, ease: 'easeIn' }}
      />

      {/* the ship */}
      <motion.div
        className="absolute left-1/2 top-1/2"
        style={{ marginLeft: -28, marginTop: -28, width: 56, height: 56 }}
        initial={{ x: '-22vw', y: '6vh', scale: 1 }}
        animate={reduceMotion
          ? { x: 0, y: 0, opacity: jumped ? 0 : 1 }
          : launched
            ? { x: ['-22vw', '-6vw', '0vw', '0vw'], y: ['6vh', '-4vh', '-10vh', '-12vh'], scale: [1, 1.15, 0.6, 0.05], opacity: [1, 1, 1, 0] }
            : { x: ['-22vw', '-18vw'], y: ['6vh', '5vh'] }}
        transition={launched && !reduceMotion
          ? { duration: (JUMP_AT - LAUNCH_AT) / 1000 + 0.1, times: [0, 0.35, 0.85, 1], ease: 'easeIn' }
          : { duration: 1.2, ease: 'linear' }}
      >
        {/* engine flame */}
        {ignited && (
          <motion.span
            className="absolute block rounded-full"
            style={{ width: 34, height: 34, left: -14, top: 30, background: 'radial-gradient(circle, #fff7ed 0%, #fb923c 40%, rgba(234,88,12,0) 72%)', filter: 'blur(1px)' }}
            animate={reduceMotion ? {} : { scale: [0.8, 1.35, 0.9, 1.4], opacity: [0.85, 1, 0.8, 1] }}
            transition={{ duration: 0.18, repeat: Infinity }}
          />
        )}
        <span className="relative block select-none leading-none" style={{ fontSize: 50, transform: 'rotate(0deg)', filter: 'drop-shadow(0 0 10px rgba(226,232,240,0.6))' }}>🚀</span>
      </motion.div>

      {/* the jump */}
      {jumped && (
        <motion.div className="absolute inset-0 bg-white"
          initial={{ opacity: reduceMotion ? 0.4 : 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
      )}

      {/* his line */}
      {showLine && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <motion.div
            className="max-w-md text-center italic"
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 'clamp(18px, 5vw, 24px)', color: '#e2e8f0', letterSpacing: '0.02em',
              textShadow: '0 2px 8px rgba(0,0,0,0.9), 0 0 18px rgba(125,211,252,0.5)',
            }}
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, ease: 'easeOut' }}
          >
            &ldquo;{line}&rdquo;
            <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: 'rgba(251,146,60,0.85)' }}>
              — THE COMMANDER
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
