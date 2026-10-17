// =============================================================================
// BATTLECRAPS — OFFERING BOWL (FB-036, The Hierophant)
// apps/web/src/components/OfferingBowl.tsx
//
// The Hierophant's escrow made physical, on the table (FB-042 —
// BossTableWell lays it out 360×190 and scales it to fit; his room still
// clears on bankroll). A brass bowl between two
// candles shows what your crew's bonuses are held as — "HELD $X".
//   • Held: coins drop into the bowl (a soft clink).
//   • Released: coins rise out of it — "RELEASED +$X" (a rising shimmer).
//   • Seized (a Seven-Out): the candles flare, embers burn off the bowl and
//     "TRIBUTE −$X" sears across it, under a bell toll and a low choir.
//
// Driven by escrowHeldCents / lastEscrow from applyPendingSettlement().
// Nothing sounds on mount (fight entry / hydration), only on new rolls.
// =============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { MARKER_TARGETS } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { useAnimatedCounter } from '../hooks/useAnimatedCounter.js';
import { playBellToll, playChoirChord, playCoinChime } from '../hooks/useCrowdAudio.js';

const AMBER = '#f59e0b';
const EMBER = '#f97316';
const GOLD  = '#fcd34d';
const MAX_COINS = 7;

const dollars = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

const Candle: React.FC<{ flare: boolean; side: 'left' | 'right'; reduceMotion: boolean }> = ({ flare, side, reduceMotion }) => (
  <div className="relative flex flex-col items-center" style={{ width: 36 }}>
    <motion.span
      className={`block select-none leading-none ${reduceMotion ? '' : 'animate-candle-flicker'}`}
      style={{
        fontSize: 30,
        animationDelay: side === 'left' ? '0s' : '-0.7s',
        filter: `drop-shadow(0 0 ${flare ? 14 : 6}px ${flare ? EMBER : AMBER})`,
      }}
      animate={flare && !reduceMotion ? { scale: [1, 1.6, 1.1], y: [0, -4, 0] } : { scale: 1, y: 0 }}
      transition={{ duration: 0.9, ease: 'easeOut' }}
    >
      🕯️
    </motion.span>
  </div>
);

