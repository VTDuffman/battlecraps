// =============================================================================
// BATTLECRAPS — DEFEAT CINEMATIC: ARCHIVED (FB-040, The Architect)
// apps/web/src/components/defeat/ArchivedCinematic.tsx
//
// The Architect ended your run, and he files it. Your actual table is redrawn
// as a blueprint — the board itself turns to a cyan line sketch
// ([data-table-root], WAAPI) — and a blueprint sheet of it takes its place,
// your crew drawn in. ARCHIVED · RUN #… is stamped across it; the sheet rolls up
// from the bottom (paper), the roll is carried to a filing drawer stuffed with
// other rolled runs, drops in, and the drawer slams shut. Then his line.
// He builds the next table from you. Big wins, big losses.
//
// Timeline (ms): 0 the board sketches → 1300 the sheet → 1900 stamp (held to
// read) → 3600 roll up (2 s) → 5800 carried to the drawer → 7300 drops in →
// 8100 slam → 8900 line (held ~3 s) → 11900 fade → 12400 onFinish (its own
// 14 s safety net in the store — DEFEAT_SAFETY_MS_BY_ID).
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../../store/useGameStore.js';
import { CREW_EMOJI } from '../CrewPortrait.js';
import { playDrawerSlam, playPaperRoll, playStampThud } from '../../hooks/useCrowdAudio.js';
import type { DefeatCinematicProps } from './registry.js';

const CYAN      = '#67e8f9';
const STAMP     = '#f43f5e';
const SHEET_AT  = 1300;
const STAMP_AT  = 1900;
const ROLL_AT   = 3600;
const ROLL_S    = 2.0;
const CARRY_AT  = 5800;
const CARRY_S   = 1.2;
const DROP_AT   = 7300;
const DROP_S    = 0.7;
const SLAM_AT   = 8100;
const LINE_AT   = 8900;
const FADE_AT   = 11900;
const FINISH_AT = 12400;

const SKETCH = 'grayscale(1) invert(1) sepia(1) hue-rotate(150deg) saturate(4) contrast(1.6) brightness(1.1)';

// The table's outline on the sheet (viewBox 100 × 100).
const OUTLINE = [
  'M8 6 H92 V94 H8 Z', 'M8 22 H92', 'M14 30 H86 V62 H14 Z', 'M14 66 H58 V74 H14 Z', 'M62 66 H86 V74 H62 Z',
  'M14 77 H32 V83 H14 Z M36 77 H54 V83 H36 Z M58 77 H76 V83 H58 Z', 'M8 88 H92',
];

const grid = {
  backgroundColor: 'rgb(10,44,78)',
  backgroundImage: `linear-gradient(${CYAN}26 1px, transparent 1px), linear-gradient(90deg, ${CYAN}26 1px, transparent 1px), linear-gradient(${CYAN}10 1px, transparent 1px), linear-gradient(90deg, ${CYAN}10 1px, transparent 1px)`,
  backgroundSize: '48px 48px, 48px 48px, 12px 12px, 12px 12px',
} as const;

