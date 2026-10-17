// =============================================================================
// BATTLECRAPS — THE REBUILD (FB-040, The Architect)
// apps/web/src/components/RoomRebuild.tsx
//
// Each time The Architect builds a room — after his entry cinematic (the first
// room) and on every Seven-Out — he erases the table and draws the next one:
//   ERASE (0–0.8 s): an eraser band sweeps down; behind it the old table is
//     gone, wiped back to bare blueprint (a cyan drafting grid). Rubbing.
//   LOCK IN (~0.85 s): with a clunk the table is re-dressed as that boss's
//     floor (setConvergenceThemeRoom) — hidden under the blueprint — while pen
//     strokes draft its outlines and the room's card shows (sigil, ROOM n, boss).
//   DRAW (1.6–2.6 s): a glowing pen line sweeps down and inks the new table in
//     behind it (the blueprint is cleared away top to bottom). Pen scratches.
//
// Non-blocking (pointer-events none). Reduced motion: no overlay, the room is
// dressed at once. The first room builds once nothing else is playing.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GAUNTLET, MAX_CONVERGENCE_ROOMS } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { playBlueprintRebuild } from '../hooks/useCrowdAudio.js';

const CYAN    = '#67e8f9';
const PEAK_MS = 850;
const TOTAL_S = 2.8;
// The blueprint's coverage: wiped in top → bottom (erase), held, wiped out top → bottom (draw).
const ERASE_END = 0.8 / TOTAL_S;
const DRAW_START = 1.6 / TOTAL_S;
const DRAW_END   = 2.6 / TOTAL_S;

// Drafting strokes — rough outlines of the table (viewBox 100 × 100).
const STROKES = [
  'M8 6 H92 V94 H8 Z',            // the table edge
  'M8 22 H92',                     // the status wall
  'M14 30 H86 V62 H14 Z',          // the felt field
  'M14 66 H58 V74 H14 Z',          // pass line
  'M62 66 H86 V74 H62 Z',          // odds
  'M14 77 H32 V83 H14 Z M36 77 H54 V83 H36 Z M58 77 H76 V83 H58 Z',   // hardways
  'M8 88 H92',                     // the crew rail
  'M50 30 V62 M14 46 H86',         // construction lines
];

// Eraser crumbs shed along the sweep (x %, where in the sweep, size px).
const ERASER_CRUMBS = Array.from({ length: 22 }, (_, i) => ({
  x:    (i * 37) % 100,
  at:   (i * 23) % 96,
  size: 2 + (i % 3),
}));

interface Build { room: number; index: number; key: number }

