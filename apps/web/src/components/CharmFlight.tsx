// =============================================================================
// BATTLECRAPS — CHARM FLIGHT (FB-034, trap FB-042)
// apps/web/src/components/CharmFlight.tsx
//
// Mme. Le Prix's heart's flight. With her glass on the table (FB-042,
// CharmTrap — [data-charm-trap-anchor]) it runs in two stages:
//   'heart' — the ❤️ flies from the glass to the newly charmed crew member;
//             at the same time the one she was holding flies back out of the
//             glass to their own slot.
//   'sink'  — the new one sinks from the rail under the glass (a clink).
// The destination portrait holds its crew icon until the heart lands; the
// glass stays empty until the sink finishes (finishCharmFlight()).
// Without the glass on screen it falls back to the FB-034 arc via her name.
//
// Portaled at fixed coordinates measured from the rail ([data-slot-index]).
// Cosmetic only: it never blocks a roll, and a newer flight replaces it.
// =============================================================================

import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { playGlassClink, playHarpGlissando } from '../hooks/useCrowdAudio.js';
import { setRailHidden } from './cinematics/railCrew.js';
import { CREW_EMOJI } from './CrewPortrait.js';

interface Pt { x: number; y: number }

const SAMPLES_PER_LEG = 14;
const TRAIL = [0, 0.06, 0.12, 0.18];
const HEART_S = 0.85;
const SINK_S  = 0.8;

