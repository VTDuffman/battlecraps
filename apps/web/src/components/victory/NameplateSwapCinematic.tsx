// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: THE NAMEPLATE SWAP (FB-035, The Executive)
// apps/web/src/components/victory/NameplateSwapCinematic.tsx
//
// You beat The Executive. The Corner Office door swings into view with his
// brass nameplate on it; the four screws spin out one by one, the plate tips
// on its last screw and drops out of frame with a clang; a new plate slides
// in — THE SHOOTER — a gold glint sweeps across it, an office-chime fanfare
// plays and ticker tape rains down. Then his line: restructuring was
// inevitable. Built at the scale of THE ROSE (big wins, big losses).
//
// Timeline (ms): 0 door in → 900 screws out (×3, 170 apart) → 1650 plate
// tips on the top screw → 1950 it goes, the plate falls → 2250 clang → 2600 new plate slides in → 3000 lands
// (fanfare, glint, ticker tape) → 3500 line → 5500 fade → 5900 onFinish.
// Runs inside the store's celebration hold (VICTORY_HOLD_MS_BY_ID).
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { playOfficeFanfare, playPlateClang, playReviewTick } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const SCREWS_AT   = 900;
const SCREW_STEP  = 170;
const TIP_AT      = 1650;
const FALL_AT     = 1950;
const CLANG_AT    = 2250;
const NEW_AT      = 2600;
const LANDED_AT   = 3000;
const LINE_AT     = 3500;
const FADE_AT     = 5500;
const FINISH_AT   = 5900;

const TAPE_COUNT = 46;

const BRASS     = 'linear-gradient(160deg, #f6e7a1 0%, #c9a227 38%, #8a6a12 62%, #e5c96b 100%)';
const BRASS_NEW = 'linear-gradient(160deg, #fff6c8 0%, #f5c842 40%, #b8891a 64%, #ffe58a 100%)';

function rand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/** Screw positions on the plate (corners), as % of the plate box. */
const SCREWS: ReadonlyArray<{ left: string; top: string }> = [
  { left: '5%',  top: '50%' },
  { left: '95%', top: '50%' },
  { left: '50%', top: '10%' },
  { left: '50%', top: '90%' },
];

const Screw: React.FC<{ out: boolean; index: number }> = ({ out, index }) => (
  <motion.span
    className="absolute block rounded-full"
    style={{
      width: 14, height: 14, marginLeft: -7, marginTop: -7,
      left: SCREWS[index]?.left, top: SCREWS[index]?.top,
      background: 'radial-gradient(circle at 35% 30%, #fafafa, #9ca3af 55%, #4b5563)',
      boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
    }}
    initial={false}
    animate={out
      ? { rotate: [0, 540, 900], x: [0, 0, (index % 2 ? 26 : -26)], y: [0, -6, 140], opacity: [1, 1, 0], scale: [1, 1.25, 1] }
      : { rotate: 0 }}
    transition={{ duration: 0.75, times: [0, 0.45, 1], ease: 'easeIn' }}
  >
    {/* the slot */}
    <span className="absolute left-1/2 top-1/2 block h-[2px] w-[9px] -translate-x-1/2 -translate-y-1/2" style={{ background: '#374151' }} />
  </motion.span>
);

const Nameplate: React.FC<{ text: string; brass: string; children?: React.ReactNode }> = ({ text, brass, children }) => (
  <div
    className="relative flex items-center justify-center overflow-hidden rounded-sm"
    style={{
      width: 'min(82vw, 400px)', height: 'clamp(70px, 18vw, 96px)',
      background: brass,
      border: '2px solid #6b4f0e',
      boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.55), inset 0 -3px 6px rgba(0,0,0,0.35), 0 8px 18px rgba(0,0,0,0.6)',
    }}
  >
    <span
      className="select-none font-bold"
      style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 'clamp(22px, 6.4vw, 34px)',
        letterSpacing: '0.16em',
        color: '#3d2c05',
        textShadow: '0 1px 0 rgba(255,240,180,0.7), 0 -1px 0 rgba(0,0,0,0.35)',   // engraved
      }}
    >
      {text}
    </span>
    {children}
  </div>
);

