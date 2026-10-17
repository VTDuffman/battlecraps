// =============================================================================
// BATTLECRAPS — BOSS TABLE WELL (FB-042, Under the Glass)
// apps/web/src/components/BossTableWell.tsx
//
// In a boss room the boss's mechanic tracker replaces the floor logo on the
// felt, spanning the width of the field, and the dice fly over it on every
// throw — the boss is the table. (The "glass" is figurative: no frame.)
//
// The root is `isolation: isolate`, so nothing inside can stack above the
// dice (DiceZone is z-[2], later in the DOM).
//
// Fit-to-space: each tracker has a design size. It is scaled so its design
// height fits the field (up to MAX_SCALE), then stretched horizontally to the
// field's full width, so it reads the same on a short phone and fills a wide
// one. No input: pointer-events none.
//
// Each throw: a glint sweeps across the tracker as the dice pass, and a soft
// shadow follows the dice over the felt (read from [data-dice-pair] each frame
// while rolling — bigger, softer and further off the higher the dice fly).
// =============================================================================

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { GAUNTLET, type BossRuleType } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { BOSS_TRACKERS, type TableTracker } from './tableTrackers.js';
import { ConvergenceTable } from './ConvergenceTable.js';

/** Every boss's tracker on the table — The Architect's is his rooms (FB-040). */
const TABLE_TRACKERS: Partial<Record<BossRuleType, TableTracker>> = {
  ...BOSS_TRACKERS,
  CONVERGENCE: { Component: ConvergenceTable, width: 360, height: 250 },
};

const MAX_SCALE = 1.5;

/** True when the boss at `markerIndex` has a tracker under the glass. */
export function hasTableTracker(markerIndex: number): boolean {
  const rule = GAUNTLET[markerIndex]?.boss?.rule;
  return rule !== undefined && TABLE_TRACKERS[rule] !== undefined;
}

export const BossTableWell: React.FC = () => {
  const displayMarkerIndex = useGameStore(selectDisplayMarkerIndex);
  const currentMarkerIndex = useGameStore((s) => s.currentMarkerIndex);
  const rule               = GAUNTLET[displayMarkerIndex]?.boss?.rule;
  const tracker            = rule !== undefined ? TABLE_TRACKERS[rule] : undefined;
  // Once the marker is cleared (celebration hold) the tracker fades out —
  // unless it has to stay for its own clear moment (keepThroughClear).
  const isCleared          = displayMarkerIndex !== currentMarkerIndex && tracker?.keepThroughClear !== true;

  const boxRef    = useRef<HTMLDivElement>(null);
  const rootRef   = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0 });
  const isRolling    = useGameStore((s) => s.isRolling);
  const reduceMotion = useReducedMotion() === true;

  // A glint per throw.
  const [glintKey, setGlintKey] = useState(0);
  const wasRolling = useRef(isRolling);
  useEffect(() => {
    if (isRolling && !wasRolling.current) setGlintKey((k) => k + 1);
    wasRolling.current = isRolling;
  }, [isRolling]);

  // The dice's shadow, while they're in the air (and a beat after).
  const stopAt  = useRef(0);
  const baseRef = useRef(0);   // the dice's on-table width, measured as the throw starts
  useEffect(() => {
    if (reduceMotion) return;
    if (isRolling) { stopAt.current = Infinity; baseRef.current = 0; }
    else stopAt.current = performance.now() + 700;
    let raf = 0;
    const tick = () => {
      const dice = document.querySelector('[data-dice-pair]');
      const root = rootRef.current;
      const sh   = shadowRef.current;
      if (dice && root && sh) {
        const d = dice.getBoundingClientRect();
        const r = root.getBoundingClientRect();
        if (baseRef.current === 0 && d.width > 0) baseRef.current = d.width;
        const base = baseRef.current;
        const lift = base > 0 ? Math.max(0, d.width / base - 1) : 0;   // the dice scale up as they rise
        const x = d.left + d.width / 2 - r.left + 8 + 26 * lift;
        const y = d.bottom - r.top + 8 + 40 * lift;
        const over = y > -10 && y < r.height + 10;
        sh.style.width     = `${Math.max(40, base * 0.9)}px`;
        sh.style.opacity   = over ? String(Math.max(0.12, 0.42 - 0.45 * lift)) : '0';
        sh.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${1 + 0.6 * lift})`;
        sh.style.filter    = `blur(${5 + 12 * lift}px)`;
      }
      if (performance.now() < stopAt.current) raf = requestAnimationFrame(tick);
      else if (sh) sh.style.opacity = '0';
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isRolling, reduceMotion]);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || !tracker) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const scale = Math.min(MAX_SCALE, r.width / tracker.width, r.height / tracker.height);
      setFit({ scale, width: r.width / scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tracker]);

  if (!tracker) return null;
  const { Component } = tracker;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-0"
      style={{ isolation: 'isolate', padding: 'clamp(6px, 1.1dvh, 16px) 16px' }}
      aria-label="Boss mechanic"
    >
      <div ref={boxRef} className="flex h-full w-full items-center justify-center">
        <AnimatePresence>
          {!isCleared && fit.width > 0 && (
            <motion.div
              key={rule}
              className="relative flex-none"
              style={{ width: fit.width, height: tracker.height, scale: fit.scale }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Component />
              {/* the glint, as the dice pass over */}
              {glintKey > 0 && !reduceMotion && (
                <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
                  <motion.div
                    key={glintKey}
                    className="absolute inset-y-0 w-1/3"
                    style={{ background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.16) 45%, rgba(255,255,255,0.26) 50%, rgba(255,255,255,0.16) 55%, transparent)', skewX: -18 }}
                    initial={{ left: '-40%' }}
                    animate={{ left: '120%' }}
                    transition={{ duration: 0.9, delay: 0.2, ease: 'easeInOut' }}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* the dice's shadow on the table */}
      <span
        ref={shadowRef}
        className="pointer-events-none absolute left-0 top-0 block rounded-full"
        style={{ height: 18, opacity: 0, background: 'radial-gradient(ellipse, rgba(0,0,0,0.85), rgba(0,0,0,0) 70%)' }}
      />
    </div>
  );
};
