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
//   • High Tide's wave: the sea rises to fill the whole screen, foam boiling
//     along its crest, then drains back down — dragging your lost shooter pips
//     (measured from the HUD) down with it. "THE WAVE — N SHOOTERS DROWNED".
// Driven by bossPointHits (stage) + lastTide (events). Nothing sounds on mount.
// =============================================================================

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GAUNTLET, getTideStage, type BossRuleParams, type TideEffect } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { playSwell, playUndertow, playWaveCrash } from '../hooks/useCrowdAudio.js';

const LEVEL: Record<TideEffect, number> = { DEAD_CALM: 3, UNDERTOW: 8, HIGH_TIDE: 14 };   // dvh
const SEA   = 'rgba(14,116,144,';
const WAVE_S     = 2.8;
const UNDERTOW_S = 1.6;

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

/** A boiling band of foam along the crest of the wave. */
const Foam: React.FC = () => (
  <motion.div
    className="absolute inset-x-0"
    style={{
      top: -22, height: 34,
      background: [
        'radial-gradient(ellipse 18px 10px at 8% 60%, rgba(255,255,255,0.95), transparent 70%)',
        'radial-gradient(ellipse 24px 12px at 22% 40%, rgba(255,255,255,0.9), transparent 70%)',
        'radial-gradient(ellipse 16px 9px at 37% 66%, rgba(255,255,255,0.95), transparent 70%)',
        'radial-gradient(ellipse 26px 13px at 53% 42%, rgba(255,255,255,0.9), transparent 70%)',
        'radial-gradient(ellipse 18px 10px at 68% 62%, rgba(255,255,255,0.95), transparent 70%)',
        'radial-gradient(ellipse 22px 12px at 83% 44%, rgba(255,255,255,0.9), transparent 70%)',
        'radial-gradient(ellipse 16px 9px at 96% 60%, rgba(255,255,255,0.95), transparent 70%)',
        'linear-gradient(180deg, transparent 10%, rgba(236,254,255,0.8) 55%, rgba(165,243,252,0.35))',
      ].join(', '),
    }}
    animate={{ x: [0, -10, 6, 0], scaleY: [1, 1.25, 0.9, 1] }}
    transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut' }}
  />
);

interface Pip { x: number; y: number }

/** Where the HUD's shooter pips at these indices are on screen. */
function measurePips(indices: number[]): Pip[] {
  return indices.flatMap((i) => {
    const r = document.querySelector(`[data-shooter-pip="${i}"]`)?.getBoundingClientRect();
    return r && r.width > 0 ? [{ x: r.left + r.width / 2, y: r.top + r.height / 2 }] : [];
  });
}

