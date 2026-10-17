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
import { GAUNTLET, getBossPayoffCents, type BossRuleType } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { OrbitGauge } from './OrbitGauge.js';
import { CashRegister } from './CashRegister.js';
import { SargeClock } from './SargeClock.js';
import { PerformanceMeter } from './PerformanceMeter.js';
import { OfferingBowl } from './OfferingBowl.js';
import { TideDial } from './TideDial.js';
import { TransmissionLine } from './TransmissionLine.js';
import { CharmTrap } from './CharmTrap.js';

/** The Foreman's register, for the marker on display (it stays through the clear). */
const ForemanRegister: React.FC = () => {
  const markerIndex = useGameStore(selectDisplayMarkerIndex);
  return <CashRegister payoffCents={getBossPayoffCents(markerIndex) ?? 2500} size="table" />;
};

interface TableTracker {
  Component: React.ComponentType;
  /** Design size in px — the tracker lays out at this size and is scaled to fit. */
  width:     number;
  height:    number;
  /**
   * Stay mounted through the celebration hold after the clear, instead of
   * fading out (The Foreman: the PAID IN FULL stamp lands from the register).
   */
  keepThroughClear?: boolean;
}

/** Bosses whose tracker lives on the table. (The Architect joins with FB-040.) */
const TABLE_TRACKERS: Partial<Record<BossRuleType, TableTracker>> = {
  EXTORTION_FEE:      { Component: ForemanRegister,  width: 360, height: 150, keepThroughClear: true },
  DOUBLE_TIME:        { Component: SargeClock,       width: 360, height: 170 },
  // The empty glass stays through THE ROSE (it shatters).
  DISABLE_CREW:       { Component: CharmTrap,        width: 360, height: 190, keepThroughClear: true },
  CROSS_CALIBRATION:  { Component: PerformanceMeter, width: 360, height: 170 },
  TRIBUTE:            { Component: OfferingBowl,     width: 360, height: 190 },
  TIDAL_SURGE:        { Component: TideDial,         width: 360, height: 170 },
  ORBITAL_DECAY:      { Component: OrbitGauge,       width: 360, height: 200 },
  TRANSMISSION_DELAY: { Component: TransmissionLine, width: 360, height: 150 },
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