function slotCenter(slot: number): Pt | null {
  const el = document.querySelector(`[data-slot-index="${slot}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return null;
  // The wrapper's top is the portrait's top; the portrait is square.
  return { x: r.left + r.width / 2, y: r.top + r.width / 2 };
}

/** FB-042: the centre of Le Prix's glass on the table, if it's on screen. */
export function trapAnchor(): Pt | null {
  const el = document.querySelector('[data-charm-trap-anchor]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.55 };
}

function nameAnchor(): Pt | null {
  const el = document.querySelector('[data-boss-name-anchor]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // Just under the name, near its start (the name may be truncated).
  return { x: r.left + Math.min(r.width, 160) / 2, y: r.bottom + 4 };
}

/** Quadratic arc from a to b, bowed sideways by `bow` × its length. */
function arc(a: Pt, b: Pt, bow: number): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ctrl = { x: (a.x + b.x) / 2 - dy * bow, y: (a.y + b.y) / 2 + dx * bow };
  const pts: Pt[] = [];
  for (let i = 0; i <= SAMPLES_PER_LEG; i++) {
    const t = i / SAMPLES_PER_LEG, u = 1 - t;
    pts.push({
      x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * ctrl.y + t * t * b.y,
    });
  }
  return pts;
}

type Flight =
  | { key: number; mode: 'trap'; heart: Pt[]; home: { pts: Pt[]; emoji: string; slot: number } | null; sink: { pts: Pt[]; emoji: string } }
  | { key: number; mode: 'name'; heart: Pt[]; dur: number };

/** A crew member's stand-in, flying along `pts`. */
const Stand: React.FC<{ pts: Pt[]; emoji: string; dur: number; shrink: boolean; onDone?: () => void }> = ({ pts, emoji, dur, shrink, onDone }) => {
  const first = pts[0];
  if (!first) return null;
  return (
    <motion.span
      className="absolute left-0 top-0 leading-none"
      style={{ fontSize: 34, marginLeft: -17, marginTop: -17, filter: 'drop-shadow(0 0 8px rgba(244,114,182,0.8))' }}
      initial={{ x: first.x, y: first.y, scale: shrink ? 1 : 0.8 }}
      animate={{ x: pts.map((p) => p.x), y: pts.map((p) => p.y), scale: shrink ? [1, 1.2, 0.9] : [0.8, 1.2, 1] }}
      transition={{ duration: dur, ease: 'easeInOut' }}
      onAnimationComplete={onDone}
    >
      {emoji}
    </motion.span>
  );
};

/** The ❤️ and its little trail of 💗. */
const HeartTrail: React.FC<{ pts: Pt[]; dur: number; k: number; onDone?: () => void }> = ({ pts, dur, k, onDone }) => {
  const first = pts[0];
  if (!first) return null;
  return (
    <>
      {TRAIL.map((delay, i) => {
        const lead = i === 0;
        const size = lead ? 30 : 20 - i * 3;
        return (
          <motion.span
            key={`${k}-${i}`}
            className="absolute left-0 top-0 leading-none"
            style={{ fontSize: size, marginLeft: -size / 2, marginTop: -size / 2, filter: 'drop-shadow(0 0 6px rgba(244,114,182,0.9))' }}
            initial={{ x: first.x, y: first.y, opacity: 0, scale: 0.4 }}
            animate={{
              x:       pts.map((p) => p.x),
              y:       pts.map((p) => p.y),
              opacity: lead ? [0, 1, 1, 1] : [0, 0.6, 0.4, 0],
              scale:   lead ? [0.4, 1.25, 1, 0.8] : [0.4, 1, 0.8, 0.4],
            }}
            transition={{ duration: dur, delay, ease: 'easeInOut' }}
            onAnimationComplete={lead ? onDone : undefined}
          >
            {lead ? '❤️' : '💗'}
          </motion.span>
        );
      })}
    </>
  );
};

export const CharmFlight: React.FC = () => {
  const charmFlight       = useGameStore((s) => s.charmFlight);
  const finishCharmFlight = useGameStore((s) => s.finishCharmFlight);
  const sinkCharmFlight   = useGameStore((s) => s.sinkCharmFlight);
  const reduceMotion      = useReducedMotion() === true;
  const [flight, setFlight] = useState<Flight | null>(null);

  useLayoutEffect(() => {
    if (!charmFlight) { setFlight(null); return; }
    const to = slotCenter(charmFlight.to);
    if (!to) { finishCharmFlight(); return; }
    playHarpGlissando();

    const trap = trapAnchor();
    if (trap) {
      if (reduceMotion) { finishCharmFlight(); return; }
      const slots   = useGameStore.getState().crewSlots;
      const emojiAt = (i: number): string => CREW_EMOJI[slots[i]?.crewId ?? -1] ?? '?';
      const from    = charmFlight.from;
      const fromPt  = from !== null && from !== charmFlight.to ? slotCenter(from) : null;
      const home    = fromPt !== null && from !== null ? { pts: arc(trap, fromPt, -0.25), emoji: emojiAt(from), slot: from } : null;
      if (home) setRailHidden(home.slot, true);
      setFlight({
        key:   charmFlight.key,
        mode:  'trap',
        heart: arc(trap, to, 0.3),
        home,
        sink:  { pts: arc(to, trap, 0.2), emoji: emojiAt(charmFlight.to) },
      });
      return;
    }

    // Fallback (FB-034): the heart flies via her name.
    const name = nameAnchor();
    if (!name) { finishCharmFlight(); return; }
    if (reduceMotion) { setFlight({ key: charmFlight.key, mode: 'name', heart: [to], dur: 0.5 }); return; }
    const fromPt = charmFlight.from !== null ? slotCenter(charmFlight.from) : null;
    const pts = fromPt ? [...arc(fromPt, name, 0.25), ...arc(name, to, 0.25).slice(1)] : arc(name, to, 0.3);
    setFlight({ key: charmFlight.key, mode: 'name', heart: pts, dur: fromPt ? 1.3 : 0.85 });
  }, [charmFlight?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore a rail portrait hidden for its trip home if the flight is cut short.
  useLayoutEffect(() => {
    if (flight?.mode !== 'trap' || !flight.home) return;
    const slot = flight.home.slot;
    return () => setRailHidden(slot, false);
  }, [flight]);

  // Safety net: never leave a portrait waiting on a lost animation.
  useLayoutEffect(() => {
    if (!charmFlight) return;
    const id = window.setTimeout(finishCharmFlight, 3500);
    return () => window.clearTimeout(id);
  }, [charmFlight?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!charmFlight || !flight || flight.key !== charmFlight.key) return null;
  const stage = charmFlight.stage ?? 'heart';

  let content: React.ReactNode = null;
  if (flight.mode === 'name') {
    const first = flight.heart[0];
    content = reduceMotion && first ? (
      <motion.span
        className="absolute leading-none"
        style={{ left: first.x, top: first.y, x: '-50%', y: '-50%', fontSize: 28 }}
        initial={{ opacity: 0, scale: 1.6 }}
        animate={{ opacity: [0, 1, 0], scale: 1.6 }}
        transition={{ duration: flight.dur }}
        onAnimationComplete={finishCharmFlight}
      >
        ❤️
      </motion.span>
    ) : (
      <HeartTrail pts={flight.heart} dur={flight.dur} k={flight.key} onDone={finishCharmFlight} />
    );
  } else if (stage === 'heart') {
    const home = flight.home;
    content = (
      <>
        {home && (
          <Stand pts={home.pts} emoji={home.emoji} dur={HEART_S} shrink={false}
            onDone={() => setRailHidden(home.slot, false)} />
        )}
        <HeartTrail pts={flight.heart} dur={HEART_S} k={flight.key} onDone={sinkCharmFlight} />
      </>
    );
  } else {
    content = (
      <Stand key={`sink-${flight.key}`} pts={flight.sink.pts} emoji={flight.sink.emoji} dur={SINK_S} shrink
        onDone={() => { playGlassClink(); finishCharmFlight(); }} />
    );
  }

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[105]" aria-hidden="true">{content}</div>,
    document.body,
  );
};
