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
// =============================================================================

import React, { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GAUNTLET, type BossRuleType } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { OrbitGauge } from './OrbitGauge.js';

interface TableTracker {
  Component: React.ComponentType;
  /** Design size in px — the tracker lays out at this size and is scaled to fit. */
  width:     number;
  height:    number;
}

/** Bosses whose tracker lives under the glass. (More move in FB-042 Phase 2.) */
const TABLE_TRACKERS: Partial<Record<BossRuleType, TableTracker>> = {
  ORBITAL_DECAY: { Component: OrbitGauge, width: 360, height: 200 },
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
  // Once the marker is cleared (celebration hold) the tracker fades out.
  const isCleared          = displayMarkerIndex !== currentMarkerIndex;

  const boxRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, width: 0 });
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
      className="pointer-events-none absolute inset-0"
      style={{ isolation: 'isolate', padding: 'clamp(6px, 1.1dvh, 16px) 16px' }}
      aria-label="Boss mechanic"
    >
      <div ref={boxRef} className="flex h-full w-full items-center justify-center">
        <AnimatePresence>
          {!isCleared && fit.width > 0 && (
            <motion.div
              key={rule}
              className="flex-none"
              style={{ width: fit.width, height: tracker.height, scale: fit.scale }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Component />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
