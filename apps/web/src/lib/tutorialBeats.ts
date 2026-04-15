// =============================================================================
// BATTLECRAPS — TUTORIAL BEAT DEFINITIONS
// apps/web/src/lib/tutorialBeats.ts
//
// All 11 tutorial beats. Pure data — no component logic.
// Path A = craps basics (beats 1–7), Path B = BattleCraps rules (beats 8–11).
// =============================================================================

export type SpotlightZone =
  | 'none'
  | 'game-status'
  | 'betting-grid'
  | 'betting-passline'
  | 'betting-odds'
  | 'betting-hardways'
  | 'dice-zone'
  | 'crew-rail'
  | 'hype-meter'
  | 'marker-progress'
  | 'boss-portrait';

export type BeatAdvanceMode =
  | 'tap'
  | 'bet-passline'
  | 'bet-odds'
  | 'bet-hardway'
  | 'simulated-roll'
  | 'manual-roll'
  | 'animated';

export interface TutorialBeat {
  id: number;
  path: 'A' | 'B' | 'AB';
  spotlight: SpotlightZone;
  salText: string;
  salTextMore?: string;
  advanceMode: BeatAdvanceMode;
  advanceLabel?: string;
  skipable?: boolean;
  simulatedRoll?: {
    die1: number;
    die2: number;
    result: 'point-set' | 'point-hit' | 'seven-out';
    pointNumber?: number;
  };
}

export const TUTORIAL_BEATS: TutorialBeat[] = [
  // ── PATH A: Craps Basics (Beats 1–7) ──────────────────────────────────────

  {
    id: 1,
    path: 'A',
    spotlight: 'betting-passline',
    salText: `First thing you need is a Pass Line bet. You are betting with the shooter. Every shooter's turn, you decide: in or out.`,
    advanceMode: 'bet-passline',
    advanceLabel: 'Put something on the line.',
  },
  {
    id: 2,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `Now the come-out roll. 7 or 11 right here — we win. 2, 3, or 12 — we lose. Anything else sets the point.`,
    advanceMode: 'manual-roll',
    simulatedRoll: { die1: 4, die2: 2, result: 'point-set', pointNumber: 6 },
  },
  {
    id: 3,
    path: 'A',
    spotlight: 'game-status',
    salText: `There's your point — 6. That puck tells you what we're chasing.\nHit it again before a 7 shows, and we get paid.`,
    advanceMode: 'tap',
    advanceLabel: 'Got it.',
  },
  {
    id: 4,
    path: 'A',
    spotlight: 'betting-odds',
    salText: `Here's the angle the house hates. Odds bet. No vig, no edge.\nYou're backing your Pass bet at true odds. Best bet in the building.`,
    salTextMore: `For a point of 6 or 8, odds pay 6:5. For 5 or 9, they pay 3:2. For 4 or 10, they pay 2:1.`,
    advanceMode: 'bet-odds',
    advanceLabel: 'Back it up.',
  },
  {
    id: 4.5,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `Bring it home. Hit that 6 and show me some green.`,
    advanceMode: 'manual-roll',
    simulatedRoll: { die1: 3, die2: 3, result: 'point-hit' },
  },
  {
    id: 5,
    path: 'A',
    spotlight: 'game-status',
    salText: `There it is! Point hit. Pass pays even money, odds pays 6:5.`,
    advanceMode: 'tap',
    advanceLabel: 'Got it.',
  },
  {
    id: 5.1,
    path: 'A',
    spotlight: 'betting-passline',
    salText: `Every new shooter starts with the line. Get back in the game.`,
    advanceMode: 'bet-passline',
    advanceLabel: 'Put something on the line.',
  },
  {
    id: 5.2,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `Let's see where the new point lands. Give it a toss.`,
    advanceMode: 'manual-roll',
    simulatedRoll: { die1: 5, die2: 4, result: 'point-set' },
  },
  {
    id: 5.3,
    path: 'A',
    spotlight: 'game-status',
    salText: `That's a 9. Our new point. Hit it before a 7, or Sal gets grumpy.`,
    advanceMode: 'tap',
    advanceLabel: 'Got it.',
  },
  {
    id: 6,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `One last roll. In a real game, this could go on for an hour. But for now, let's look at the heartbreaker.`,
    advanceMode: 'manual-roll',
    simulatedRoll: { die1: 3, die2: 4, result: 'seven-out' },
  },
  {
    id: 6.1,
    path: 'A',
    spotlight: 'game-status',
    salText: `The seven-out. 7 shows before the point — you lose your pass and your odds. Shooter's done. New shooter steps up.`,
    advanceMode: 'tap',
    advanceLabel: 'Got it.',
  },
  // ── Marker Clear Finale (Beats 7–9) ──────────────────────────────────────

  {
    id: 7,
    path: 'A',
    spotlight: 'betting-passline',
    salText: `Let's get that marker. Start with $5 on the Pass Line.`,
    advanceMode: 'bet-passline',
    advanceLabel: 'Put something on the line.',
  },
  {
    id: 7.1,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `Roll it. Let's see a number.`,
    advanceMode: 'manual-roll',
    simulatedRoll: { die1: 6, die2: 2, result: 'point-set' },
  },
  {
    id: 7.2,
    path: 'A',
    spotlight: 'betting-odds',
    salText: `An 8. Not bad. Back it up with $5 in Odds to lower the house edge.`,
    advanceMode: 'bet-odds',
    advanceLabel: 'Back it up.',
  },
  {
    id: 7.3,
    path: 'A',
    spotlight: 'betting-hardways',
    salText: `Now, my favorite. Put $5 on the Hard 8. It pays 9:1, but only if it hits as a pair of 4s. It's a long shot, but I got a feeling...`,
    advanceMode: 'bet-hardway',
    advanceLabel: 'Lock it in.',
  },
  {
    id: 7.4,
    path: 'A',
    spotlight: 'dice-zone',
    salText: `Come on, squares. Give me the twin towers!`,
    advanceMode: 'manual-roll',
    simulatedRoll: { die1: 4, die2: 4, result: 'point-hit' },
  },
  {
    id: 8,
    path: 'A',
    spotlight: 'game-status',
    salText: `HARD EIGHT! $301! Look at that bankroll jump. You just cleared your first marker, kid.`,
    advanceMode: 'tap',
    advanceLabel: 'Got it.',
  },
  {
    id: 9,
    path: 'A',
    spotlight: 'none',
    salText: `You're looking good. Go to the pub to select your first crew member and get back to rollin'!`,
    advanceMode: 'tap',
    advanceLabel: 'TO THE PUB!',
  },
];
