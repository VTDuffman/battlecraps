// =============================================================================
// BATTLECRAPS — TRANSMISSION LINE (FB-039, The Emissary)
// apps/web/src/components/TransmissionLine.tsx
//
// The Emissary's signal lag, front and center under the marker progress bar.
// Your CREW (left) are linked to the TABLE (right) by a signal line. What the
// crew do each roll leaves as a glowing packet that waits mid-line — in
// transit — and arrives on the next roll ("RECEIVED +$X"). A Seven-Out hits the
// line with static: the packets scatter and the line goes dead — "NO SIGNAL · n"
// counting down the blackout — until "CONTACT RESTORED".
//
// Driven by signalDarkRolls + lastSignal. Nothing sounds on mount.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { playContactRestored, playSignalPing, playStaticBurst } from '../hooks/useCrowdAudio.js';

const GREEN   = '#39ff14';
const MAGENTA = '#e879f9';
const RED     = '#f43f5e';

type Packet = { additives: number; hype: number; multipliers: number[] };
const isEmpty = (p: Packet | undefined): boolean =>
  !p || (p.additives <= 0 && p.hype <= 0 && p.multipliers.length === 0);

const describe = (p: Packet): string => {
  const parts: string[] = [];
  if (p.additives > 0) parts.push(`+$${Math.round(p.additives / 100).toLocaleString('en-US')}`);
  if (p.hype > 0)      parts.push(`+${p.hype.toFixed(2)}×`);
  if (p.multipliers.length > 0) parts.push(`×${p.multipliers.reduce((a, m) => a * m, 1).toFixed(2)}`);
  return parts.join(' · ');
};

/** The signal line itself — a scrolling sine wave, or static when dead. */
const Wave: React.FC<{ dead: boolean; reduceMotion: boolean }> = ({ dead, reduceMotion }) => (
  <div className="relative mx-1 h-6 flex-1 overflow-hidden">
    {dead ? (
      <div className={`absolute inset-0 ${reduceMotion ? '' : 'animate-signal-static'}`} style={{
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(244,63,94,0.55) 0 2px, transparent 2px 5px, rgba(244,63,94,0.25) 5px 6px, transparent 6px 9px)',
        maskImage: 'linear-gradient(180deg, transparent, #000 35%, #000 65%, transparent)',
      }} />
    ) : (
      <div className={`absolute inset-y-0 left-0 ${reduceMotion ? '' : 'animate-sea-surface'}`} style={{ width: 'calc(100% + 120px)', animationDuration: '2.2s' }}>
        <svg width="100%" height="24" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="signal-wave" width="40" height="24" patternUnits="userSpaceOnUse">
              <path d="M0 12 Q 10 2 20 12 T 40 12" fill="none" stroke={GREEN} strokeOpacity={0.75} strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect width="100%" height="24" fill="url(#signal-wave)" />
        </svg>
      </div>
    )}
  </div>
);

