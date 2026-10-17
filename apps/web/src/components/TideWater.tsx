// =============================================================================
// BATTLECRAPS — TIDE WATER (FB-037, The Sovereign)
// apps/web/src/components/TideWater.tsx
//
// The sea in The Sovereign's throne room. Translucent water along the bottom of
// the table rises and falls with the tide — a trace at Dead Calm, risen at the
// Undertow, high over the felt at High Tide — with a moving surface. It never
// blocks input (pointer-events: none).
//   • The tide turns: a slow swell.
//   • A Seven-Out at the Undertow or High Tide: the sea rises to fill the whole
//     screen, foam boiling along its crest, holds a beat, then drains back down
//     and takes something with it —
//       Undertow:  dollar bills torn out of your bankroll readout, tumbling
//                  down with the water — "UNDERTOW −$X".
//       High Tide: your lost shooter pips (measured from the HUD), swollen and
//                  glowing, struggling as they're dragged under —
//                  "THE WAVE — N SHOOTERS DROWNED".
// Driven by bossPointHits (stage) + lastTide (events). Nothing sounds on mount.
// =============================================================================

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GAUNTLET, getTideStage, type BossRuleParams, type TideEffect } from '@battlecraps/shared';
import { useGameStore } from '../store/useGameStore.js';
import { playSwell, playUndertow, playWaveCrash } from '../hooks/useCrowdAudio.js';
import { isRuleOn, paramsOfRule, ruleCounter } from '../lib/bossRules.js';

const LEVEL: Record<TideEffect, number> = { DEAD_CALM: 3, UNDERTOW: 8, HIGH_TIDE: 14 };   // dvh
const SEA    = 'rgba(14,116,144,';
const FILL_S = 3.4;      // rise → hold → drain
const CREST  = 0.38;     // share of FILL_S when the water starts to drain
const BILLS  = 8;

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

interface Pt { x: number; y: number }

function centerOf(selector: string): Pt | null {
  const r = document.querySelector(selector)?.getBoundingClientRect();
  return r && r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
}

/** A lost shooter pip: swells and glows when the wave takes it, then struggles as it's dragged under. */
const DrowningPip: React.FC<{ at: Pt; i: number; depth: number }> = ({ at, i, depth }) => {
  const side = i % 2 ? 1 : -1;
  return (
    <motion.span
      className="absolute block rounded-full"
      style={{
        left: at.x - 6, top: at.y - 6, width: 12, height: 12,
        background: 'radial-gradient(circle at 35% 30%, #fff5c2, #f5c842 55%, #b8891a)',
        boxShadow: '0 0 10px 3px rgba(245,200,66,0.9)',
      }}
      initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
      animate={{
        // caught at the crest → swells → fights the current on the way down
        x:      [0, 0, side * 16, -side * 14, side * 18, -side * 10, side * 12, 0],
        y:      [0, 0, depth * 0.14, depth * 0.08, depth * 0.34, depth * 0.27, depth * 0.62, depth],
        scale:  [1, 3.2, 2.7, 3.0, 2.5, 2.8, 2.0, 1.2],
        rotate: [0, 0, -18, 14, -22, 12, -10, 0],
        opacity:[1, 1, 1, 1, 0.95, 0.95, 0.8, 0],
      }}
      transition={{ duration: FILL_S, times: [0, CREST, 0.5, 0.58, 0.68, 0.76, 0.88, 1], ease: 'easeInOut' }}
    />
  );
};

/** A bill torn out of the bankroll, tumbling down with the receding water. */
const SinkingBill: React.FC<{ at: Pt; i: number; depth: number }> = ({ at, i, depth }) => {
  const spread = (i - (BILLS - 1) / 2) * 22;
  const spin   = (i % 2 ? 1 : -1) * (200 + (i * 47) % 160);
  return (
    <motion.span
      className="absolute block select-none leading-none"
      style={{ left: at.x - 12, top: at.y - 12, fontSize: 24, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.6))' }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.6 }}
      animate={{
        x:       [0, 0, spread * 0.6, spread, spread * 1.3],
        y:       [0, 0, 18 + (i % 3) * 8, depth * 0.55, depth],
        rotate:  [0, 0, spin * 0.25, spin * 0.7, spin],
        opacity: [0, 1, 1, 0.9, 0],
        scale:   [0.6, 1.2, 1.1, 1, 0.9],
      }}
      transition={{ duration: FILL_S, times: [0, CREST, CREST + 0.1 + (i % 4) * 0.02, 0.8, 1], ease: 'easeIn' }}
    >
      💵
    </motion.span>
  );
};

