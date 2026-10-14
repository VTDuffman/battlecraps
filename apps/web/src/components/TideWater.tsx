// =============================================================================
// BATTLECRAPS — TIDE WATER (FB-037, The Sovereign)
// apps/web/src/components/TideWater.tsx
//
// The sea in The Sovereign's throne room. Translucent water along the bottom of
// the table rises and falls with the tide — a trace at Dead Calm, risen at the
// Undertow, high over the felt at High Tide — with a moving surface. It never
// blocks input (pointer-events: none).
//   • The tide turns: a slow swell.
//   • The Undertow drags: the water surges up and drains away, pulling
//     "UNDERTOW −$X" down with it.
//   • High Tide's wave: a crest sweeps across the table and breaks —
//     "THE WAVE — N SHOOTERS DROWNED".
// Driven by bossPointHits (stage) + lastTide (events). Nothing sounds on mount.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GAUNTLET, getTideStage, type BossRuleParams, type TideEffect } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { playSwell, playUndertow, playWaveCrash } from '../hooks/useCrowdAudio.js';

const LEVEL: Record<TideEffect, number> = { DEAD_CALM: 3, UNDERTOW: 8, HIGH_TIDE: 14 };   // dvh
const SEA   = 'rgba(14,116,144,';

const dollars = (cents: number): string => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

/** A strip of rolling surface — the path tiles seamlessly every 120px. */
const Surface: React.FC<{ speed: number; opacity: number; offset: number }> = ({ speed, opacity, offset }) => (
  <div className="absolute inset-x-0 overflow-hidden" style={{ top: -10 + offset, height: 14 }}>
    <div className="animate-sea-surface absolute inset-y-0 left-0" style={{ width: 'calc(100% + 120px)', animationDuration: `${speed}s` }}>
      <svg width="100%" height="14" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <pattern id={`sea-${speed}`} width="120" height="14" patternUnits="userSpaceOnUse">
            <path d="M0 8 Q 30 0 60 8 T 120 8 V 14 H 0 Z" fill={`${SEA}${opacity})`} />
            <path d="M0 8 Q 30 0 60 8 T 120 8" fill="none" stroke={`rgba(207,250,254,${opacity * 1.4})`} strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect width="100%" height="14" fill={`url(#sea-${speed})`} />
      </svg>
    </div>
  </div>
);

export const TideWater: React.FC = () => {
  const markerIndex  = useGameStore((s) => s.currentMarkerIndex);
  const counter      = useGameStore((s) => s.bossPointHits);
  const lastTide     = useGameStore((s) => s.lastTide);
  const reduceMotion = useReducedMotion() === true;

  const mountKey = useRef(lastTide?.key ?? 0);
  const fresh    = lastTide !== null && lastTide.key !== mountKey.current ? lastTide : null;
  const [event, setEvent] = useState<{ kind: 'undertow' | 'wave'; amount: number; key: number } | null>(null);

  useEffect(() => {
    if (!fresh) return;
    let kind: 'undertow' | 'wave' | null = null;
    if ((fresh.waveShooters ?? 0) > 0) { kind = 'wave'; playWaveCrash(); }
    else if ((fresh.undertowCents ?? 0) > 0) { kind = 'undertow'; playUndertow(); }
    else if (fresh.nextStage !== fresh.stage) playSwell();
    if (kind === null) return;
    setEvent({ kind, amount: kind === 'wave' ? (fresh.waveShooters ?? 0) : (fresh.undertowCents ?? 0), key: fresh.key });
    const id = window.setTimeout(() => setEvent(null), 2600);
    return () => window.clearTimeout(id);
  }, [fresh?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const boss = GAUNTLET[markerIndex]?.boss;
  if (boss?.ruleParams.rule !== 'TIDAL_SURGE') return null;
  const params = boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
  const level  = LEVEL[getTideStage(params, counter).effect];

  const surge = event !== null && !reduceMotion;
  const heights = !surge ? `${level}dvh`
    : event.kind === 'undertow' ? [`${level}dvh`, '30dvh', `${level * 0.3}dvh`, `${level}dvh`]
    : [`${level}dvh`, '44dvh', `${level}dvh`];

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[35]" aria-hidden="true">
      {/* the water */}
      <motion.div
        className="absolute inset-x-0 bottom-0"
        style={{ background: `linear-gradient(180deg, ${SEA}0.22) 0%, ${SEA}0.30) 40%, rgba(8,51,68,0.42) 100%)` }}
        initial={false}
        animate={{ height: heights }}
        transition={surge
          ? { duration: event.kind === 'undertow' ? 1.6 : 1.3, times: event.kind === 'undertow' ? [0, 0.25, 0.7, 1] : [0, 0.45, 1], ease: 'easeInOut' }
          : { type: 'spring', stiffness: 40, damping: 12 }}
      >
        {!reduceMotion && <Surface speed={7} opacity={0.35} offset={0} />}
        {!reduceMotion && <Surface speed={11} opacity={0.2} offset={3} />}
      </motion.div>

      {/* High Tide's crest sweeping across */}
      <AnimatePresence>
        {event?.kind === 'wave' && !reduceMotion && (
          <motion.div
            key={`crest-${event.key}`}
            className="absolute"
            style={{ bottom: '6dvh', height: '42dvh', width: '70vw' }}
            initial={{ x: '110vw', opacity: 0.9 }}
            animate={{ x: '-80vw', opacity: [0.9, 0.95, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.3, ease: 'easeIn' }}
          >
            <svg viewBox="0 0 200 120" preserveAspectRatio="none" width="100%" height="100%">
              <path d="M0 120 C 20 60, 60 10, 110 14 C 150 18, 170 40, 160 60 C 152 45, 135 40, 125 52 C 150 70, 175 95, 200 120 Z"
                fill="rgba(14,116,144,0.55)" stroke="rgba(207,250,254,0.85)" strokeWidth="2" />
              <path d="M110 14 C 140 16, 165 34, 160 60" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="4" strokeLinecap="round" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* what the sea took */}
      <AnimatePresence>
        {event !== null && (
          <motion.div
            key={`text-${event.key}`}
            className="fixed inset-x-0 flex justify-center"
            style={{ bottom: '24dvh' }}
            initial={{ opacity: 0, y: -10, scale: 1.2 }}
            animate={{ opacity: [0, 1, 1, 0], y: reduceMotion ? 0 : [-10, 0, 10, 60], scale: 1 }}
            transition={{ duration: 2.4, times: [0, 0.12, 0.65, 1], ease: 'easeIn' }}
          >
            <span
              className="whitespace-nowrap font-pixel text-r-13 font-bold"
              style={{
                color: event.kind === 'wave' ? '#fca5a5' : '#fde68a',
                textShadow: '0 0 10px rgba(14,116,144,0.9), 0 2px 4px rgba(0,0,0,0.9)',
              }}
            >
              {event.kind === 'wave'
                ? `THE WAVE — ${event.amount} SHOOTERS DROWNED`
                : `UNDERTOW −${dollars(event.amount)}`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
};
