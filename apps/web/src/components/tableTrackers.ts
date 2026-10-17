// =============================================================================
// BATTLECRAPS — TABLE TRACKERS REGISTRY (FB-042 / FB-040)
// apps/web/src/components/tableTrackers.ts
//
// Each boss's tracker on the table (BossTableWell), by rule, with the design
// size it lays out at. The Architect's table (ConvergenceTable) shows the
// newest room's tracker from here — with the Foreman's skim in place of his
// register (there's no Payoff in a room).
// =============================================================================

import React from 'react';
import { getBossPayoffCents, type BossRuleType } from '@battlecraps/shared';
import { useGameStore, selectDisplayMarkerIndex } from '../store/useGameStore.js';
import { OrbitGauge } from './OrbitGauge.js';
import { CashRegister } from './CashRegister.js';
import { SargeClock } from './SargeClock.js';
import { PerformanceMeter } from './PerformanceMeter.js';
import { OfferingBowl } from './OfferingBowl.js';
import { TideDial } from './TideDial.js';
import { TransmissionLine } from './TransmissionLine.js';
import { CharmTrap } from './CharmTrap.js';
import { ForemanSkim } from './ForemanSkim.js';

export interface TableTracker {
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

/** The Foreman's register, for the marker on display (it stays through the clear). */
const ForemanRegister: React.FC = () => {
  const markerIndex = useGameStore(selectDisplayMarkerIndex);
  return React.createElement(CashRegister, { payoffCents: getBossPayoffCents(markerIndex) ?? 2500, size: 'table' });
};

/** Each boss's own fight. */
export const BOSS_TRACKERS: Partial<Record<BossRuleType, TableTracker>> = {
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

/** The same bosses as rooms of The Architect's (the Foreman skims; no register). */
export const ROOM_TRACKERS: Partial<Record<BossRuleType, TableTracker>> = {
  ...BOSS_TRACKERS,
  EXTORTION_FEE: { Component: ForemanSkim, width: 360, height: 150 },
};