export const ArchivedCinematic: React.FC<DefeatCinematicProps> = ({ line, pipTermination, onFinish }) => {
  const reduceMotion = useReducedMotion() === true;
  const runId     = useGameStore((s) => s.runId);
  const crewSlots = useGameStore((s) => s.crewSlots);
  const runNo     = (runId ?? '').replace(/-/g, '').slice(0, 6).toUpperCase() || '000000';
  const crew      = useMemo(() => crewSlots.filter((c): c is NonNullable<typeof c> => c !== null).map((c) => CREW_EMOJI[c.crewId] ?? '?'), [crewSlots]);

  const [sheet, setSheet]       = useState(false);
  const [stamped, setStamped]   = useState(false);
  const [rolling, setRolling]   = useState(false);
  const [carried, setCarried]   = useState(false);
  const [dropped, setDropped]   = useState(false);
  const [shut, setShut]         = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading, setFading]     = useState(false);

  useEffect(() => {
    // The board itself is redrawn as a blueprint.
    const board = document.querySelector<HTMLElement>('[data-table-root]');
    const anim = reduceMotion ? undefined : board?.animate(
      [{ filter: 'none' }, { filter: SKETCH }],
      { duration: 1200, easing: 'ease-in-out', fill: 'forwards' },
    );
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    at(SHEET_AT,  () => setSheet(true));
    at(STAMP_AT,  () => { setStamped(true); playStampThud(); });
    at(ROLL_AT,   () => { setRolling(true); playPaperRoll(); });
    at(CARRY_AT,  () => setCarried(true));
    at(DROP_AT,   () => setDropped(true));
    at(SLAM_AT - 360, playDrawerSlam);
    at(SLAM_AT,   () => setShut(true));
    at(LINE_AT,   () => setShowLine(true));
    at(FADE_AT,   () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => { timers.forEach((t) => window.clearTimeout(t)); anim?.cancel(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500" style={{ opacity: fading ? 0 : 1 }}>
      {/* the room behind it, once the sheet is up */}
      <motion.div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 40%, #0b1a2c, #02060c 75%)' }}
        initial={{ opacity: 0 }} animate={{ opacity: sheet ? 1 : 0 }} transition={{ duration: 0.4 }} />

      {/* the sheet — the table drawn up — rolls up from the bottom */}
      {sheet && !carried && (
        <motion.div
          className="absolute inset-y-0 left-1/2 -translate-x-1/2 overflow-hidden"
          style={{ ...grid, width: 'min(100vw, 512px)' }}
          initial={{ opacity: 0, clipPath: 'inset(0% 0% 0% 0%)' }}
          animate={rolling && !reduceMotion
            ? { opacity: 1, clipPath: 'inset(0% 0% 100% 0%)' }
            : { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)' }}
          transition={rolling ? { clipPath: { duration: ROLL_S, ease: [0.4, 0, 0.6, 1] } } : { duration: 0.5 }}
        >
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {OUTLINE.map((d) => <path key={d} d={d} fill="none" stroke={CYAN} strokeOpacity={0.85} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />)}
          </svg>
          {/* your crew, drawn in on the rail */}
          <div className="absolute inset-x-0 flex justify-around px-10" style={{ top: '89.5%' }}>
            {crew.map((e, i) => (
              <span key={i} className="select-none leading-none" style={{ fontSize: 22, filter: 'grayscale(1) brightness(1.6) drop-shadow(0 0 4px #67e8f9)', opacity: 0.85 }}>{e}</span>
            ))}
          </div>
          <div className="absolute right-4 bottom-[7%] text-right font-pixel text-[7px] leading-relaxed tracking-widest" style={{ color: `${CYAN}aa` }}>
            DRAWN BY: THE ARCHITECT<br />SHEET 1 OF 1 · SCALE 1:1
          </div>

          {/* the stamp */}
          {stamped && (
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                className="flex flex-col items-center rounded-md px-5 py-3"
                style={{ border: `5px double ${STAMP}`, background: 'rgba(40,0,10,0.35)', color: STAMP, textShadow: '0 0 10px rgba(244,63,94,0.5)' }}
                initial={{ scale: reduceMotion ? 1 : 2.4, opacity: 0, rotate: -14 }}
                animate={{ scale: 1, opacity: 0.95, rotate: -9 }}
                transition={{ duration: reduceMotion ? 0.3 : 0.28, ease: [0.5, 0, 0.75, 0] }}
              >
                <span className="font-pixel tracking-[0.25em]" style={{ fontSize: 'clamp(26px, 8vw, 40px)' }}>ARCHIVED</span>
                <span className="mt-1 font-pixel text-[11px] tracking-[0.3em]">RUN #{runNo}</span>
                {pipTermination && <span className="mt-1 font-pixel text-[8px] tracking-widest opacity-80">CAUSE: TERMINATED — PIP</span>}
              </motion.div>
            </div>
          )}
        </motion.div>
      )}

      {/* the roll itself — follows the rolling edge up the sheet */}
      {rolling && !carried && !reduceMotion && (
        <motion.div
          className="absolute left-1/2 h-7 -translate-x-1/2 rounded-full"
          style={{ width: 'min(100vw, 512px)', marginTop: -14, background: `linear-gradient(180deg, #0a2c4e, #2b6ea8 40%, #b6e6ff 55%, #2b6ea8 70%, #0a2c4e)`, boxShadow: '0 6px 14px rgba(0,0,0,0.6)' }}
          initial={{ top: '100%' }}
          animate={{ top: '0%', height: [16, 34] }}
          transition={{ duration: ROLL_S, ease: [0.4, 0, 0.6, 1] }}
        />
      )}

      {/* the filing drawer, stuffed with other runs */}
      {carried && (
        <motion.div
          className="absolute left-1/2 top-[58%] -translate-x-1/2"
          style={{ width: 260 }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0, x: shut && !reduceMotion ? [0, -7, 6, -3, 0] : 0 }}
          transition={{ duration: 0.6, x: { duration: 0.35 } }}
        >
          {/* the open drawer (slides shut) */}
          <motion.div
            className="relative mx-auto overflow-hidden rounded-t-sm"
            style={{ width: 230, height: 70, background: 'linear-gradient(180deg, #3a2a18, #1e140a)', border: '2px solid #5b4128', borderBottom: 'none' }}
            initial={{ y: -46 }}
            animate={{ y: shut ? 0 : -46 }}
            transition={shut ? { duration: 0.22, ease: [0.6, 0, 1, 0.6] } : { duration: 0.3 }}
          >
            {/* other rolled runs, ends up */}
            <div className="absolute inset-x-3 top-2 flex flex-wrap gap-1.5">
              {Array.from({ length: 14 }, (_, i) => (
                <span key={i} className="block rounded-full" style={{ width: 16, height: 16, background: 'radial-gradient(circle, #b6e6ff 0%, #2b6ea8 45%, #0a2c4e 70%)', boxShadow: '0 1px 2px rgba(0,0,0,0.6)' }} />
              ))}
            </div>
          </motion.div>
          {/* the cabinet front */}
          <div className="relative flex flex-col items-center rounded-sm py-3" style={{ background: 'linear-gradient(180deg, #4a3520, #2a1c0e)', border: '2px solid #6b4c2c', boxShadow: '0 10px 24px rgba(0,0,0,0.7)' }}>
            <div className="rounded-sm px-3 py-1 font-pixel text-[9px] tracking-[0.3em]" style={{ background: '#e7dcc4', color: '#3a2a18' }}>RUNS · FILED</div>
            <div className="mt-2 h-2 w-12 rounded-full" style={{ background: '#a88a5a' }} />
          </div>
        </motion.div>
      )}

      {/* our roll, carried over and dropped in */}
      {carried && !shut && (
        <motion.div
          className="absolute left-1/2 rounded-full"
          style={{ width: 150, height: 22, marginLeft: -75, background: `linear-gradient(180deg, #0a2c4e, #2b6ea8 40%, #b6e6ff 55%, #2b6ea8 70%, #0a2c4e)`, boxShadow: '0 4px 10px rgba(0,0,0,0.6)' }}
          initial={{ top: '4%', scaleX: 2.6, rotate: 0 }}
          animate={dropped
            ? { top: '56%', scaleX: 0.5, rotate: 90, opacity: [1, 1, 0] }
            : { top: '40%', scaleX: 1, rotate: -6 }}
          transition={dropped ? { duration: DROP_S, ease: 'easeIn' } : { duration: CARRY_S, ease: 'easeInOut' }}
        >
          <span className="absolute left-1/2 top-0 h-full w-3 -translate-x-1/2" style={{ background: STAMP, opacity: 0.85 }} />
        </motion.div>
      )}

      {/* his line */}
      {showLine && (
        <motion.div
          className="absolute inset-x-0 top-[22%] flex justify-center px-6"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2 }}
        >
          <div className="max-w-md text-center">
            <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(17px, 4.6vw, 22px)', color: '#e0f2fe', textShadow: `0 0 10px ${CYAN}88` }}>
              &ldquo;{line}&rdquo;
            </div>
            <div className="mt-2 font-pixel text-[9px] tracking-[0.3em]" style={{ color: `${CYAN}aa` }}>— THE ARCHITECT</div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