export const RoomRebuild: React.FC = () => {
  const lastConvergence  = useGameStore((s) => s.lastConvergence);
  const rooms            = useGameStore((s) => s.convergenceRooms);
  const themeRoom        = useGameStore((s) => s.convergenceThemeRoom);
  const activeTransition = useGameStore((s) => s.activeTransition);
  const setThemeRoom     = useGameStore((s) => s.setConvergenceThemeRoom);
  const reduceMotion     = useReducedMotion() === true;

  const [build, setBuild] = useState<Build | null>(null);
  const keyRef = useRef(0);

  const start = (room: number, index: number) => {
    if (reduceMotion) { setThemeRoom(room); return; }
    keyRef.current += 1;
    setBuild({ room, index, key: keyRef.current });
  };

  // A room built by this roll's Seven-Out (rolls after mount only).
  const mountKey = useRef(lastConvergence?.key ?? 0);
  useEffect(() => {
    const c = lastConvergence;
    if (!c || c.key === mountKey.current || c.added === null) return;
    start(c.added, c.rooms.length);
  }, [lastConvergence?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The first room: rooms in force but the table not yet dressed — once his
  // entry cinematic (or any transition) is out of the way, build it.
  useEffect(() => {
    const newest = rooms[rooms.length - 1];
    if (themeRoom !== null || newest === undefined || build !== null || activeTransition !== null) return;
    const id = window.setTimeout(() => start(newest, rooms.length), 600);
    return () => window.clearTimeout(id);
  }, [rooms, themeRoom, build, activeTransition]); // eslint-disable-line react-hooks/exhaustive-deps

  // The peak: lock the room in, dress the table.
  useEffect(() => {
    if (!build) return;
    playBlueprintRebuild();
    const peak = window.setTimeout(() => setThemeRoom(build.room), PEAK_MS);
    const done = window.setTimeout(() => setBuild(null), TOTAL_S * 1000);
    return () => { window.clearTimeout(peak); window.clearTimeout(done); setThemeRoom(build.room); };
  }, [build?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const boss = build ? GAUNTLET[build.room]?.boss : undefined;

  return createPortal(
    <AnimatePresence>
      {build && (
        <motion.div
          key={build.key}
          className="pointer-events-none fixed inset-0 z-[95] overflow-hidden"
          aria-live="polite"
          aria-label={boss ? `Room ${build.index}: ${boss.name}` : 'A room is rebuilt'}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* the blueprint — wiped in behind the eraser, wiped out behind the pen */}
          <motion.div
            className="absolute inset-0"
            initial={{ clipPath: 'inset(0% 0% 100% 0%)' }}
            animate={{ clipPath: ['inset(0% 0% 100% 0%)', 'inset(0% 0% 0% 0%)', 'inset(0% 0% 0% 0%)', 'inset(100% 0% 0% 0%)'] }}
            transition={{ duration: TOTAL_S, times: [0, ERASE_END, DRAW_START, DRAW_END], ease: 'linear' }}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundColor: 'rgb(8,36,64)',
                backgroundImage: `linear-gradient(${CYAN}26 1px, transparent 1px), linear-gradient(90deg, ${CYAN}26 1px, transparent 1px), linear-gradient(${CYAN}10 1px, transparent 1px), linear-gradient(90deg, ${CYAN}10 1px, transparent 1px)`,
                backgroundSize: '48px 48px, 48px 48px, 12px 12px, 12px 12px',
              }}
            />

            {/* pen strokes drafting the new table */}
            <svg className="absolute left-1/2 top-0 h-full -translate-x-1/2" style={{ width: 'min(100vw, 512px)' }} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {STROKES.map((d, i) => (
                <motion.path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={CYAN}
                  strokeWidth={0.4}
                  vectorEffect="non-scaling-stroke"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.9 }}
                  transition={{ duration: 0.55, delay: 0.85 + i * 0.07, ease: 'easeInOut' }}
                />
              ))}
            </svg>

            {/* the room locks in */}
            {boss && (
              <motion.div
                className="absolute inset-0 flex flex-col items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0, 1, 1, 0] }}
                transition={{ duration: TOTAL_S, times: [0, 0.29, 0.33, DRAW_START - 0.02, DRAW_START + 0.06] }}
              >
                <motion.span
                  className="select-none leading-none"
                  style={{ fontSize: 60, filter: `drop-shadow(0 0 14px ${CYAN})` }}
                  initial={{ scale: 1.8 }}
                  animate={{ scale: [1.8, 1.8, 0.95, 1] }}
                  transition={{ duration: 1.2, times: [0, 0.7, 0.82, 1] }}
                >
                  {boss.sigil}
                </motion.span>
                <div className="mt-3 font-pixel text-[11px] tracking-[0.4em]" style={{ color: CYAN }}>
                  ROOM {build.index} / {MAX_CONVERGENCE_ROOMS}
                </div>
                <div className="mt-1.5 font-pixel text-[18px] tracking-widest" style={{ color: '#ecfeff', textShadow: `0 0 10px ${CYAN}` }}>
                  {boss.name.toUpperCase()}
                </div>
                <div className="mt-1 max-w-xs px-4 text-center font-pixel text-[8px] leading-relaxed tracking-wide" style={{ color: `${CYAN}cc` }}>
                  {boss.ruleHeaderText}
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* the eraser — a soft rubber band sweeping down, crumbs falling off it */}
          <motion.div
            className="absolute inset-x-0 h-5"
            style={{
              marginTop: -10,
              background: 'linear-gradient(180deg, rgba(255,228,230,0) 0%, rgba(255,228,230,0.85) 35%, rgba(254,205,211,0.95) 60%, rgba(255,228,230,0) 100%)',
              filter: 'blur(1.5px)',
            }}
            initial={{ top: '0%', opacity: 1 }}
            animate={{ top: '100%', opacity: [1, 1, 0] }}
            transition={{ top: { duration: 0.8, ease: 'linear' }, opacity: { duration: 0.8, times: [0, 0.96, 1] } }}
          />
          {ERASER_CRUMBS.map((c, i) => (
            <motion.span
              key={`crumb-${i}`}
              className="absolute block rounded-full"
              style={{ left: `${c.x}%`, width: c.size, height: c.size, background: 'rgba(254,205,211,0.8)' }}
              initial={{ top: `${c.at}%`, opacity: 0 }}
              animate={{ top: [`${c.at}%`, `${c.at + 6}%`], opacity: [0, 0.9, 0] }}
              transition={{ duration: 0.5, delay: (c.at / 100) * 0.8, ease: 'easeIn' }}
            />
          ))}

          {/* the pen — a glowing line inking the new table in, top to bottom */}
          <motion.div
            className="absolute inset-x-0 h-0.5"
            style={{ background: CYAN, boxShadow: `0 0 16px 4px ${CYAN}aa` }}
            initial={{ top: '0%', opacity: 0 }}
            animate={{ top: '100%', opacity: [1, 1, 0] }}
            transition={{ top: { duration: 1.0, delay: 1.6, ease: 'linear' }, opacity: { duration: 1.0, delay: 1.6, times: [0, 0.95, 1] } }}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
