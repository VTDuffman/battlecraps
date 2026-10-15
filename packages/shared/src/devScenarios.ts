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

import { MARKER_TARGETS, COMP_PERK_IDS, getMaxBet, getMinBet } from './config.js';
import type { DevScenario } from './devScenario.js';

// Marker indices of each boss fight (every third marker).
const FOREMAN    = 2;
const SARGE      = 5;
const LE_PRIX    = 8;
const EXECUTIVE  = 11;
const HIEROPHANT = 14;
const ATLANTIS_1 = 15;   // first marker after the Hierophant — The Covenant is held

// Floor-6 comps WITHOUT The Covenant, so High Tide's wave isn't turned back.
const NO_COVENANT = [COMP_PERK_IDS.THE_VIG, COMP_PERK_IDS.MEMBER_JACKET, COMP_PERK_IDS.SEA_LEGS];
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
    name:          'Foreman — fresh fight',
    markerIndex:   FOREMAN,
    crew:          STARTER_CREW,
    bankrollCents: 10_000, // a typical arrival after clearing the $100 marker
  },
  {
    // Any win at the $20 max bet skims ≥ $2 → crosses the $25 Payoff → PAID IN FULL.
    name:              'Foreman — one win from the Payoff',
    markerIndex:       FOREMAN,
    crew:              STARTER_CREW,
    bankrollCents:     10_000,
    bossProgressCents: 2_300,
  },
  {
    // Last shooter, point on, short of the Payoff: a seven-out slams the dock door.
    name:              'Foreman — last shooter, short of the Payoff',
    markerIndex:       FOREMAN,
    crew:              STARTER_CREW,
    bankrollCents:     10_000,
    shooters:          1,
    point:             6,
    bossProgressCents: 1_800,
  },
  {
    name:        'Sarge — fresh fight',
    markerIndex: SARGE,
    crew:        STARTER_CREW,
  },
  {
    // Point on, 1 roll left on the Double Time clock (counter 5 of 6 used):
    // hit the point → beat the clock; a blank → TIME'S UP.
    name:        'Sarge — last roll on the clock',
    markerIndex: SARGE,
    crew:        STARTER_CREW,
    point:       6,
    bossCounter: 5,
  },
  {
    // Last shooter, 3 rolls left: run the clock out (or seven-out) and Sarge
    // ends the run → DISHONORABLE DISCHARGE (+ the TIME'S UP whistle).
    name:        'Sarge — last shooter, clock running',
    markerIndex: SARGE,
    crew:        STARTER_CREW,
    shooters:    1,
    point:       6,
    bossCounter: 3,
  },
  {
    // The entry charm: the heart flies from her name to a crew member.
    name:        'Le Prix — fresh fight',
    markerIndex: LE_PRIX,
    crew:        STARTER_CREW,
  },
  {
    // The Doorman (+$ on every come-out) in slot 0, charmed: the first come-out
    // plays the charm heartbeat + her charmFired bark, then the heart flies on.
    name:        'Le Prix — charm on the Doorman',
    markerIndex: LE_PRIX,
    crew:        [24, 16, 17, 18, 19],
    bossCounter: 0,
  },
  {
    // Point on, one min-bet win short of her target: hit the point → THE ROSE.
    name:          'Le Prix — one win from the rose',
    markerIndex:   LE_PRIX,
    crew:          STARTER_CREW,
    bankrollCents: target(LE_PRIX) - getMinBet(LE_PRIX),
    point:         6,
  },
  {
    // Last shooter, point on: a seven-out → SHE TAKES THE CREW.
    name:        'Le Prix — last shooter, point on',
    markerIndex: LE_PRIX,
    crew:        STARTER_CREW,
    shooters:    1,
    point:       6,
  },
  {
    // Action Required (red alarm meter): a bad roll → TERMINATED, PIP memo.
    name:        'Executive — one bad roll from PIP',
    markerIndex: EXECUTIVE,
    crew:        STARTER_CREW,
    bossCounter: 0, // Action Required
  },
  {
    // Very Strong: a natural or point hit → promoted bark + office ding.
    name:        'Executive — one step from Exceptional',
    markerIndex: EXECUTIVE,
    crew:        STARTER_CREW,
    bossCounter: 3, // Very Strong
  },
  {
    // Exceptional (gold meter): every win pops "+15% · $X".
    name:        'Executive — Exceptional streak',
    markerIndex: EXECUTIVE,
    crew:        STARTER_CREW,
    bossCounter: 4, // Exceptional (+15%)
  },
  {
    // Point on, one min-bet win short of his target: hit the point → THE NAMEPLATE SWAP.
    name:          'Executive — one win from the corner office',
    markerIndex:   EXECUTIVE,
    crew:          STARTER_CREW,
    bankrollCents: target(EXECUTIVE) - getMinBet(EXECUTIVE),
    point:         6,
  },
  {
    // Last shooter, point on, rating Strong: a seven-out → TERMINATED, Position Eliminated memo.
    name:        'Executive — last shooter, point on',
    markerIndex: EXECUTIVE,
    crew:        STARTER_CREW,
    shooters:    1,
    point:       6,
  },
  {
    // A full offering bowl, point on: hit it → a big release × Hype; seven-out
    // → a big TRIBUTE (bell + choir).
    name:                 'Hierophant — big escrow, point on',
    markerIndex:          HIEROPHANT,
    crew:                 STARTER_CREW,
    point:                6,
    pendingAdditiveCents: Math.round(target(HIEROPHANT) * 0.2 / 100) * 100,
  },
  {
    // Point on, one min-bet win short of his target: hit the point → THE EYE CLOSES.
    name:          'Hierophant — one win from the eye',
    markerIndex:   HIEROPHANT,
    crew:          STARTER_CREW,
    bankrollCents: target(HIEROPHANT) - getMinBet(HIEROPHANT),
    point:         6,
  },
  {
    // Last shooter, point on: a seven-out → THE ORDER COLLECTS.
    name:        'Hierophant — last shooter, point on',
    markerIndex: HIEROPHANT,
    crew:        STARTER_CREW,
    shooters:    1,
    point:       6,
  },
  {
    // Floor 6 with The Covenant (earned from the Hierophant), last shooter,
    // point on: a seven-out → THE ORDER PROTECTS, and the run goes on.
    name:        'Covenant — Floor 6, last shooter, point on',
    markerIndex: ATLANTIS_1,
    crew:        STARTER_CREW,
    shooters:    1,
    point:       6,
  },
  // The Sovereign's tide (FB-037): boss counter LOW 0 · EBB 1 · HIGH 2 · FLOW 3.
  {
    // Dead Calm: the Odds square is waterlogged; no odds bets.
    name:        'Sovereign — Dead Calm, point on',
    markerIndex: SOVEREIGN,
    crew:        STARTER_CREW,
    point:       6,
    bossCounter: 0,
  },
  {
    // The Undertow: a seven-out → the sea fills, drains, drags 35% of the bankroll.
    name:        'Sovereign — Undertow, point on',
    markerIndex: SOVEREIGN,
    crew:        STARTER_CREW,
    point:       6,
    bossCounter: 1,
  },
  {
    // High Tide, no Covenant: a seven-out → the wave drowns two shooters.
    name:        'Sovereign — High Tide, point on (no Covenant)',
    markerIndex: SOVEREIGN,
    crew:        STARTER_CREW,
    point:       6,
    bossCounter: 2,
    compPerkIds: NO_COVENANT,
  },
  {
    // High Tide on the last two shooters, no Covenant: a seven-out → THE WAVE.
    name:        'Sovereign — High Tide, last two shooters',
    markerIndex: SOVEREIGN,
    crew:        STARTER_CREW,
    shooters:    2,
    point:       6,
    bossCounter: 2,
    compPerkIds: NO_COVENANT,
  },
  {
    // Point on, one min-bet win short of his target: hit the point → THE CROWN SINKS.
    name:          'Sovereign — one win from the crown',
    markerIndex:   SOVEREIGN,
    crew:          STARTER_CREW,
    bankrollCents: target(SOVEREIGN) - getMinBet(SOVEREIGN),
    point:         6,
  },
  {
    // On Fire in orbit: every roll the bleed takes 20% of the height above 1.0×;
    // guttering flames, the muffled crowd, a high fast-decaying orbit.
    name:        'Commander — On Fire, point on',
    markerIndex: COMMANDER,
    crew:        STARTER_CREW,
    hype:        3.0,
    point:       6,
  },
  {
    // Point on, one min-bet win short of his target: hit the point → ESCAPE VELOCITY.
    name:          'Commander — one win from escape',
    markerIndex:   COMMANDER,
    crew:          STARTER_CREW,
    bankrollCents: target(COMMANDER) - getMinBet(COMMANDER),
    point:         6,
  },
  {
    // Last shooter, high orbit, point on: a seven-out → "we have a problem" →
    // LOSS OF SIGNAL. (The Covenant is held at Floor 7, so it's left out here.)
    name:        'Commander — last shooter, point on',
    markerIndex: COMMANDER,
    crew:        STARTER_CREW,
    shooters:    1,
    hype:        2.0,
    point:       6,
    compPerkIds: [COMP_PERK_IDS.THE_VIG, COMP_PERK_IDS.MEMBER_JACKET, COMP_PERK_IDS.SEA_LEGS, COMP_PERK_IDS.POSEIDONS_FAVOR],
  },
  {
    name:        'Architect — 4 seven-outs, one crew left',
    markerIndex: ARCHITECT,
    // Each seven-out removes one crew member, so 4 seven-outs leaves 1 of 5.
    crew:        [16, null, null, null, null],
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
