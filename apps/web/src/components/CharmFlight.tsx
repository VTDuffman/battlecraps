// =============================================================================
// BATTLECRAPS — CHARM FLIGHT (FB-034)
// apps/web/src/components/CharmFlight.tsx
//
// Mme. Le Prix's heart's flight. When the ❤️ moves to a new crew member, a
// heart lifts off the old portrait, swoops up to her name, then arcs down onto
// the new one (the entry charm starts at her name). The destination portrait
// holds its ❤️ until finishCharmFlight() — so the heart "lands".
//
// Portaled at fixed coordinates measured from the rail ([data-slot-index]) and
// the boss header ([data-boss-name-anchor]). Cosmetic only: it never blocks a
// roll, and a newer flight simply replaces it.
// =============================================================================

import React, { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { useGameStore } from '../store/useGameStore.js';
import { playHarpGlissando } from '../hooks/useCrowdAudio.js';

interface Pt { x: number; y: number }

const SAMPLES_PER_LEG = 14;
const TRAIL = [0, 0.06, 0.12, 0.18];

function slotCenter(slot: number): Pt | null {
  const el = document.querySelector(`[data-slot-index="${slot}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0) return null;
  // The wrapper's top is the portrait's top; the portrait is square.
  return { x: r.left + r.width / 2, y: r.top + r.width / 2 };
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

export const CharmFlight: React.FC = () => {
  const charmFlight       = useGameStore((s) => s.charmFlight);
  const finishCharmFlight = useGameStore((s) => s.finishCharmFlight);
  const reduceMotion      = useReducedMotion();
  const [path, setPath]   = useState<{ key: number; pts: Pt[]; dur: number } | null>(null);

  useLayoutEffect(() => {
    if (!charmFlight) { setPath(null); return; }
    const to   = slotCenter(charmFlight.to);
    const name = nameAnchor();
    if (!to || !name) { finishCharmFlight(); return; }   // nothing to fly between

    playHarpGlissando();
    if (reduceMotion) {
      setPath({ key: charmFlight.key, pts: [to], dur: 0.5 });
      return;
    }
    const from = charmFlight.from !== null ? slotCenter(charmFlight.from) : null;
    const pts = from
      ? [...arc(from, name, 0.25), ...arc(name, to, 0.25).slice(1)]
      : arc(name, to, 0.3);
    setPath({ key: charmFlight.key, pts, dur: from ? 1.3 : 0.85 });
  }, [charmFlight?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Safety net: never leave a portrait waiting on a lost animation.
  useLayoutEffect(() => {
    if (!charmFlight) return;
    const id = window.setTimeout(finishCharmFlight, 3000);
    return () => window.clearTimeout(id);
  }, [charmFlight?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!charmFlight || !path || path.key !== charmFlight.key) return null;

  const first = path.pts[0];
  if (!first) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[105]" aria-hidden="true">
      {reduceMotion ? (
        <motion.span
          className="absolute leading-none"
          style={{ left: first.x, top: first.y, x: '-50%', y: '-50%', fontSize: 28 }}
          initial={{ opacity: 0, scale: 1.6 }}
          animate={{ opacity: [0, 1, 0], scale: 1.6 }}
          transition={{ duration: path.dur }}
          onAnimationComplete={finishCharmFlight}
        >
          ❤️
        </motion.span>
      ) : (
        TRAIL.map((delay, i) => {
          const lead = i === 0;
          const size = lead ? 30 : 20 - i * 3;
          return (
            <motion.span
              key={`${path.key}-${i}`}
              className="absolute left-0 top-0 leading-none"
              style={{
                fontSize:  size,
                marginLeft: -size / 2,
                marginTop:  -size / 2,
                filter:    'drop-shadow(0 0 6px rgba(244,114,182,0.9))',
              }}
              initial={{ x: first.x, y: first.y, opacity: 0, scale: 0.4 }}
              animate={{
                x:       path.pts.map((p) => p.x),
                y:       path.pts.map((p) => p.y),
                opacity: lead ? [0, 1, 1, 1] : [0, 0.6, 0.4, 0],
                scale:   lead ? [0.4, 1.25, 1, 0.8] : [0.4, 1, 0.8, 0.4],
              }}
              transition={{ duration: path.dur, delay, ease: 'easeInOut' }}
              onAnimationComplete={lead ? finishCharmFlight : undefined}
            >
              {lead ? '❤️' : '💗'}
            </motion.span>
          );
        })
      )}
    </div>,
    document.body,
  );
};
