// =============================================================================
// BATTLECRAPS — VICTORY CINEMATIC: THE PATTERN BREAKS (FB-040, The Architect)
// apps/web/src/components/victory/ThePatternBreaksCinematic.tsx
//
// You beat The Architect — the gauntlet is won. Every room you fought in his
// fight flashes past in reverse, newest to first, each one its own floor's
// felt and its boss's sigil, faster and faster. The blueprint grid behind them
// tears open across the middle; white light floods through; everything folds
// in to a single point and goes white. Out of the white, his line, thin and
// quiet. Then the gauntlet victory sequence (the store holds GAME_OVER until
// onFinish — PendingVictory.heldFinal).
//
// Timeline (ms): 0 dark + grid → 300 the rooms flash (accelerating, ~3 s) →
// 3500 the tear → 4300 fold to a point → 4900 white → 5300 his line → 8200
// fade → 8600 onFinish.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { GAUNTLET, CONVERGENCE_ROOM_MARKERS } from '@battlecraps/shared';
import { getFloorTheme } from '../../lib/floorThemes.js';
import { playFoldToWhite, playPatternTear, playRoomFlash } from '../../hooks/useCrowdAudio.js';
import type { VictoryCinematicProps } from './registry.js';

const CYAN       = '#67e8f9';
const FLASH_AT   = 300;
const FLASH_SPAN = 3000;
const TEAR_AT    = 3500;
const FOLD_AT    = 4300;
const WHITE_AT   = 4900;
const LINE_AT    = 5300;
const FADE_AT    = 8200;
const FINISH_AT  = 8600;

