// =============================================================================
// BATTLECRAPS — BOSS TABLE WELL (FB-042, Under the Glass)
// apps/web/src/components/BossTableWell.tsx
//
// In a boss room the boss's mechanic tracker replaces the floor logo on the
// felt. It sits in a well set into the table, under a sheet of glass, and the
// dice fly over it on every throw — the boss is the table.
//
// Layers (bottom → top): the well (dark, inset into the felt) → the tracker →
// the glass (sheen + rim). The root is `isolation: isolate`, so nothing inside
// can stack above the dice (DiceZone is z-[2], later in the DOM).
//
// Fit-to-space: each tracker is laid out at a fixed design size and scaled to
// fit the well (ResizeObserver), up to MAX_SCALE, so it reads the same on a
// short phone and doesn't balloon on desktop. No input: pointer-events none.
// =============================================================================

import React, { useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { GAUNTLET, type BossRuleType } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { useFloorTheme } from '../hooks/useFloorTheme.js';
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
  const theme              = useFloorTheme();
  const rule               = GAUNTLET[displayMarkerIndex]?.boss?.rule;
  const tracker            = rule !== undefined ? TABLE_TRACKERS[rule] : undefined;
  // Once the marker is cleared (celebration hold) the tracker fades out.
  const isCleared          = displayMarkerIndex !== currentMarkerIndex;

  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el || !tracker) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      setScale(Math.min(MAX_SCALE, r.width / tracker.width, r.height / tracker.height));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tracker]);

  if (!tracker) return null;
  const { Component } = tracker;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ isolation: 'isolate', padding: 'clamp(6px, 1.1dvh, 16px) clamp(10px, 3vw, 20px)' }}
      aria-label="Boss mechanic"
    >
      {/* the well, set into the felt */}
      <div
        className="relative h-full w-full overflow-hidden rounded-xl"
        style={{
          background:  'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.30), rgba(0,0,0,0.55))',
          border:      `1px solid ${theme.borderLow}`,
          boxShadow:   'inset 0 3px 14px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {/* the tracker, scaled to fit */}
        <div ref={boxRef} className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence>
            {!isCleared && (
              <motion.div
                key={rule}
                className="flex-none"
                style={{ width: tracker.width, height: tracker.height, scale }}
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

        {/* the glass: a diagonal sheen, a bright top edge, a soft inner rim */}
        <div
          className="absolute inset-0 rounded-xl"
          style={{
            background: 'linear-gradient(128deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 22%, transparent 38%, transparent 62%, rgba(255,255,255,0.05) 76%, transparent 90%)',
            boxShadow:  'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 0 18px rgba(255,255,255,0.04)',
          }}
        />
      </div>
    </div>
  );
};
