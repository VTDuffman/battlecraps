// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: LOSS OF SIGNAL (FB-038, The Commander)
// apps/web/src/components/defeat/LossOfSignalCinematic.tsx
//
// The Commander ended your run: your orbit gives out. The screen falls into
// the atmosphere — a master-caution flash, the edges glowing orange, plasma
// streaming up past you, everything shaking harder and harder under a rising
// roar — and then every sound cuts out at once. Dead silence. Static. LOSS OF
// SIGNAL. And in the silence: "In space, no one can hear you scream."
// Built at the scale of THE ROSE (big wins, big losses).
//
// Timeline (ms): 0 MASTER CAUTION → 300 re-entry (roar builds, shaking,
// plasma) → 3500 the cut: black, silence → 3700 static (silent) → 4500 LOSS OF
// SIGNAL → 5000 line → 7900 fade → 8300 onFinish (game over continues; under
// the store's 9 s safety net).
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playReentryRoar } from '../../hooks/useCrowdAudio.js';
import type { DefeatCinematicProps } from './registry.js';

const REENTRY_AT = 300;
const CUT_AT     = 3500;
const STATIC_AT  = 3700;
const LOS_AT     = 4500;
const LINE_AT    = 5000;
const FADE_AT    = 7900;
const FINISH_AT  = 8300;

function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Silent TV static — a low-res canvas of random grey noise, scaled up. */
const Static: React.FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.width, h = canvas.height;
    let id = 0;
    const draw = () => {
      const img = ctx.createImageData(w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 200;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      if (!reduceMotion) id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, [reduceMotion]);
  return <canvas ref={ref} width={160} height={100} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'pixelated', opacity: 0.55 }} />;
};

export const LossOfSignalCinematic: React.FC<DefeatCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const [reentry, setReentry]   = useState(false);
  const [cut, setCut]           = useState(false);
  const [staticOn, setStaticOn] = useState(false);
  const [los, setLos]           = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading, setFading]     = useState(false);

  const streaks = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    left: rand(i) * 100, w: 2 + rand(i + 30) * 5, len: 18 + rand(i + 60) * 30, dur: 0.35 + rand(i + 90) * 0.4, delay: rand(i + 120) * 0.6,
  })), []);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(REENTRY_AT, () => { setReentry(true); playReentryRoar((CUT_AT - REENTRY_AT) / 1000); });
    at(CUT_AT,    () => setCut(true));
    at(STATIC_AT, () => setStaticOn(true));
    at(STATIC_AT + 700, () => setStaticOn(false));
    at(LOS_AT,    () => setLos(true));
    at(LINE_AT,   () => setShowLine(true));
    at(FADE_AT,   () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shaking = reentry && !cut && !reduceMotion;

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500" style={{ opacity: fading ? 0 : 1 }}>
      {/* ── the fall ── */}
      {!cut && (
        <motion.div
          className="absolute inset-0"
          animate={shaking ? { x: [0, -3, 4, -6, 5, -8, 7, -10, 9, 0], y: [0, 3, -4, 5, -6, 7, -8, 9, -10, 0] } : { x: 0, y: 0 }}
          transition={shaking ? { duration: (CUT_AT - REENTRY_AT) / 1000, ease: 'easeIn' } : { duration: 0.2 }}
        >
          {/* the table falling away under a darkening tint */}
          <div className="absolute inset-0" style={{ background: 'rgba(10,6,4,0.55)' }} />

          {/* master caution */}
          <motion.div
            className="absolute inset-x-0 top-[12vh] text-center font-pixel text-r-12 font-bold tracking-[0.3em]"
            style={{ color: '#ef4444', textShadow: '0 0 12px rgba(239,68,68,0.9)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.2, 1, 0.2, 1, 0.3] }}
            transition={{ duration: 1.6, ease: 'linear' }}
          >
            ⚠ MASTER CAUTION — ORBIT DECAYED
          </motion.div>

          {/* the edges glow hotter and hotter */}
          <motion.div
            className="absolute inset-0"
            style={{ boxShadow: 'inset 0 0 120px 40px rgba(249,115,22,0.85), inset 0 -80px 160px 60px rgba(239,68,68,0.7)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: reentry ? 1 : 0 }}
            transition={{ duration: (CUT_AT - REENTRY_AT) / 1000 * 0.8, ease: 'easeIn' }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0"
            style={{ background: 'linear-gradient(0deg, rgba(255,237,213,0.9), rgba(251,146,60,0.65) 25%, rgba(234,88,12,0.25) 55%, transparent)' }}
            initial={{ height: '0%' }}
            animate={{ height: reentry ? '70%' : '0%' }}
            transition={{ duration: (CUT_AT - REENTRY_AT) / 1000, ease: 'easeIn' }}
          />

          {/* plasma streaming up past you */}
          {reentry && !reduceMotion && streaks.map((s, i) => (
            <motion.span
              key={i}
              className="absolute bottom-0 block rounded-full"
              style={{ left: `${s.left}%`, width: s.w, height: `${s.len}vh`, background: 'linear-gradient(0deg, rgba(255,247,237,0.95), rgba(251,146,60,0.7), transparent)' }}
              initial={{ y: '20vh', opacity: 0 }}
              animate={{ y: '-110vh', opacity: [0, 1, 0.8, 0] }}
              transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: 'linear' }}
            />
          ))}
        </motion.div>
      )}

      {/* ── the cut: black and silent ── */}
      {cut && <div className="absolute inset-0 bg-black" />}
      {cut && staticOn && <Static reduceMotion={reduceMotion} />}

      {los && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
          <motion.div
            className="font-mono text-[clamp(20px,6vw,34px)] font-bold tracking-[0.35em]"
            style={{ color: '#e5e7eb' }}
            initial={{ opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: [0, 1, 0.3, 1, 1, 0.5, 1] }}
            transition={{ duration: 1.2, ease: 'linear' }}
          >
            LOSS OF SIGNAL
          </motion.div>
          {showLine && (
            <motion.div
              className="mt-6 max-w-md text-center italic"
              style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 'clamp(17px, 4.6vw, 22px)', color: 'rgba(229,231,235,0.85)', letterSpacing: '0.02em' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            >
              &ldquo;{line}&rdquo;
              <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: 'rgba(148,163,184,0.7)' }}>
                — THE COMMANDER
              </div>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
};