export const TideWater: React.FC = () => {
  const markerIndex  = useGameStore((s) => s.currentMarkerIndex);
  // FB-040: her own fight, or her room in The Architect's (its own tide).
  const counter      = useGameStore((s) => ruleCounter(s, 'TIDAL_SURGE'));
  const tideOn       = useGameStore((s) => isRuleOn(s, 'TIDAL_SURGE'));
  const lastTide     = useGameStore((s) => s.lastTide);
  const reduceMotion = useReducedMotion() === true;

  const mountKey = useRef(lastTide?.key ?? 0);
  const fresh    = lastTide !== null && lastTide.key !== mountKey.current ? lastTide : null;
  const [event, setEvent]   = useState<{ kind: 'undertow' | 'wave'; amount: number; key: number } | null>(null);
  const [targets, setTargets] = useState<Pt[]>([]);

  useEffect(() => {
    if (!fresh) return;
    // A run-ending roll belongs to his defeat cinematic (THE WAVE) — stand aside.
    if (useGameStore.getState().pendingDefeat !== null) return;
    let kind: 'undertow' | 'wave' | null = null;
    if ((fresh.waveShooters ?? 0) > 0) { kind = 'wave'; playWaveCrash(); }
    else if ((fresh.undertowCents ?? 0) > 0) { kind = 'undertow'; playWaveCrash(); window.setTimeout(playUndertow, FILL_S * CREST * 1000); }
    else if (fresh.nextStage !== fresh.stage) playSwell();
    if (kind === null) return;
    setEvent({ kind, amount: kind === 'wave' ? (fresh.waveShooters ?? 0) : (fresh.undertowCents ?? 0), key: fresh.key });
    const id = window.setTimeout(() => setEvent(null), FILL_S * 1000 + 900);
    return () => window.clearTimeout(id);
  }, [fresh?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the sea takes, measured on screen: the lost shooter pips (just past
  // what's left — the store has already settled the roll) or the bankroll.
  useLayoutEffect(() => {
    if (event === null) { setTargets([]); return; }
    if (event.kind === 'wave') {
      const left = useGameStore.getState().shooters;
      setTargets(Array.from({ length: event.amount }, (_, i) => centerOf(`[data-shooter-pip="${left + i}"]`))
        .filter((p): p is Pt => p !== null));
    } else {
      const bank = centerOf('[data-bankroll-readout]');
      setTargets(bank ? [bank] : []);
    }
  }, [event?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = paramsOfRule('TIDAL_SURGE');
  if (!tideOn || params === null) return null;
  const level  = LEVEL[getTideStage(params, counter).effect];

  const surge   = event !== null && !reduceMotion;
  const heights = surge ? [`${level}dvh`, '104dvh', '104dvh', `${level}dvh`] : `${level}dvh`;
  const vh      = typeof window !== 'undefined' ? window.innerHeight : 800;
  const bank    = event?.kind === 'undertow' ? targets[0] : undefined;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[35]" aria-hidden="true">
      {/* the water */}
      <motion.div
        className="absolute inset-x-0 bottom-0"
        style={{ background: `linear-gradient(180deg, ${SEA}${surge ? 0.32 : 0.22}) 0%, ${SEA}${surge ? 0.38 : 0.30}) 40%, rgba(8,51,68,${surge ? 0.5 : 0.42}) 100%)` }}
        initial={false}
        animate={{ height: heights }}
        transition={surge
          ? { duration: FILL_S, times: [0, 0.26, CREST, 1], ease: ['easeOut', 'linear', 'easeIn'] }
          : { type: 'spring', stiffness: 40, damping: 12 }}
      >
        {surge && <Foam />}
        {!reduceMotion && <Surface speed={7} opacity={0.35} offset={0} />}
        {!reduceMotion && <Surface speed={11} opacity={0.2} offset={3} />}
      </motion.div>

      {/* what the sea drags away */}
      {surge && event.kind === 'wave' && targets.map((pip, i) => (
        <DrowningPip key={`${event.key}-${i}`} at={pip} i={i} depth={vh - pip.y + 30} />
      ))}
      {surge && bank && Array.from({ length: BILLS }, (_, i) => (
        <SinkingBill key={`${event.key}-${i}`} at={bank} i={i} depth={vh - bank.y + 40} />
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
            transition={{ duration: 2.4, delay: reduceMotion ? 0 : FILL_S * CREST, times: [0, 0.12, 0.65, 1], ease: 'easeIn' }}
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
