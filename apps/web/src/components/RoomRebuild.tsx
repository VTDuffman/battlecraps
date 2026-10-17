// =============================================================================
// BATTLECRAPS — THE REBUILD (FB-040, The Architect)
// apps/web/src/components/RoomRebuild.tsx
//
// Each time The Architect builds a room — after his entry cinematic (the first
// room) and on every Seven-Out — he erases the table and draws the next one,
// on the board itself ([data-table-root], animated with the Web Animations API):
//   ERASE (0–0.85 s): the table drains of colour, washes out, softens and fades
//     away while the blueprint (a cyan drafting grid) fades in. Eraser rubs.
//   LOCK IN (~0.85 s): with a clunk the table is re-dressed as that boss's
//     floor (setConvergenceThemeRoom) while it's invisible; pen strokes draft
//     its outlines on the blueprint and the room's card shows.
//   DRAW (1.6–2.7 s): the new table fades back in as a cyan line sketch, then
//     its colour fills in as it solidifies; the blueprint fades away. Pen scratches.
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
const DRAW_START = 1.6 / TOTAL_S;
// The board's own look through the rebuild (WAAPI keyframes on [data-table-root]).
const SKETCH = 'grayscale(1) invert(1) sepia(1) hue-rotate(150deg) saturate(4) contrast(1.6) brightness(1.1) blur(0px)';
const BOARD_KEYFRAMES: Keyframe[] = [
  { offset: 0,                    opacity: 1, filter: 'grayscale(0) contrast(1) brightness(1) blur(0px)' },
  { offset: 0.28,                 opacity: 0, filter: 'grayscale(1) contrast(1.5) brightness(1.6) blur(2px)' },   // erased
  { offset: DRAW_START,           opacity: 0, filter: SKETCH },
  { offset: DRAW_START + 0.14,    opacity: 0.85, filter: SKETCH },                                              // sketched in
  { offset: 0.96,                 opacity: 1, filter: 'grayscale(0) invert(0) sepia(0) hue-rotate(0deg) saturate(1) contrast(1) brightness(1) blur(0px)' },   // inked
  { offset: 1,                    opacity: 1, filter: 'none' },
];

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
    const board = document.querySelector<HTMLElement>('[data-table-root]');
    const anim  = board?.animate(BOARD_KEYFRAMES, { duration: TOTAL_S * 1000, easing: 'ease-in-out' });
    const peak = window.setTimeout(() => setThemeRoom(build.room), PEAK_MS);
    const done = window.setTimeout(() => setBuild(null), TOTAL_S * 1000);
    return () => { window.clearTimeout(peak); window.clearTimeout(done); anim?.cancel(); setThemeRoom(build.room); };
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
          {/* the blueprint — fades in as the board is erased, out as the new one is inked in */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.92, 0.92, 0.55, 0] }}
            transition={{ duration: TOTAL_S, times: [0, 0.3, DRAW_START, DRAW_START + 0.16, 0.95], ease: 'easeInOut' }}
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

        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