export const TransmissionLine: React.FC = () => {
  const darkRolls    = useGameStore((s) => s.signalDarkRolls);
  const last         = useGameStore((s) => s.lastSignal);
  const reduceMotion = useReducedMotion() === true;
  const dead         = darkRolls > 0;

  // Events for rolls after mount only.
  const mountKey = useRef(last?.key ?? 0);
  const fresh    = last !== null && last.key !== mountKey.current ? last : null;
  const [flash, setFlash] = useState<{ kind: 'received' | 'lost' | 'restored'; text: string; key: number } | null>(null);

  useEffect(() => {
    if (!fresh) return;
    if (fresh.darkRolls > 0 && !fresh.wasDark) {
      setFlash({ kind: 'lost', text: 'SIGNAL LOST', key: fresh.key });
      playStaticBurst();
    } else if (fresh.wasDark && fresh.darkRolls === 0) {
      setFlash({ kind: 'restored', text: 'CONTACT RESTORED', key: fresh.key });
      playContactRestored();
    } else if (!isEmpty(fresh.landed)) {
      setFlash({ kind: 'received', text: `RECEIVED ${describe(fresh.landed)}`, key: fresh.key });
      playSignalPing();
    }
  }, [fresh?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const inTransit = !dead && fresh !== null && !isEmpty(fresh.sent) ? fresh.sent : null;

  return (
    <div
      className="relative mx-auto w-full max-w-sm overflow-hidden rounded-md px-2 py-1.5"
      style={{
        background: 'linear-gradient(180deg, rgba(8,4,20,0.92), rgba(18,4,28,0.92))',
        border: `1px solid ${dead ? `${RED}88` : `${GREEN}44`}`,
        boxShadow: dead ? `0 0 14px 2px ${RED}33` : 'none',
        transition: 'border-color 300ms, box-shadow 300ms',
      }}
      role="status"
      aria-label={dead ? `No signal — your crew are dark for ${darkRolls} more rolls` : 'Signal: your crew’s effects arrive one roll late'}
    >
      <div className="flex items-center">
        {/* the crew end */}
        <div className="flex flex-col items-center" style={{ width: 46 }}>
          <span className="select-none text-[16px] leading-none" style={{ filter: dead ? 'grayscale(1) brightness(0.5)' : 'none' }}>👥</span>
          <span className="mt-0.5 font-pixel text-[6px] tracking-widest" style={{ color: dead ? 'rgba(244,63,94,0.7)' : 'rgba(57,255,20,0.7)' }}>CREW</span>
        </div>

        {/* the line, and what's in transit */}
        <div className="relative flex flex-1 items-center">
          <Wave dead={dead} reduceMotion={reduceMotion} />
          <AnimatePresence>
            {inTransit !== null && fresh !== null && (
              <motion.div
                key={`p-${fresh.key}`}
                className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5"
                style={{ left: '50%', background: 'rgba(57,255,20,0.15)', border: `1px solid ${GREEN}`, boxShadow: `0 0 10px ${GREEN}88` }}
                initial={reduceMotion ? { opacity: 0, x: '-50%' } : { opacity: 0, x: '-160%', scale: 0.7 }}
                animate={reduceMotion ? { opacity: 1, x: '-50%' } : { opacity: 1, x: '-50%', scale: [0.7, 1.1, 1] }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: '80%', scale: 0.6 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <span className="font-pixel text-[7px]" style={{ color: GREEN }}>IN TRANSIT {describe(inTransit)}</span>
              </motion.div>
            )}
          </AnimatePresence>
          {dead && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className={`font-pixel text-r-10 font-bold tracking-widest ${reduceMotion ? '' : 'animate-signal-flicker'}`} style={{ color: RED, textShadow: `0 0 8px ${RED}` }}>
                NO SIGNAL · {darkRolls}
              </span>
            </div>
          )}
        </div>

        {/* the table end */}
        <div className="flex flex-col items-center" style={{ width: 46 }}>
          <span className="select-none text-[16px] leading-none">🎲</span>
          <span className="mt-0.5 font-pixel text-[6px] tracking-widest" style={{ color: 'rgba(232,121,249,0.75)' }}>TABLE</span>
        </div>
      </div>

      <div className="mt-0.5 text-center font-pixel text-[6.5px] tracking-wide" style={{ color: 'rgba(186,230,253,0.5)' }}>
        {dead ? 'YOUR CREW CANNOT HEAR YOU' : 'CREW EFFECTS ARRIVE ONE ROLL LATE · 7-OUT: CREW DARK 6'}
      </div>

      {/* received / lost / restored */}
      <AnimatePresence>
        {flash !== null && (
          <motion.div
            key={`f-${flash.key}`}
            className="pointer-events-none absolute inset-x-0 top-0 flex justify-center"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: [0, 1, 1, 0], y: [-4, 0, 0, -6] }}
            transition={{ duration: 1.8, times: [0, 0.12, 0.7, 1] }}
            onAnimationComplete={() => setFlash(null)}
          >
            <span className="rounded px-1.5 font-pixel text-r-9 font-bold" style={{
              color: flash.kind === 'lost' ? RED : flash.kind === 'restored' ? GREEN : MAGENTA,
              background: 'rgba(0,0,0,0.75)',
              textShadow: `0 0 8px ${flash.kind === 'lost' ? RED : flash.kind === 'restored' ? GREEN : MAGENTA}`,
            }}>
              {flash.text}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