export const OfferingBowl: React.FC = () => {
  const held         = useGameStore((s) => s.escrowHeldCents);
  const last         = useGameStore((s) => s.lastEscrow);
  const markerIndex  = useGameStore((s) => s.currentMarkerIndex);
  const reduceMotion = useReducedMotion() === true;
  const { display }  = useAnimatedCounter(held);

  // Events only for rolls after mount.
  const mountKey = useRef(last?.key ?? 0);
  const fresh    = last !== null && last.key !== mountKey.current ? last : null;

  // The candles flare (and the bowl glows) for a moment on a seizure.
  const [flaring, setFlaring] = useState(false);

  useEffect(() => {
    if (!fresh) return;
    if (fresh.seizedCents > 0) {
      playBellToll();
      playChoirChord();
      setFlaring(true);
      const id = window.setTimeout(() => setFlaring(false), 2600);
      return () => { window.clearTimeout(id); setFlaring(false); };
    }
    if (fresh.releasedCents > 0) playCoinChime('rise');
    if (fresh.heldCents > 0) window.setTimeout(() => playCoinChime('drop'), fresh.releasedCents > 0 ? 260 : 0);
  }, [fresh?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The pile grows with what's held (relative to a "big offering", 10% of target).
  const target = MARKER_TARGETS[markerIndex] ?? 0;
  const coins  = held > 0 && target > 0 ? Math.max(1, Math.min(MAX_COINS, Math.ceil((held / (target * 0.10)) * MAX_COINS))) : 0;
  const seized = fresh !== null && fresh.seizedCents > 0;

  const embers = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    x: ((i - 5.5) * 7 + ((i * 37) % 9) - 4) * 1.4,
    rise: 44 + ((i * 53) % 40),
    delay: ((i * 29) % 10) / 40,
  })), []);

  return (
    <div
      className="relative flex h-full w-full flex-col justify-center overflow-visible rounded-lg px-4 py-3"
      style={{
        background: 'radial-gradient(ellipse at 50% 80%, rgba(120,53,15,0.35), rgba(20,8,28,0.82) 70%)',
        border:     `1px solid ${flaring ? EMBER : 'rgba(245,158,11,0.35)'}`,
        boxShadow:  flaring ? `0 0 18px 4px ${EMBER}66` : 'none',
        transition: 'border-color 400ms, box-shadow 600ms',
      }}
      role="status"
      aria-label={`The offering: ${dollars(held)} held`}
    >
      <div className="text-center font-pixel text-[9px] tracking-[0.3em]" style={{ color: 'rgba(252,211,77,0.6)' }}>
        THE OFFERING
      </div>

      <div className="mt-2 flex items-end justify-center gap-6">
        <Candle flare={flaring} side="left" reduceMotion={reduceMotion} />

        {/* The bowl + its coins */}
        <div className="relative flex flex-col items-center" style={{ width: 156 }}>
          <div className="relative" style={{ height: 25, width: 118 }}>
            {/* coin pile, resting in the bowl's mouth */}
            {Array.from({ length: coins }, (_, i) => (
              <span
                key={i}
                className="absolute block rounded-full"
                style={{
                  width: 19, height: 8,
                  left: 59 - 9.5 + ((i % 4) - 1.5) * 17 + (i >= 4 ? 8 : 0),
                  bottom: i >= 4 ? 7 : 0,
                  background: 'linear-gradient(180deg, #fde68a, #b45309)',
                  boxShadow: '0 1px 1px rgba(0,0,0,0.6)',
                }}
              />
            ))}
          </div>
          <div
            style={{
              width: 128, height: 36, marginTop: -8,
              borderRadius: '8px 8px 64px 64px',
              background: 'linear-gradient(180deg, #fbbf24 0%, #b45309 45%, #78350f 100%)',
              boxShadow: `inset 0 3px 0 rgba(255,255,255,0.35), 0 4px 10px rgba(0,0,0,0.6)${flaring ? `, 0 0 16px 4px ${EMBER}88` : ''}`,
            }}
          />
          <div style={{ width: 56, height: 8, background: '#78350f', borderRadius: 2 }} />

          {/* Coins dropping in / rising out, embers on a seizure */}
          <AnimatePresence>
            {fresh !== null && !reduceMotion && (
              <motion.div key={fresh.key} className="pointer-events-none absolute inset-0" exit={{ opacity: 0 }}>
                {fresh.heldCents > 0 && !seized && [0, 1, 2].map((i) => (
                  <motion.span key={`d${i}`} className="absolute block select-none text-[18px] leading-none"
                    style={{ left: 68 + (i - 1) * 22 }}
                    initial={{ y: -56, opacity: 0 }}
                    animate={{ y: [-56, 6, 3], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.6, delay: 0.25 + i * 0.08, ease: 'easeIn' }}
                  >🪙</motion.span>
                ))}
                {fresh.releasedCents > 0 && !seized && [0, 1, 2].map((i) => (
                  <motion.span key={`r${i}`} className="absolute block select-none text-[18px] leading-none"
                    style={{ left: 68 + (i - 1) * 24, top: 11 }}
                    initial={{ y: 0, opacity: 0 }}
                    animate={{ y: -64, x: 40 + i * 8, opacity: [0, 1, 0] }}
                    transition={{ duration: 0.9, delay: i * 0.07, ease: 'easeOut' }}
                  >🪙</motion.span>
                ))}
                {seized && embers.map((e, i) => (
                  <motion.span key={`e${i}`} className="absolute block rounded-full"
                    style={{ width: 5, height: 5, left: 76 + e.x, top: 20, background: i % 3 === 0 ? GOLD : EMBER, boxShadow: `0 0 6px ${EMBER}` }}
                    initial={{ y: 0, opacity: 0 }}
                    animate={{ y: -e.rise, x: e.x * 0.4, opacity: [0, 1, 0] }}
                    transition={{ duration: 1.4, delay: e.delay, ease: 'easeOut' }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Candle flare={flaring} side="right" reduceMotion={reduceMotion} />
      </div>

      <div className="mt-3 text-center font-pixel text-[18px] font-bold leading-none" style={{ color: GOLD, textShadow: `0 0 8px ${AMBER}88` }}>
        HELD {dollars(display)}
      </div>

      {/* TRIBUTE −$X / RELEASED +$X */}
      <AnimatePresence>
        {fresh !== null && (fresh.seizedCents > 0 || fresh.releasedCents > 0) && (
          <motion.div
            key={fresh.key}
            className="pointer-events-none absolute inset-x-0 top-6 z-20 flex flex-col items-center gap-0.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: seized ? 2.6 : 1.7, times: [0, 0.1, 0.75, 1] }}
          >
            {seized && (
              <motion.span
                className="whitespace-nowrap font-pixel text-[19px] font-bold"
                style={{ color: EMBER, textShadow: `0 0 10px ${EMBER}, 0 0 22px #b91c1c, 0 2px 4px rgba(0,0,0,0.9)` }}
                initial={reduceMotion ? false : { scale: 1.8, y: 6 }}
                animate={reduceMotion ? {} : { scale: [1.8, 0.95, 1.05, 1], y: [6, -4, -8, -12] }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              >
                TRIBUTE −{dollars(fresh.seizedCents)}
              </motion.span>
            )}
            {fresh.releasedCents > 0 && (
              <motion.span
                className="whitespace-nowrap font-pixel text-[14px] font-bold"
                style={{ color: GOLD, textShadow: `0 0 8px ${AMBER}, 0 2px 4px rgba(0,0,0,0.9)` }}
                initial={reduceMotion ? false : { y: 4 }}
                animate={reduceMotion ? {} : { y: -16 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
              >
                RELEASED +{dollars(fresh.releasedCents)}
              </motion.span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
