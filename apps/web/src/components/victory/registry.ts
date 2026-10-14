// =============================================================================
// BATTLECRAPS — BOSS VICTORY CINEMATIC REGISTRY (FB-033)
// apps/web/src/components/victory/registry.ts
//
// Maps config.ts `victoryCinematic.id` → component. To give another boss a win
// moment: add an id to BossVictoryCinematicId (shared config.ts), set it on the
// boss, build a component here that calls onFinish() when done, and keep it
// within its entry in the store's VICTORY_HOLD_MS_BY_ID (the celebration waits that long).
// =============================================================================

import type React from 'react';
import type { BossVictoryCinematicId } from '@battlecraps/shared';
import { HonorablyDischargedCinematic } from './HonorablyDischargedCinematic.js';
import { TheRoseCinematic } from './TheRoseCinematic.js';

export interface VictoryCinematicProps {
  /** The boss's line (config.ts victoryCinematic.line). */
  line:     string;
  /** Call when done — clears it (the celebration continues on its own timer). */
  onFinish: () => void;
}

export const VICTORY_CINEMATICS: Record<BossVictoryCinematicId, React.ComponentType<VictoryCinematicProps>> = {
  HONORABLY_DISCHARGED: HonorablyDischargedCinematic,
  THE_ROSE:             TheRoseCinematic,
};
