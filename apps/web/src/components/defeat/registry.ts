// =============================================================================
// BATTLECRAPS — BOSS DEFEAT CINEMATIC REGISTRY (FB-032)
// apps/web/src/components/defeat/registry.ts
//
// Maps config.ts `defeatCinematic.id` → component. To give another boss a loss
// moment: add an id to BossDefeatCinematicId (shared config.ts), set it on the
// boss, build a component here that calls onFinish() when done.
// =============================================================================

import type React from 'react';
import type { BossDefeatCinematicId } from '@battlecraps/shared';
import { DockClosedCinematic } from './DockClosedCinematic.js';
import { DishonorableDischargeCinematic } from './DishonorableDischargeCinematic.js';

export interface DefeatCinematicProps {
  /** The boss's parting line (config.ts defeatCinematic.line). */
  line:            string;
  /** Payoff bosses: how short the player came up; null otherwise. */
  balanceDueCents: number | null;
  /** Call when the cinematic is done — releases GAME_OVER (or ends a preview). */
  onFinish:        () => void;
}

export const DEFEAT_CINEMATICS: Record<BossDefeatCinematicId, React.ComponentType<DefeatCinematicProps>> = {
  DOCK_CLOSED:            DockClosedCinematic,
  DISHONORABLE_DISCHARGE: DishonorableDischargeCinematic,
};