export const ThePatternBreaksCinematic: React.FC<VictoryCinematicProps> = ({ line, onFinish, rooms }) => {
  const reduceMotion = useReducedMotion() === true;

  // Newest room first. A preview (no rooms) shows four of them.
  const sequence = useMemo(() => {
    const list = rooms && rooms.length > 0 ? [...rooms].reverse() : CONVERGENCE_ROOM_MARKERS.slice(0, 4).reverse();
    // Accelerating: each flash shorter than the last; a final run through them again, faster.
    const all = [...list, ...list];
    const weights = all.map((_, i) => Math.pow(0.82, i));
    const total = weights.reduce((a, b) => a + b, 0);
    let t = FLASH_AT;
    return all.map((room, i) => {
      const dur = (weights[i]! / total) * FLASH_SPAN;
      const at = t; t += dur;
      return { room, at, dur, step: i };
    });
  }, [rooms]);

  const [flash, setFlash] = useState<number | null>(null);   // index into sequence
  const [torn, setTorn]   = useState(false);
  const [fold, setFold]   = useState(false);
  const [white, setWhite] = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [fading, setFading]     = useState(false);

  useEffect(() => {
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms));
    if (!reduceMotion) {
      sequence.forEach((f, i) => at(f.at, () => { setFlash(i); playRoomFlash(Math.min(f.step, 12)); }));
    }
    at(TEAR_AT,  () => { setFlash(null); setTorn(true); playPatternTear(); });
    at(FOLD_AT,  () => { setFold(true); playFoldToWhite(); });
    at(WHITE_AT, () => setWhite(true));
    at(LINE_AT,  () => setShowLine(true));
    at(FADE_AT,  () => setFading(true));
    at(FINISH_AT, onFinish);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = flash !== null ? sequence[flash] : undefined;
  const boss    = current ? GAUNTLET[current.room]?.boss : undefined;
  const theme   = current ? getFloorTheme(current.room) : undefined;

  const grid = {
    backgroundColor: 'rgb(6,20,38)',
    backgroundImage: `linear-gradient(${CYAN}22 1px, transparent 1px), linear-gradient(90deg, ${CYAN}22 1px, transparent 1px)`,
    backgroundSize: '40px 40px',
  } as const;

  return (
    <div className="fixed inset-0 overflow-hidden transition-opacity duration-500" style={{ opacity: fading ? 0 : 1 }}>
      {/* the blueprint behind everything — tears in two */}
      {!torn ? (
        <motion.div className="absolute inset-0" style={grid} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} />
      ) : (
        <>
          <motion.div className="absolute inset-x-0 top-0" style={{ ...grid, height: '50%', clipPath: 'polygon(0 0, 100% 0, 100% 92%, 88% 100%, 74% 90%, 60% 100%, 45% 88%, 30% 100%, 15% 90%, 0 98%)' }}
            initial={{ y: 0 }} animate={{ y: '-55vh', rotate: -3 }} transition={{ duration: 0.8, ease: [0.5, 0, 0.8, 0.4] }} />
          <motion.div className="absolute inset-x-0 bottom-0" style={{ ...grid, height: '50%', clipPath: 'polygon(0 2%, 15% 10%, 30% 0, 45% 12%, 60% 0, 74% 10%, 88% 0, 100% 8%, 100% 100%, 0 100%)' }}
            initial={{ y: 0 }} animate={{ y: '55vh', rotate: 3 }} transition={{ duration: 0.8, ease: [0.5, 0, 0.8, 0.4] }} />
          {/* light through the tear */}
          <motion.div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2"
            style={{ background: '#fff', boxShadow: '0 0 60px 30px rgba(255,255,255,0.9)' }}
            initial={{ scaleY: 1 }} animate={{ scaleY: 300 }} transition={{ duration: 0.8, ease: 'easeIn' }} />
        </>
      )}

      {/* the rooms flash past, newest first */}
      {current && boss && theme && (
        <motion.div
          key={flash}
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ backgroundColor: theme.feltPrimary, backgroundImage: theme.feltTexture }}
          initial={{ opacity: 0, scale: 1.12, skewX: -6 }}
          animate={{ opacity: [0, 1, 1, 0.85], scale: 1, skewX: 0 }}
          transition={{ duration: Math.max(0.12, current.dur / 1000), ease: 'easeOut' }}
        >
          <span className="select-none leading-none" style={{ fontSize: 72, filter: `drop-shadow(0 0 12px ${theme.accentPrimary})` }}>{boss.sigil}</span>
          <span className="mt-3 font-pixel text-[16px] tracking-widest" style={{ color: theme.accentPrimary, textShadow: '0 2px 6px rgba(0,0,0,0.9)' }}>
            {boss.name.toUpperCase()}
          </span>
          {/* scan glitch */}
          <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 1px, transparent 1px 3px)' }} />
        </motion.div>
      )}

      {/* everything folds in to a point */}
      {fold && (
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{ width: '220vmax', height: '220vmax', marginLeft: '-110vmax', marginTop: '-110vmax', background: 'radial-gradient(circle, #fff 0%, #e0f2fe 40%, rgba(6,20,38,0) 70%)' }}
          initial={{ scale: 1, opacity: 0.9 }}
          animate={{ scale: [1, 0.004, 0.004, 3], opacity: [0.9, 1, 1, 1] }}
          transition={{ duration: 0.9, times: [0, 0.6, 0.7, 1], ease: 'easeIn' }}
        />
      )}

      {/* white, then his line */}
      {white && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center px-6"
          style={{ backgroundColor: '#ffffff' }}
          initial={{ opacity: 1 }}
          animate={{ backgroundColor: ['#ffffff', '#ffffff', '#0b1020'] }}
          transition={{ duration: 2.2, times: [0, 0.3, 1] }}
        >
          {showLine && (
            <motion.div
              className="max-w-md text-center"
              initial={{ opacity: 0, letterSpacing: '0.3em' }}
              animate={{ opacity: 1, letterSpacing: '0.04em' }}
              transition={{ duration: 1.4, ease: 'easeOut' }}
            >
              <div style={{ fontFamily: '"Share Tech Mono", monospace', fontSize: 'clamp(17px, 4.6vw, 22px)', color: '#e0f2fe', textShadow: `0 0 10px ${CYAN}88` }}>
                {line}
              </div>
              <div className="mt-3 font-pixel text-[9px] tracking-[0.3em]" style={{ color: `${CYAN}aa` }}>— THE ARCHITECT</div>
            </motion.div>
          )}
        </motion.div>
      )}
    </div>
  );
};
