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
import { SheTakesTheCrewCinematic } from './SheTakesTheCrewCinematic.js';
import { TerminatedCinematic } from './TerminatedCinematic.js';
import { TheOrderCollectsCinematic } from './TheOrderCollectsCinematic.js';
import { TheWaveCinematic } from './TheWaveCinematic.js';
import { LossOfSignalCinematic } from './LossOfSignalCinematic.js';
import { TranslatedCinematic } from './TranslatedCinematic.js';

export interface DefeatCinematicProps {
  /** The boss's parting line (config.ts defeatCinematic.line). */
  line:            string;
  /** Payoff bosses: how short the player came up; null otherwise. */
  balanceDueCents: number | null;
  /** FB-035: The Executive's PIP termination (vs. an ordinary loss). */
  pipTermination:  boolean;
  /** Call when the cinematic is done — releases GAME_OVER (or ends a preview). */
  onFinish:        () => void;
}

export const DEFEAT_CINEMATICS: Record<BossDefeatCinematicId, React.ComponentType<DefeatCinematicProps>> = {
  DOCK_CLOSED:            DockClosedCinematic,
  DISHONORABLE_DISCHARGE: DishonorableDischargeCinematic,
  SHE_TAKES_THE_CREW:     SheTakesTheCrewCinematic,
  TERMINATED:             TerminatedCinematic,
  THE_ORDER_COLLECTS:     TheOrderCollectsCinematic,
  THE_WAVE:               TheWaveCinematic,
  LOSS_OF_SIGNAL:         LossOfSignalCinematic,
  TRANSLATED:             TranslatedCinematic,
};