export const NameplateSwapCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish }) => {
  const reduceMotion = useReducedMotion();
  const [screwsOut, setScrewsOut] = useState(0);
  const [tipped,   setTipped]   = useState(false);
  const [fallen,   setFallen]   = useState(false);
  const [newIn,    setNewIn]    = useState(false);
  const [landed,   setLanded]   = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading,   setFading]   = useState(false);

  const tape = useMemo(() => Array.from({ length: TAPE_COUNT }, (_, i) => ({
    x:     (rand(i) - 0.5) * window.innerWidth,
    sway:  20 + rand(i + 40) * 40,
    w:     4 + rand(i + 80) * 5,
    h:     16 + rand(i + 120) * 22,
    spin:  (rand(i + 160) > 0.5 ? 1 : -1) * (360 + rand(i + 200) * 540),
    delay: rand(i + 240) * 1.1,
    dur:   2.4 + rand(i + 280) * 1.0,
    tint:  ['#f8fafc', '#fef9c3', '#e2e8f0', '#fde68a'][i % 4] ?? '#f8fafc',
  })), []);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    // Three screws spin out; the plate tips on the top one, which goes last.
    for (let i = 0; i < 3; i++) {
      at(SCREWS_AT + i * SCREW_STEP, () => { setScrewsOut(i + 1); playReviewTick(1); });
    }
    at(TIP_AT,    () => setTipped(true));
    at(FALL_AT,   () => { setFallen(true); playReviewTick(1); });
    at(CLANG_AT,  playPlateClang);
    at(NEW_AT,    () => setNewIn(true));
    at(LANDED_AT, () => { setLanded(true); playOfficeFanfare(); });
    at(LINE_AT,   () => setShowLine(true));
    at(FADE_AT,   () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="fixed inset-0 overflow-hidden transition-opacity duration-500"
      style={{ background: 'radial-gradient(ellipse at center, rgba(30,24,10,0.55), rgba(0,0,0,0.72))', opacity: fading ? 0 : 1 }}
    >
      {/* Ticker tape */}
      {landed && !reduceMotion && (
        <div className="absolute left-1/2 top-0">
          {tape.map((t, i) => (
            <motion.span
              key={i}
              className="absolute block"
              style={{ width: t.w, height: t.h, background: t.tint, boxShadow: '0 1px 2px rgba(0,0,0,0.35)' }}
              initial={{ x: t.x, y: -60, rotate: 0, opacity: 0 }}
              animate={{
                x:       [t.x, t.x + t.sway, t.x - t.sway * 0.6, t.x + t.sway * 0.4],
                y:       [-60, window.innerHeight * 0.35, window.innerHeight * 0.7, window.innerHeight + 40],
                rotate:  [0, t.spin * 0.4, t.spin * 0.75, t.spin],
                opacity: [0, 1, 1, 0.9],
              }}
              transition={{ duration: t.dur, delay: t.delay, ease: 'linear' }}
            />
          ))}
        </div>
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        {/* The Corner Office door */}
        <motion.div
          className="relative flex flex-col items-center rounded-t-md"
          style={{
            width: 'min(92vw, 460px)',
            padding: 'clamp(18px, 5vw, 30px) 0 clamp(34px, 9vw, 56px)',
            background: 'linear-gradient(90deg, #3b1d0e, #5a2e16 18%, #4a2512 50%, #5a2e16 82%, #3b1d0e)',
            border: '3px solid #2a1408',
            boxShadow: '0 20px 40px rgba(0,0,0,0.7), inset 0 0 0 10px rgba(0,0,0,0.12)',
          }}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
        >
          <div className="mb-3 font-pixel text-r-8 tracking-[0.4em]" style={{ color: 'rgba(245,200,66,0.65)' }}>
            CORNER OFFICE
          </div>

          {/* The plate slot */}
          <div className="relative" style={{ width: 'min(82vw, 400px)', minHeight: 'clamp(70px, 18vw, 96px)' }}>
            {/* His plate: screws out, tips on the last one, drops */}
            {!fallen || !reduceMotion ? (
              <motion.div
                style={{ transformOrigin: '50% 10%' }}   // hangs from the top screw
                initial={false}
                animate={fallen
                  ? (reduceMotion ? { opacity: 0 } : { rotate: 38, y: 520, opacity: [1, 1, 0] })
                  : tipped ? { rotate: [0, 18, 11, 14] } : { rotate: 0 }}
                transition={fallen
                  ? { duration: 0.5, ease: 'easeIn' }
                  : { duration: 0.35, ease: 'easeOut' }}
              >
                <Nameplate text="THE EXECUTIVE" brass={BRASS}>
                  {SCREWS.map((_, i) => (
                    // The top screw (index 2) is the last to go — the plate hangs from it.
                    <Screw key={i} index={i} out={i === 2 ? fallen : screwsOut > (i === 3 ? 2 : i)} />
                  ))}
                </Nameplate>
              </motion.div>
            ) : null}

            {/* Your plate slides in */}
            {newIn && (
              <motion.div
                className="absolute inset-0"
                initial={reduceMotion ? { opacity: 0 } : { x: '120%', opacity: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { x: ['120%', '-4%', '1.5%', '0%'], opacity: 1 }}
                transition={{ duration: 0.4, times: [0, 0.7, 0.88, 1], ease: 'easeOut' }}
              >
                <Nameplate text="THE SHOOTER" brass={BRASS_NEW}>
                  {/* gold glint sweeping across */}
                  {landed && !reduceMotion && (
                    <motion.span
                      className="pointer-events-none absolute inset-y-0 block"
                      style={{ width: '30%', background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.85), transparent)' }}
                      initial={{ left: '-35%' }}
                      animate={{ left: ['-35%', '110%', '110%', '-35%', '110%'] }}
                      transition={{ duration: 2.2, times: [0, 0.3, 0.55, 0.56, 0.9], ease: 'easeInOut' }}
                    />
                  )}
                </Nameplate>
              </motion.div>
            )}
          </div>

          {/* The door handle */}
          <span className="absolute block rounded-full" style={{
            right: '9%', top: '62%', width: 18, height: 18,
            background: 'radial-gradient(circle at 35% 30%, #fff1b8, #c9a227 55%, #6b4f0e)',
            boxShadow: '0 2px 4px rgba(0,0,0,0.6)',
          }} />
        </motion.div>

        {/* His line */}
        {showLine && (
          <motion.div
            className="mt-7 max-w-md text-center italic"
            style={{
              fontFamily:    'Georgia, "Times New Roman", serif',
              fontSize:      'clamp(18px, 5vw, 24px)',
              color:         '#f1f5f9',
              letterSpacing: '0.02em',
              textShadow:    '0 2px 8px rgba(0,0,0,0.95), 0 0 18px rgba(245,200,66,0.35)',
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            &ldquo;{line}&rdquo;
            <div className="mt-2 not-italic font-pixel text-r-8 tracking-widest" style={{ color: 'rgba(245,200,66,0.8)' }}>
              — THE EXECUTIVE
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