export const TideWater: React.FC = () => {
  const markerIndex  = useGameStore((s) => s.currentMarkerIndex);
  const counter      = useGameStore((s) => s.bossPointHits);
  const lastTide     = useGameStore((s) => s.lastTide);
  const reduceMotion = useReducedMotion() === true;

  const mountKey = useRef(lastTide?.key ?? 0);
  const fresh    = lastTide !== null && lastTide.key !== mountKey.current ? lastTide : null;
  const [event, setEvent] = useState<{ kind: 'undertow' | 'wave'; amount: number; key: number } | null>(null);
  const [pips, setPips]   = useState<Pip[]>([]);

  useEffect(() => {
    if (!fresh) return;
    let kind: 'undertow' | 'wave' | null = null;
    if ((fresh.waveShooters ?? 0) > 0) { kind = 'wave'; playWaveCrash(); }
    else if ((fresh.undertowCents ?? 0) > 0) { kind = 'undertow'; playUndertow(); }
    else if (fresh.nextStage !== fresh.stage) playSwell();
    if (kind === null) return;
    setEvent({ kind, amount: kind === 'wave' ? (fresh.waveShooters ?? 0) : (fresh.undertowCents ?? 0), key: fresh.key });
    const id = window.setTimeout(() => setEvent(null), (kind === 'wave' ? WAVE_S : UNDERTOW_S) * 1000 + 900);
    return () => window.clearTimeout(id);
  }, [fresh?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // The lost shooters are the pips just past what's left (the store has
  // already settled the roll).
  useLayoutEffect(() => {
    if (event?.kind !== 'wave') { setPips([]); return; }
    const left = useGameStore.getState().shooters;
    setPips(measurePips(Array.from({ length: event.amount }, (_, i) => left + i)));
  }, [event?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const boss = GAUNTLET[markerIndex]?.boss;
  if (boss?.ruleParams.rule !== 'TIDAL_SURGE') return null;
  const params = boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
  const level  = LEVEL[getTideStage(params, counter).effect];

  const surge   = event !== null && !reduceMotion;
  const isWave  = event?.kind === 'wave';
  const heights = !surge ? `${level}dvh`
    : isWave ? [`${level}dvh`, '104dvh', '104dvh', `${level}dvh`]
    : [`${level}dvh`, '30dvh', `${level * 0.3}dvh`, `${level}dvh`];
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[35]" aria-hidden="true">
      {/* the water */}
      <motion.div
        className="absolute inset-x-0 bottom-0"
        style={{ background: `linear-gradient(180deg, ${SEA}${isWave ? 0.32 : 0.22}) 0%, ${SEA}${isWave ? 0.38 : 0.30}) 40%, rgba(8,51,68,${isWave ? 0.5 : 0.42}) 100%)` }}
        initial={false}
        animate={{ height: heights }}
        transition={surge
          ? isWave
            ? { duration: WAVE_S, times: [0, 0.28, 0.42, 1], ease: ['easeOut', 'linear', 'easeIn'] }
            : { duration: UNDERTOW_S, times: [0, 0.25, 0.7, 1], ease: 'easeInOut' }
          : { type: 'spring', stiffness: 40, damping: 12 }}
      >
        {isWave && !reduceMotion && <Foam />}
        {!reduceMotion && <Surface speed={7} opacity={0.35} offset={0} />}
        {!reduceMotion && <Surface speed={11} opacity={0.2} offset={3} />}
      </motion.div>

      {/* your lost shooters, caught by the wave and dragged down as it drains */}
      {isWave && !reduceMotion && pips.map((pip, i) => (
        <motion.span
          key={`${event.key}-${i}`}
          className="absolute block rounded-full"
          style={{
            left: pip.x - 5, top: pip.y - 5, width: 10, height: 10,
            background: '#f5c842', border: '1px solid rgba(245,200,66,0.8)',
            boxShadow: '0 0 8px rgba(245,200,66,0.9)',
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            // held at the crest, then pulled down with the receding water
            x: [0, 0, (i % 2 ? 14 : -14), (i % 2 ? -10 : 10)],
            y: [0, 0, (vh - pip.y) * 0.45, vh - pip.y + 30],
            opacity: [1, 1, 0.9, 0],
            scale: [1, 1.4, 1.1, 0.7],
          }}
          transition={{ duration: WAVE_S, times: [0, 0.42, 0.72, 1], ease: 'easeIn' }}
        />
      ))}

      {/* what the sea took */}
      <AnimatePresence>
        {event !== null && (
          <motion.div
            key={`text-${event.key}`}
            className="fixed inset-x-0 flex justify-center"
            style={{ bottom: '24dvh' }}
            initial={{ opacity: 0, y: -10, scale: 1.2 }}
            animate={{ opacity: [0, 1, 1, 0], y: reduceMotion ? 0 : [-10, 0, 10, 60], scale: 1 }}
            transition={{ duration: 2.4, delay: isWave && !reduceMotion ? WAVE_S * 0.42 : 0, times: [0, 0.12, 0.65, 1], ease: 'easeIn' }}
          >
            <span
              className="whitespace-nowrap font-pixel text-r-13 font-bold"
              style={{
                color: isWave ? '#fca5a5' : '#fde68a',
                textShadow: '0 0 10px rgba(14,116,144,0.9), 0 2px 4px rgba(0,0,0,0.9)',
              }}
            >
              {isWave
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
