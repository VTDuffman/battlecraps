// =============================================================================
// BATTLECRAPS — DEVELOPER MODE PRESET SCENARIOS (FB-028)
// packages/shared/src/devScenarios.ts
//
// One-click starting points for the Scenario Builder. Add a preset whenever a
// setup gets rebuilt by hand more than once; "Copy as scenario" in the dev panel
// (Phase 4) produces JSON in this shape. Presets also serve as test fixtures.
//
// Crew uses Starter roster ids (16–30) so presets work on any account.
// =============================================================================

import { MARKER_TARGETS, getMaxBet } from './config.js';
import type { DevScenario } from './devScenario.js';

// Marker indices of each boss fight (every third marker).
const FOREMAN    = 2;
const LE_PRIX    = 8;
const EXECUTIVE  = 11;
const HIEROPHANT = 14;
const SOVEREIGN  = 17;
const COMMANDER  = 20;
const ARCHITECT  = 26;

// Lookout, Ace McGee, Close Call, Momentum, Echo — a generic starter lineup.
const STARTER_CREW = [16, 17, 18, 19, 20];

const target = (i: number): number => MARKER_TARGETS[i] ?? 0;

const FINAL_PASS_LINE = getMaxBet(ARCHITECT);

export const DEV_SCENARIOS: readonly DevScenario[] = [
  {
    name:          'Loading Dock — fresh start',
    markerIndex:   0,
    bankrollCents: 3000,
    crew:          [],
  },
  {
    name:        'Foreman — mid-bankroll',
    markerIndex: FOREMAN,
    crew:        STARTER_CREW,
  },
  {
    name:        'Le Prix — charm on a full crew',
    markerIndex: LE_PRIX,
    crew:        STARTER_CREW,
  },
  {
    name:        'Executive — one bad roll from PIP',
    markerIndex: EXECUTIVE,
    crew:        STARTER_CREW,
    bossCounter: 0, // Action Required
  },
  {
    name:        'Executive — Exceptional streak',
    markerIndex: EXECUTIVE,
    crew:        STARTER_CREW,
    bossCounter: 4, // Exceptional (+15%)
  },
  {
    name:                 'Hierophant — big escrow, point on',
    markerIndex:          HIEROPHANT,
    crew:                 STARTER_CREW,
    point:                6,
    pendingAdditiveCents: Math.round(target(HIEROPHANT) * 0.2 / 100) * 100,
  },
  {
    name:        'Sovereign — entering HIGH tide',
    markerIndex: SOVEREIGN,
    crew:        STARTER_CREW,
    bossCounter: 2, // LOW 0 · EBB 1 · HIGH 2 · FLOW 3
  },
  {
    name:        'Commander — hype 0.80× (death-spiral edge)',
    markerIndex: COMMANDER,
    crew:        STARTER_CREW,
    hype:        0.8,
  },
  {
    name:        'Architect — 4 seven-outs, one crew left',
    markerIndex: ARCHITECT,
    crew:        STARTER_CREW,
    bossCounter: 4,
  },
  {
    name:          'Final marker — hit the point to win',
    markerIndex:   ARCHITECT,
    crew:          STARTER_CREW,
    point:         6,
    bets:          { passLine: FINAL_PASS_LINE, odds: 0, hardways: { hard4: 0, hard6: 0, hard8: 0, hard10: 0 } },
    // Pass line pays 1:1 on the point, so this lands at target + pass line.
    bankrollCents: target(ARCHITECT) - FINAL_PASS_LINE,
  },
];
