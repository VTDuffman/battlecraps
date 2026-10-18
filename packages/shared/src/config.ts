// =============================================================================
// BATTLECRAPS — SHARED GAME CONFIGURATION
// packages/shared/src/config.ts
//
// Constants that must match exactly between the API (game engine) and the
// web client (progress UI). Placing them here is the single source of truth.
// =============================================================================

import type { CrewRarity } from './types.js';

// ---------------------------------------------------------------------------
// Dynamic crew hiring cost (FB-023)
// ---------------------------------------------------------------------------

/**
 * Number of max-bets a crew member costs to hire, by rarity.
 * Hire cost = RARITY_COST_MULTIPLIERS[rarity] × getMaxBet(clearedMarkerTarget).
 * This scales hiring decisions proportionally to the stakes at every floor.
 */
export const RARITY_COST_MULTIPLIERS: Record<CrewRarity, number> = {
  Starter:   2,
  Common:    3,
  Uncommon:  4,
  Rare:      5,
  Epic:      7,
  Legendary: 9,
};

/**
 * Compute the actual hire cost for a crew member at the current pub stop.
 *
 * @param rarity                 The crew member's rarity tier.
 * @param clearedMarkerTargetCents  The target (in cents) of the marker just cleared
 *                               (i.e. GAUNTLET[currentMarkerIndex - 1].targetCents).
 * @returns Hire cost in cents.
 */
export function getCrewHireCost(rarity: CrewRarity, clearedMarkerTargetCents: number): number {
  const maxBet = Math.floor(clearedMarkerTargetCents * 0.10);
  return RARITY_COST_MULTIPLIERS[rarity] * maxBet;
}

// ---------------------------------------------------------------------------
// Crew-cash taper (FB-041)
// ---------------------------------------------------------------------------

/**
 * Share of the table max that floor-scaled crew cash is based on, per floor
 * (index 0 = Floor 1 … 8 = Floor 9). Full strength through Floor 4, then it
 * cools off — crew cash scales with the target and pays on losing rolls, so
 * without this taper the late game barely pushes back
 * (docs/design/gauntlet-difficulty-audit.md). Tuned with
 * scripts/sim/gauntlet-economy-sim.mjs.
 *
 * Steeper A+ curve (analysed in FB-041, ready to pull if the late game is still
 * too soft — no new analysis needed; see the FB-041 design doc § Change 2):
 *   [1, 1, 1, 1, 0.7, 0.6, 0.5, 0.45, 0.4]
 */
export const CREW_CASH_SCALE_BY_FLOOR: readonly number[] = [1, 1, 1, 1, 0.8, 0.7, 0.6, 0.5, 0.45];

/**
 * The base every floor-scaled cash crew multiplies by its ADDITIVE_MULT:
 * the marker's table max (10% of the target) × the floor's crew-cash scale.
 * The only place crew cash is scaled — crew files read it from
 * TurnContext.crewCashBaseCents and never compute 10% of the target themselves.
 */
export function getCrewCashBaseCents(markerIndex: number): number {
  const target = GAUNTLET[markerIndex]?.targetCents ?? GAUNTLET[GAUNTLET.length - 1]!.targetCents;
  const floor  = Math.min(Math.max(Math.floor(markerIndex / 3), 0), CREW_CASH_SCALE_BY_FLOOR.length - 1);
  const scale  = CREW_CASH_SCALE_BY_FLOOR[floor] ?? 1;
  return Math.floor(Math.floor(target * 0.10) * scale);
}

// ---------------------------------------------------------------------------
// The opening — "First Round's on the House" (FB-041)
// ---------------------------------------------------------------------------

/**
 * Starting bankroll for a run created while the tutorial is pending. The
 * tutorial's scripted dice need $30 — $40 cleared the first marker too early
 * and broke its beat flow.
 */
export const TUTORIAL_BANKROLL_CENTS = 3_000;

/**
 * Starting bankroll for every run after the tutorial. These runs also open on
 * a free Starter pick (the opening pub) before the first roll.
 */
export const OPENING_BANKROLL_CENTS = 4_000;

/**
 * True when a pub visit at this marker is the opening pub: a run that hasn't
 * cleared any marker yet is in TRANSITION only for its free first pick. The
 * draft is 3 random Starter-roster crew and hiring costs nothing.
 */
export function isOpeningPub(markerIndex: number): boolean {
  return markerIndex === 0;
}

/**
 * True when the pub at this marker offers Starter-roster crew only: a run's
 * first pub, whichever it is — the opening pub (marker 0, post-tutorial runs)
 * or the pub after marker 0 (the tutorial run's first pub). Guaranteed unlocks
 * wait for the next pub.
 */
export function isStarterOnlyPub(markerIndex: number): boolean {
  return markerIndex <= 1;
}

// ---------------------------------------------------------------------------
// Boss rule & reward types
// ---------------------------------------------------------------------------

/** The mechanical modifier a boss applies during their High Limit Room fight. */
export type BossRuleType =
  | 'EXTORTION_FEE'          // Floor 1 — The Foreman: 20% tax on all winning payouts
  | 'DOUBLE_TIME'            // Floor 2 — Sarge: hit the point within rollLimit rolls or it's a Seven-Out (FB-030)
  | 'DISABLE_CREW'           // Floor 3 — Mme. Le Prix: one crew member enchanted per come-out
  | 'CROSS_CALIBRATION'      // Floor 4 — The Executive: performance review rating tracks roll outcomes
  | 'TRIBUTE'                // Floor 5 — The Hierophant: crew additives held until a win, paid with Hype; 75% seized on 7-out
  | 'TIDAL_SURGE'            // Floor 6 — The Sovereign: 4-stage tide — Dead Calm (no odds) / Undertow (7-out drags bankroll) / High Tide (7-out drowns 2)
  | 'ORBITAL_DECAY'          // Floor 7 — The Commander: orbital bleed — every roll hype above 1.0× loses 20% of its height (FB-038)
  | 'FIRST_CONTACT_PROTOCOL' // Floor 8 — retired mechanic; kept in union for historical safety
  | 'TRANSMISSION_DELAY'     // Floor 8 — The Emissary: signal lag (crew effects land a roll late) + a crew blackout after a 7-out (FB-039)
  | 'CONVERGENCE';           // Floor 9 — The Architect: rooms rebuilt from every boss you've beaten, stacking with each seven-out (FB-040)

/** The permanent comp perk awarded for defeating a boss. */
export type CompRewardType =
  | 'THE_VIG'         // Floor 1 — The Vig: crew cash abilities pay out 20% more
  | 'EXTRA_SHOOTER'   // Floor 2 — Member's Jacket: +1 Shooter at every marker for the rest of the run
  | 'HYPE_RESET_HALF' // Floor 3 — The Keepsake: on Seven Out, keep half the Hype above 1.0×
  | 'BOARD_SEAT'      // Floor 4 — Board Seat: a fourth crew slot unlocks
  | 'THE_COVENANT'    // Floor 5 — The Covenant: once per marker, the first Seven Out keeps the shooter (FB-036)
  | 'POSEIDONS_FAVOR' // Floor 6 — Poseidon's Favor: each shooter's first-roll craps-out doesn't count
  | 'CARGO_HOLD'      // Floor 7 — Cargo Hold: a fifth crew slot unlocks
  | 'THE_FREQUENCY'   // Floor 8 — The Frequency: come-out naturals award 3% of marker target as bonus
  | 'NONE';           // Floor 9 — No comp awarded; The Null Space is the end of the line

/**
 * Discriminated union of per-rule tunable parameters.
 * TypeScript narrows inside each hook file so Sarge's rollLimit can never be
 * accidentally accessed on The Executive's config. Add a new union member here
 * when a new boss rule type is introduced — no other shared types need changing.
 */
export type BossRuleParams =
  | { rule: 'EXTORTION_FEE';      taxPct: number; payoffCents: number }  // FB-032: the Cut clears the room at payoffCents
  | { rule: 'DOUBLE_TIME';        rollLimit: number }
  | { rule: 'DISABLE_CREW' }
  | { rule: 'CROSS_CALIBRATION' }
  | { rule: 'TRIBUTE';            escrowSeizurePct: number }
  | { rule: 'TIDAL_SURGE'; stageLabels: readonly [string, string, string, string]; stageEffects: readonly ['DEAD_CALM' | 'UNDERTOW' | 'HIGH_TIDE', 'DEAD_CALM' | 'UNDERTOW' | 'HIGH_TIDE', 'DEAD_CALM' | 'UNDERTOW' | 'HIGH_TIDE', 'DEAD_CALM' | 'UNDERTOW' | 'HIGH_TIDE']; undertowPct: number; waveShooters: number }
  | {
      rule:     'ORBITAL_DECAY';
      /** FB-038: share of the hype above 1.0× lost after every roll (not on a Seven-Out). */
      bleedPct: number;
    }
  | { rule: 'FIRST_CONTACT_PROTOCOL' }   // Floor 8 — retired; kept for historical safety
  | { rule: 'TRANSMISSION_DELAY'; blackoutRolls: number }   // Floor 8 — FB-039; logic inline in rolls.ts
  | { rule: 'CONVERGENCE' };             // Floor 9 — no params; bossPointHits = Seven-Outs (rooms built − 1), room order + counters on the run (FB-040)

/** Full descriptor for a boss fight. Only present on markers where isBoss is true. */
/**
 * Moments a boss can bark at (FB-032, FB-033). win/loss apply to any boss
 * (chance-based); the rest are boss EVENTS derived per rule in bossBarks.ts:
 *   The Foreman: progress50 / progress80 / payoff (his Cut vs the Payoff)
 *   Sarge:       pointSet / clockLow / lastRoll / beatClock / timeUp (Double Time clock)
 *   Mme. Le Prix: charmed (the heart moves) / charmFired (the heartbeat)
 */
export type BossBarkTrigger =
  | 'win' | 'loss'
  | 'progress50' | 'progress80' | 'payoff'
  | 'pointSet' | 'clockLow' | 'lastRoll' | 'beatClock' | 'timeUp'
  | 'charmed' | 'charmFired'
  | 'promoted' | 'finalWarning' | 'bonusPaid' | 'ratingUp' | 'ratingDown'
  | 'tributeSeized' | 'bigOffering' | 'escrowReleased'
  | 'waveHit' | 'undertowHit' | 'highTide'
  | 'orbitLost' | 'peakHype' | 'decaying'
  | 'signalLost' | 'contactRestored' | 'received'
  | 'roomBuilt';

/** FB-032: boss defeat cinematics (one component each in the web registry). */
export type BossDefeatCinematicId = 'DOCK_CLOSED' | 'DISHONORABLE_DISCHARGE' | 'SHE_TAKES_THE_CREW' | 'TERMINATED' | 'THE_ORDER_COLLECTS' | 'THE_WAVE' | 'LOSS_OF_SIGNAL' | 'TRANSLATED' | 'ARCHIVED';

/** FB-033: boss victory moments (one component each in the web registry). */
export type BossVictoryCinematicId = 'HONORABLY_DISCHARGED' | 'THE_ROSE' | 'NAMEPLATE_SWAP' | 'THE_EYE_CLOSES' | 'THE_CROWN_SINKS' | 'ESCAPE_VELOCITY' | 'MESSAGE_RECEIVED' | 'THE_PATTERN_BREAKS';

export interface BossConfig {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** NPC name shown in boss entry and victory screens. */
  name: string;
  /** Subtitle rendered beneath the name on the dread screen. */
  title: string;
  /**
   * Boss emblem shown on the boss-entry cinematic, entry modal and boss room
   * header (replaces the generic ★). One glyph that reads as the boss and
   * their rule; distinct from the comp icons in CompCard.tsx.
   */
  sigil: string;
  /**
   * FB-032: in-fight barks, by trigger (see bossBarks.ts). Optional — a boss
   * with no barks stays silent. Lines are short; one shows at a time.
   */
  barks?: Partial<Record<BossBarkTrigger, readonly string[]>>;
  /**
   * FB-040 (The Architect): what he says as he builds each room, by the room's
   * rule (falls back to barks.roomBuilt). Inside a room, its boss's own moments
   * bark from that boss's `barks` — as an echo.
   */
  roomBarks?: Partial<Record<BossRuleType, readonly string[]>>;
  /**
   * FB-032: signature "you lost" moment played over the table before the
   * game-over screen when this boss ends the run. Optional. `id` picks the
   * component (web DEFEAT_CINEMATICS registry); `line` is the boss's parting shot.
   */
  defeatCinematic?: { id: BossDefeatCinematicId; line: string };
  /**
   * FB-033: signature "you beat me" moment played over the table before the
   * boss-victory celebration (the celebration is held for it). Optional. `id`
   * picks the component (web VICTORY_CINEMATICS registry). The Foreman has none:
   * his PAID IN FULL lives in his cash register.
   */
  victoryCinematic?: { id: BossVictoryCinematicId; line: string };

  // ── Vibe copy ─────────────────────────────────────────────────────────────
  /** 1–3 word bark displayed on the dread screen before the rule briefing. */
  dreadTagline: string;
  /** 2–3 lines of boss dialogue shown on the entry screen. */
  entryLines: [string, string] | [string, string, string];
  /** One sentence explaining the boss mechanic shown on the entry screen. */
  ruleBlurb: string;
  /** What the boss says when defeated, shown on the victory screen. */
  victoryQuote: string;
  /** Header shown on the boss victory screen ("ENEMY NEUTRALIZED" etc.). */
  defeatAnnouncement: string;

  // ── Mechanic ──────────────────────────────────────────────────────────────
  /** The rule mechanic in effect for the duration of this fight. */
  rule: BossRuleType;
  /** Short persistent text shown in the BossRoomHeader during the fight. */
  ruleHeaderText: string;
  /** Strongly-typed rule params — narrows via BossRuleParams discriminated union. */
  ruleParams: BossRuleParams;

  // ── Comp ──────────────────────────────────────────────────────────────────
  /** The comp perk awarded on defeat. */
  compReward: CompRewardType;
  /** Numeric ID written to users.comp_perk_ids after defeating this boss. */
  compPerkId: number;
  /** Display name for the comp reward ("MEMBER'S JACKET"). */
  compName: string;
  /** One-sentence description of what the comp does. */
  compDescription: string;
  /** Short label used on the CompCardFan card. */
  compFanLabel: string;

  // ── Legacy (migration) ────────────────────────────────────────────────────
  /**
   * Flavor text shown in the boss entry modal.
   * @deprecated Superseded by entryLines + ruleBlurb. Retained while
   *   BossEntryModal still reads boss.flavorText. Removed in Part 7.
   */
  flavorText: string;
}

/** Complete configuration for a single gauntlet marker. */
export interface MarkerConfig {
  /** Bankroll threshold the player must reach to clear this marker, in cents. */
  targetCents: number;
  /** Venue name displayed in the progress UI. */
  venue: string;
  /** Which floor of the gauntlet this marker belongs to (1-based). */
  floor: number;
  /** True when this marker is a boss fight (every 3rd marker in the gauntlet). */
  isBoss: boolean;
  /** Full boss descriptor. Present only when isBoss is true. */
  boss?: BossConfig;
}

// ---------------------------------------------------------------------------
// Comp perk IDs — stable numeric IDs written to users.comp_perk_ids on boss
// defeat. Defined here so server (recruit.ts) and client (victory modal) share
// the same values without a separate lookup table.
// ---------------------------------------------------------------------------

export const COMP_PERK_IDS = {
  THE_VIG:          4,  // Floor 1 boss reward — crew cash abilities +20%
  MEMBER_JACKET:    1,  // Floor 2 boss reward — +1 Shooter at every marker
  SEA_LEGS:         2,  // Floor 3 boss reward — keep half the Hype above 1.0× on Seven Out
  // ID 3 (GOLDEN_TOUCH) retired in FB-025 — slot unlock comps use perkId 0
  THE_COVENANT:     5,  // Floor 5 boss reward — once per marker, the first Seven Out keeps the shooter (FB-036)
  POSEIDONS_FAVOR:  6,  // Floor 6 boss reward — each shooter's first-roll craps-out doesn't count
  // ID 7 (ZERO_POINT) retired in FB-025 — slot unlock comps use perkId 0
  THE_FREQUENCY:    8,  // Floor 8 boss reward — 3% marker target bonus on come-out naturals
} as const;

// ---------------------------------------------------------------------------
// The Gauntlet — 27 markers across 9 floors (3 markers per floor)
//
// Targets:
//   Floor 1 — The Loading Dock: $50 / $100 / $200
//   Floor 2 — VFW Hall:         $300 / $500 / $1,000
//   Floor 3 — Riverboat:        $1,500 / $2,000 / $4,000
//   Floor 4 — The Suite:        $5,000 / $7,500 / $15,000
//   Floor 5 — The Lodge:        $30,000 / $50,000 / $100,000
//   Floor 6 — Atlantis:         $150,000 / $250,000 / $500,000
//   Floor 7 — The Station:      $1,000,000 / $1,500,000 / $3,000,000
//   Floor 8 — The Signal:       $5,000,000 / $7,500,000 / $15,000,000
//   Floor 9 — The Null Space:   $20,000,000 / $30,000,000 / $60,000,000
//
// Boss at every 3rd marker (0-based indices 2, 5, 8, 11, 14, 17, 20, 23, 26).
// ---------------------------------------------------------------------------

export const GAUNTLET: readonly MarkerConfig[] = [
  // ── Floor 1: The Loading Dock ─────────────────────────────────────────────

  {
    targetCents: 5_000,  // $50
    venue:       'The Loading Dock',
    floor:       1,
    isBoss:      false,
  },
  {
    targetCents: 10_000,  // $100
    venue:       'The Loading Dock',
    floor:       1,
    isBoss:      false,
  },
  {
    targetCents: 20_000,  // $200 — BOSS: The Foreman
    venue:       'The Loading Dock — Freight Elevator',
    floor:       1,
    isBoss:      true,
    boss: {
      // Identity
      name:  'The Foreman',
      title: 'Loading Dock Gatekeeper',
      sigil: '🔨',
      // Vibe
      dreadTagline:        'PAY UP.',
      entryLines: [
        "You're blocking my dock.",
        "Twenty percent off the top of every win. That's my cut.",
        "Cut hits twenty-five bucks, I don't see nothin'. Capisce?",
      ],
      // FB-032: copy states the $25 Payoff — keep it in step with payoffCents below.
      ruleBlurb:          "The Foreman skims 20% off every winning payout — his Cut. When his Cut adds up to the $25 Payoff, he looks the other way and you're through. Losses don't count against you.",
      victoryQuote:       "Pleasure doing business. I didn't see nothin'.",
      defeatAnnouncement: 'PAID IN FULL',
      // Mechanic
      rule:           'EXTORTION_FEE',
      ruleHeaderText: 'PAY HIM OFF — HIS 20% CUT OF EVERY WIN ADDS UP TO THE $25 PAYOFF',
      ruleParams:     { rule: 'EXTORTION_FEE', taxPct: 0.20, payoffCents: 2_500 },
      // Comp
      compReward:      'THE_VIG',
      compPerkId:      COMP_PERK_IDS.THE_VIG,
      compName:        'THE VIG',
      compDescription: "You took over the corner. Crew cash abilities pay out 20% more.",
      compFanLabel:    'THE VIG',
      // Legacy
      flavorText: "Twenty percent off the top. Pay me off and I don't see nothin'.",
      // FB-032 barks (pilot)
      barks: {
        win: [
          "Keep 'em coming.",
          "That's my cut.",
          "Pleasure doing business.",
          "Good kid. Slide it over.",
          "Every little bit, pal.",
        ],
        loss: [
          "Tough break. My cut's still my cut.",
          "Dock's still open. Keep shooting.",
          "Don't cry on my forklift.",
        ],
        progress50: [
          "Now we're talkin'.",
          "Halfway to friends.",
        ],
        progress80: [
          "Almost square, pal.",
          "One more and I don't see nothin'.",
        ],
        payoff: [
          "I didn't see nothin'. Get outta here.",
          "We're square. Beat it.",
        ],
      },
      // FB-032 defeat cinematic (pilot): the loading-dock door slams shut.
      defeatCinematic: { id: 'DOCK_CLOSED', line: "Come back when you got my money." },
    },
  },

  // ── Floor 2: VFW Hall ─────────────────────────────────────────────────────

  {
    targetCents: 30_000,  // $300
    venue:       'VFW Hall',
    floor:       2,
    isBoss:      false,
  },
  {
    targetCents: 50_000,  // $500
    venue:       'VFW Hall',
    floor:       2,
    isBoss:      false,
  },
  {
    targetCents: 100_000,  // $1,000 — BOSS: Sarge
    venue:       'VFW Hall — High Limit Room',
    floor:       2,
    isBoss:      true,
    boss: {
      // Identity
      name:  'Sarge',
      title: 'The Pit Boss',
      sigil: '⏱️',
      // Vibe
      dreadTagline:        'DOUBLE TIME.',
      entryLines: [
        "You want to shoot in MY hall? You shoot on MY clock.",
        "Six rolls to make your point. Not seven. Six.",
        "Dawdle and you're out, soldier.",
      ],
      ruleBlurb:          "Once your point is set, you have 6 rolls to hit it. Run out the clock and Sarge calls it — the 6th blank roll counts as a Seven-Out.",
      victoryQuote:       "…not bad, soldier. Dismissed.",
      defeatAnnouncement: 'ENEMY NEUTRALIZED',
      // Mechanic
      rule:           'DOUBLE_TIME',
      ruleHeaderText: 'HIT YOUR POINT IN 6 ROLLS — OR IT\'S A SEVEN-OUT',
      ruleParams:     { rule: 'DOUBLE_TIME', rollLimit: 6 },
      // Comp
      compReward:      'EXTRA_SHOOTER',
      compPerkId:      COMP_PERK_IDS.MEMBER_JACKET,
      compName:        "MEMBER'S JACKET",
      compDescription: "+1 SHOOTER at every marker for the rest of the run — they know you earned your seat.",
      compFanLabel:    'JACKET',
      // Legacy
      flavorText: "You shoot on MY clock, soldier. Six rolls.",
      // FB-033 victory moment: the discharge certificate, honorably stamped.
      victoryCinematic: { id: 'HONORABLY_DISCHARGED', line: "…not bad, soldier. Dismissed." },
      // FB-033 defeat moment: the same discharge paper, dishonorably stamped.
      defeatCinematic: { id: 'DISHONORABLE_DISCHARGE', line: "Drop and give me twenty… thousand." },
      // FB-033 barks — shouting caps for orders, deadpan lowercase for praise.
      barks: {
        pointSet: [
          "CLOCK'S RUNNING, SOLDIER!",
          "SIX ROLLS. MOVE IT!",
          "THE CLOCK IS NOT YOUR FRIEND.",
        ],
        clockLow: [
          "TWO MORE! I SAID MOVE!",
          "YOU CALL THAT HUSTLE?",
        ],
        lastRoll: [
          "LAST CHANCE, MAGGOT!",
          "THIS IS IT, PRIVATE!",
        ],
        beatClock: [
          "…adequate.",
          "Don't let it go to your head.",
        ],
        timeUp: [
          "TIME! DROP AND GIVE ME TWENTY!",
          "TOO SLOW, RECRUIT!",
        ],
        win: [
          "Don't get cocky.",
          "Lucky shot, soldier.",
        ],
        loss: [
          "PATHETIC.",
          "MY GRANDMOTHER ROLLS BETTER.",
        ],
      },
    },
  },

  // ── Floor 3: Riverboat ────────────────────────────────────────────────────

  {
    targetCents: 150_000,  // $1,500
    venue:       'The Riverboat',
    floor:       3,
    isBoss:      false,
  },
  {
    targetCents: 200_000,  // $2,000
    venue:       'The Riverboat',
    floor:       3,
    isBoss:      false,
  },
  {
    targetCents: 400_000,  // $4,000 — BOSS: Mme. Le Prix
    venue:       'The Riverboat — Salon Privé',
    floor:       3,
    isBoss:      true,
    boss: {
      // Identity
      name:  'Mme. Le Prix',
      title: 'Madame of the Salon Privé',
      sigil: '💋',
      // Vibe
      dreadTagline:        'HOW CHARMING.',
      entryLines: [
        "Bienvenue. You may sit.",
        "Your crew is welcome here — most of them.",
        "Every come-out, one of yours will be... occupied with other things.",
      ],
      ruleBlurb:          "Before each come-out roll, Mme. Le Prix enchants one of your crew. That crew member is mesmerized for the duration of the come-out — and through any point phase that follows. Upon resolution, her eye falls on someone new.",
      victoryQuote:       "…improbable. You may keep your winnings.",
      victoryCinematic:   { id: 'THE_ROSE', line: "…improbable. You may keep your winnings." },
      defeatCinematic:    { id: 'SHE_TAKES_THE_CREW', line: "Your crew stays with me… forever." },
      defeatAnnouncement: 'TABLE CLOSED',
      // Mechanic
      rule:           'DISABLE_CREW',
      ruleHeaderText: 'ONE CREW ENCHANTED EACH COME-OUT — SITS OUT THE CASCADE',
      ruleParams:     { rule: 'DISABLE_CREW' },
      // Comp
      compReward:      'HYPE_RESET_HALF',
      compPerkId:      COMP_PERK_IDS.SEA_LEGS,
      compName:        'THE KEEPSAKE',
      compDescription: "Something of hers stays with you. On Seven Out, you keep half your Hype above 1.0× instead of resetting — 2.0× drops to 1.5×, not 1.0×.",
      compFanLabel:    'KEEPSAKE',
      // Legacy
      flavorText: "On my table, the crew works backwards. Adapt.",
      // FB-034 barks — soft, purring lowercase ("she does not raise her voice").
      // Crew references stay gender-neutral: "this one", "they".
      barks: {
        charmed: [
          "ah… this one, I think.",
          "come, chéri.",
          "you won't mind if I borrow this one?",
        ],
        charmFired: [
          "non, non. they are busy.",
          "tsk. they work for me tonight.",
        ],
        win: [
          "bravo, petit.",
          "lucky… for now.",
        ],
        loss: [
          "quel dommage.",
          "tragique.",
        ],
      },
    },
  },

  // ── Floor 4: The Suite ────────────────────────────────────────────────────

  {
    targetCents: 500_000,  // $5,000
    venue:       'The Suite',
    floor:       4,
    isBoss:      false,
  },
  {
    targetCents: 750_000,  // $7,500
    venue:       'The Suite',
    floor:       4,
    isBoss:      false,
  },
  {
    targetCents: 1_500_000,  // $15,000 — BOSS: The Executive
    venue:       'The Suite — Corner Office',
    floor:       4,
    isBoss:      true,
    boss: {
      // Identity
      name:  'The Executive',
      title: 'CFO, High Limit Division',
      sigil: '💼',
      // Vibe
      dreadTagline:        'YOUR REVIEW IS PENDING.',
      entryLines: [
        "Sit down. We've been expecting you.",
        "We've been tracking your performance metrics.",
        "Every roll moves the needle — one way or another.",
      ],
      ruleBlurb:          "The Executive tracks your Performance Review rating throughout the fight. Every roll outcome shifts it up or down. Reach Action Required and one more bad roll ends the run.",
      victoryQuote:       "…restructuring was inevitable. Well played.",
      victoryCinematic:   { id: 'NAMEPLATE_SWAP', line: "…restructuring was inevitable. Well played." },
      defeatCinematic:    { id: 'TERMINATED', line: "Security will see you out." },
      defeatAnnouncement: 'EXECUTIVE OVERRIDE',
      // FB-035 barks — clipped corporate-speak, polite and cold.
      barks: {
        promoted:     ["Now that's executive presence.", "Let's fast-track this one."],
        finalWarning: ["Consider this your formal notice.", "One more and we part ways."],
        bonusPaid:    ["Don't spend it all in one quarter.", "Bonus approved. Don't get used to it."],
        ratingUp:     ["You're really moving the needle.", "Excellent value-add.", "I'm seeing real alignment."],
        ratingDown:   ["We need to discuss your engagement metrics.", "I'm concerned about your trajectory.", "I'd like to loop in HR on this one."],
      },
      // Mechanic
      rule:           'CROSS_CALIBRATION',
      ruleHeaderText: 'PERFORMANCE REVIEW — EVERY ROLL SHIFTS YOUR RATING',
      ruleParams:     { rule: 'CROSS_CALIBRATION' },
      // Comp
      compReward:      'BOARD_SEAT',
      compPerkId:      0,
      compName:        'BOARD SEAT',
      compDescription: 'A fourth crew slot unlocks. Expand your operation.',
      compFanLabel:    'BOARD',
      // Legacy
      flavorText: "We've been tracking your performance metrics. Every roll moves the needle.",
    },
  },

  // ── Floor 5: The Lodge ────────────────────────────────────────────────────

  {
    targetCents: 3_000_000,  // $30,000
    venue:       'The Lodge',
    floor:       5,
    isBoss:      false,
  },
  {
    targetCents: 5_000_000,  // $50,000
    venue:       'The Lodge',
    floor:       5,
    isBoss:      false,
  },
  {
    targetCents: 10_000_000,  // $100,000 — BOSS: The Hierophant
    venue:       'The Lodge — The Inner Sanctum',
    floor:       5,
    isBoss:      true,
    boss: {
      // Identity
      name:  'The Hierophant',
      title: 'Keeper of the Rites',
      sigil: '👁️',
      // Vibe
      dreadTagline:        'THE ORDER COLLECTS.',
      entryLines: [
        "You were vouched for. That person is no longer welcome.",
        "Three centuries of tradition: what your crew earns is offered to the order until you win.",
        "Seven out, and the order keeps three quarters. Every time.",
      ],
      ruleBlurb:          "Your crew's cash bonuses are offered to the order: they pile up in the offering bowl until you win a roll (a Natural or hitting your point), then come back to you multiplied by your Hype. Seven-out first and The Hierophant keeps 75% as tribute.",
      victoryQuote:       "…the rites acknowledge your offering. Leave before the observers decide otherwise.",
      victoryCinematic:   { id: 'THE_EYE_CLOSES', line: "…the rites acknowledge your offering. Leave before the observers decide otherwise." },
      defeatCinematic:    { id: 'THE_ORDER_COLLECTS', line: "The order always collects." },
      defeatAnnouncement: 'RITES CONCLUDED',
      // FB-036 barks — solemn, liturgical; he speaks for the order.
      barks: {
        tributeSeized:  ["The order receives.", "Every offering is remembered."],
        bigOffering:    ["A generous offering.", "The order is pleased."],
        escrowReleased: ["The rites permit it.", "Go. It is yours… for now."],
        win:            ["The observers take note.", "So it is witnessed."],
        loss:           ["As it was written.", "The candles do not lie."],
      },
      // Mechanic
      rule:           'TRIBUTE',
      ruleHeaderText: 'CREW CASH HELD UNTIL YOU WIN — 75% SEIZED ON SEVEN-OUT',
      ruleParams:     { rule: 'TRIBUTE', escrowSeizurePct: 0.75 },
      // Comp
      compReward:      'THE_COVENANT',
      compPerkId:      COMP_PERK_IDS.THE_COVENANT,
      compName:        'THE COVENANT',
      compDescription: "The order protects its own. Once per marker, your first Seven Out doesn't cost a shooter — your bets are still lost and your Hype still resets.",
      compFanLabel:    'COVENANT',
      // Legacy
      flavorText: "Three centuries of tradition. You'll respect it, or you'll fund it.",
    },
  },

  // ── Floor 6: Atlantis ─────────────────────────────────────────────────────

  {
    targetCents: 15_000_000,  // $150,000
    venue:       'Atlantis',
    floor:       6,
    isBoss:      false,
  },
  {
    targetCents: 25_000_000,  // $250,000
    venue:       'Atlantis',
    floor:       6,
    isBoss:      false,
  },
  {
    targetCents: 50_000_000,  // $500,000 — BOSS: The Sovereign
    venue:       'Atlantis — The Throne Room',
    floor:       6,
    isBoss:      true,
    boss: {
      // Identity
      name:  'The Sovereign',
      title: 'Last King of Atlantis',
      sigil: '👑',
      // Vibe
      dreadTagline:        'THE TIDE TURNS.',
      entryLines: [
        "Three thousand years. Every empire above you has collapsed from here.",
        "My table runs on a tide. Calm, undertow, high water — it turns with every come-out.",
        "You can see it coming. That was never the point.",
      ],
      ruleBlurb:          "The tide turns LOW → EBB → HIGH → FLOW each time a come-out resolves, and every stage is its own challenge. DEAD CALM (low tide): no odds bets. THE UNDERTOW (ebb and flow): a Seven-Out drags 35% of your bankroll out to sea. HIGH TIDE: a Seven-Out drowns two shooters. You can see it coming.",
      victoryQuote:       "…the tide will return. It always does.",
      victoryCinematic:   { id: 'THE_CROWN_SINKS', line: "…the tide will return. It always does." },
      defeatCinematic:    { id: 'THE_WAVE', line: "Your run will not outlast this tide." },
      defeatAnnouncement: 'THE TIDE RECEDES',
      // FB-037 barks — regal, ancient, slow; he speaks like the sea.
      barks: {
        waveHit:     ["The deep keeps what it takes.", "Two more for the sea."],
        undertowHit: ["The tide takes its share.", "Everything returns to the sea."],
        highTide:    ["The sea rises for its king.", "Hear it coming?"],
        win:         ["Even kings must wait for the tide.", "A ripple. Nothing more."],
        loss:        ["Another empire, gone under.", "The current is patient."],
      },
      // Mechanic
      rule:           'TIDAL_SURGE',
      ruleHeaderText: 'DEAD CALM: NO ODDS · UNDERTOW: 7-OUT TAKES 35% · HIGH TIDE: 7-OUT DROWNS 2',
      ruleParams:     {
        rule:         'TIDAL_SURGE',
        stageLabels:  ['LOW TIDE', 'EBB', 'HIGH TIDE', 'FLOW'] as const,
        // FB-037 (tuned with scripts/sim/sovereign-tide-sim.mjs)
        stageEffects: ['DEAD_CALM', 'UNDERTOW', 'HIGH_TIDE', 'UNDERTOW'] as const,
        undertowPct:  0.35,
        waveShooters: 2,
      },
      // Comp
      compReward:      'POSEIDONS_FAVOR',
      compPerkId:      COMP_PERK_IDS.POSEIDONS_FAVOR,
      compName:        "POSEIDON'S FAVOR",
      compDescription: "The first roll of each shooter can never craps-out — a 2, 3 or 12 doesn't count and your Pass Line stays up.",
      compFanLabel:    'POSEIDON',
      // Legacy
      flavorText: "My kingdom has stood for three thousand years. Your run will not outlast this tide.",
    },
  },

  // ── Floor 7: The Station ─────────────────────────────────────────────────

  {
    targetCents: 100_000_000,  // $1,000,000
    venue:       'The Station',
    floor:       7,
    isBoss:      false,
  },
  {
    targetCents: 150_000_000,  // $1,500,000
    venue:       'The Station',
    floor:       7,
    isBoss:      false,
  },
  {
    targetCents: 300_000_000,  // $3,000,000 — BOSS: The Commander
    venue:       'The Station — The Command Module',
    floor:       7,
    isBoss:      true,
    boss: {
      // Identity
      name:  'The Commander',
      title: 'Station Chief, Table Authority',
      sigil: '🎖️',
      // Vibe
      dreadTagline:        'IN SPACE, NO ONE CAN HEAR YOU SCREAM.',
      entryLines: [
        "Eleven months up here. I don't miss the ground.",
        "Your hype is a resource. Up here, resources decay.",
        "Every roll, your orbit slips. Keep burning, or fall.",
      ],
      ruleBlurb:          "Orbital decay: after every roll, your Hype above 1.0× loses 20% of its height — feed it or watch it fall. A Seven-Out resets Hype to 1.0×, and The Keepsake doesn't work up here. In space, no one can hear the crowd.",
      victoryQuote:       "…orbital mechanics didn't account for you. Gravity's compliments.",
      victoryCinematic:   { id: 'ESCAPE_VELOCITY', line: "…orbital mechanics didn't account for you. Gravity's compliments." },
      defeatCinematic:    { id: 'LOSS_OF_SIGNAL', line: "In space, no one can hear you scream." },
      defeatAnnouncement: 'ORBITAL AUTHORITY LOST',
      // FB-038 barks — clipped mission-control speak. In space, no one can hear you scream.
      barks: {
        orbitLost: ["Mission control, we have a problem.", "In space, no one can hear you scream."],
        peakHype:  ["Cheer all you like. There's no air up here.", "Enjoy the view. It won't last."],
        decaying:  ["Orbit decaying.", "You're losing altitude."],
        win:       ["Acceptable trajectory.", "Burn logged."],
        loss:      ["Gravity always wins.", "Correcting course. Yours, not mine."],
      },
      // Mechanic
      rule:           'ORBITAL_DECAY',
      ruleHeaderText: 'ORBITAL DECAY — HYPE ABOVE 1.0× LOSES 20% EVERY ROLL · 7-OUT RESETS',
      ruleParams:     {
        rule:     'ORBITAL_DECAY',
        // FB-038 (tuned with scripts/sim/commander-decay-sim.mjs)
        bleedPct: 0.20,
      },
      // Comp
      compReward:      'CARGO_HOLD',
      compPerkId:      0,
      compName:        'CARGO HOLD',
      compDescription: 'A fifth crew slot unlocks. Full crew capacity reached.',
      compFanLabel:    'CARGO',
      // Legacy
      flavorText: "Gravity is a courtesy I extend to paying customers. So is generosity.",
    },
  },

  // ── Floor 8: The Signal ─────────────────────────────────────────────────

  {
    targetCents: 500_000_000,   // $5,000,000
    venue:       'The Signal',
    floor:       8,
    isBoss:      false,
  },
  {
    targetCents: 750_000_000,   // $7,500,000
    venue:       'The Signal',
    floor:       8,
    isBoss:      false,
  },
  {
    targetCents: 1_500_000_000,  // $15,000,000 — BOSS: The Emissary
    venue:       'The Signal — The Receiving Chamber',
    floor:       8,
    isBoss:      true,
    boss: {
      // Identity
      name:  'The Emissary',
      title: 'First Point of Contact',
      sigil: '🛸',
      // Vibe
      dreadTagline: 'WE SHOULD NOT HAVE ANSWERED.',
      entryLines: [
        "The table is here. The felt, the chips, the dice. All correct.",
        "Your crew's signals arrive one step behind. Everything echoes.",
        "Seven out and the signal is lost. Your crew will not hear you for a while.",
      ],
      ruleBlurb:          "Signal lag: everything your crew does — cash bonuses, Hype boosts, multipliers — arrives one roll late. Seven out and the signal is lost: whatever was in transit vanishes, and your whole crew goes dark for six rolls.",
      victoryQuote:       "[The entity pauses for 0.3 seconds. This is the equivalent of applause.]",
      victoryCinematic:   { id: 'MESSAGE_RECEIVED', line: "[The entity pauses for 0.3 seconds. This is the equivalent of applause.]" },
      defeatAnnouncement: 'SIGNAL LOST',
      defeatCinematic:    { id: 'TRANSLATED', line: "[Translation complete. You will be studied.]" },
      // FB-039 barks — translated alien text, in brackets. Cold, literal.
      barks: {
        signalLost:      ["[Signal lost. Your crew cannot hear you.]", "[Contact terminated. Recalibrating.]"],
        contactRestored: ["[Contact restored. This changes nothing.]", "[Your crew has returned. Briefly.]"],
        received:        ["[Message received. Delayed. As intended.]", "[Delay is a human superstition.]"],
        win:             ["[Outcome noted.]", "[Anomalous. Logging.]"],
        loss:            ["[Predicted.]", "[As modeled.]"],
      },
      // Mechanic
      rule:           'TRANSMISSION_DELAY',
      ruleHeaderText: 'CREW EFFECTS LAND ONE ROLL LATE · 7-OUT: SIGNAL LOST, CREW DARK FOR 6 ROLLS',
      ruleParams:     { rule: 'TRANSMISSION_DELAY', blackoutRolls: 6 },   // FB-039 (tuned with scripts/sim/emissary-delay-sim.mjs)
      // Comp
      compReward:      'THE_FREQUENCY',
      compPerkId:      COMP_PERK_IDS.THE_FREQUENCY,
      compName:        'THE FREQUENCY',
      compDescription: 'Come-out natural 7s and 11s award a flat bonus equal to 3% of the current marker target for the rest of the run.',
      compFanLabel:    'FREQ.',
      // Legacy
      flavorText: "Your crew's signals arrive one step behind. Seven-out and the echo dies with them — and so does contact.",
    },
  },

  // ── Floor 9: The Null Space ───────────────────────────────────────────────

  {
    targetCents: 2_000_000_000,  // $20,000,000
    venue:       'The Null Space',
    floor:       9,
    isBoss:      false,
  },
  {
    targetCents: 3_000_000_000,  // $30,000,000
    venue:       'The Null Space',
    floor:       9,
    isBoss:      false,
  },
  {
    targetCents: 6_000_000_000,  // $60,000,000 — BOSS: The Architect
    venue:       'The Null Space — The Zero Chamber',
    floor:       9,
    isBoss:      true,
    boss: {
      // Identity
      name:  'The Architect',
      title: 'Designer of the Null Space',
      sigil: '📐',
      // Vibe
      dreadTagline: 'EVERY ROOM YOU SURVIVED. AT ONCE.',
      entryLines: [
        "Every table you beat was a draft. This is the blueprint.",
        "Each time you seven out, I rebuild another room — and it stays.",
        "By the end, you'll be fighting all of them at once.",
      ],
      // FB-040 barks — cold, the designer. He narrates each rebuild; inside a
      // room its own boss's moments echo in that boss's voice.
      barks: {
        roomBuilt: ["Another room. They're all still here."],
        win:       ["Noted.", "A deviation. Minor."],
        loss:      ["As drafted.", "The blueprint holds."],
      },
      roomBarks: {
        EXTORTION_FEE:      ["The loading dock. You remember the smell.", "Back to the dock. He still wants his cut."],
        DOUBLE_TIME:        ["Sarge's clock. Still ticking.", "The hall. Double time."],
        DISABLE_CREW:       ["Her parlour. She kept your seat warm.", "The riverboat. She remembers your crew."],
        CROSS_CALIBRATION:  ["The corner office. Your review is overdue.", "The Suite. He's been expecting your numbers."],
        TRIBUTE:            ["The temple. The offering plate is out.", "The Lodge. Kneel, or pay."],
        TIDAL_SURGE:        ["The tide is coming in.", "Atlantis. Hold your breath."],
        ORBITAL_DECAY:      ["Orbit. Hold on.", "The station. Mind the gravity."],
        TRANSMISSION_DELAY: ["The signal. Can you hear me?", "The receiving chamber. Everything echoes."],
      },
      ruleBlurb: "Convergence: the fight opens in a room rebuilt from one of the bosses you've beaten, under that boss's rule. Every seven-out rebuilds another — and they stack: every rule stays in force. The order is random. The Executive's review can still end your run.",
      victoryQuote: "…the pattern was incomplete after all. Interesting.",
      // FB-040: the final win — every room flashes past in reverse, the grid tears, it all folds to white.
      victoryCinematic: { id: 'THE_PATTERN_BREAKS', line: "…the pattern was incomplete after all. Interesting." },
      defeatAnnouncement: 'ARCHIVED',
      // FB-040: the loss — your table is drawn up, stamped, rolled and filed.
      defeatCinematic:    { id: 'ARCHIVED', line: "Filed. I'll build the next one from you." },
      // Mechanic
      rule:           'CONVERGENCE',
      ruleHeaderText: "CONVERGENCE — EVERY 7-OUT ADDS ANOTHER BOSS'S RULE · THEY STACK",
      ruleParams:     { rule: 'CONVERGENCE' },
      // No comp — The Null Space is the end of the line
      compReward:     'NONE',
      compPerkId:      0,
      compName:        '',
      compDescription: '',
      compFanLabel:    '',
      // Legacy
      flavorText: "Every room you survived, rebuilt from your own pattern — and this time they don't take turns.",
    },
  },
];

/**
 * Flat array of marker targets in cents, derived from GAUNTLET.
 * Maintained for backwards-compatibility — new code should prefer
 * GAUNTLET[i].targetCents.
 */
export const MARKER_TARGETS: readonly number[] = GAUNTLET.map((m) => m.targetCents);

// ---------------------------------------------------------------------------
// Boss detection & min-bet helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when the given 0-based marker index is a boss fight.
 * Boss markers are indices 2, 5, 8 (every 3rd marker, 1-based counting).
 */
export function isBossMarker(markerIndex: number): boolean {
  return GAUNTLET[markerIndex]?.isBoss === true;
}

/**
 * Returns the initial `bossPointHits` value when a run enters the given marker.
 * Single source of truth for every marker-entry write (marker clear, auto-collect,
 * pub exit) so boss fights always start in the same state.
 *
 * CROSS_CALIBRATION (The Executive) starts at rating 2 (Strong). Every other
 * marker starts at 0. DISABLE_CREW's entry charm slot depends on the final crew
 * and is chosen in recruit.ts, which overrides this value.
 */
/**
 * Crew slots active once the boss at `clearedMarkerIndex` is beaten: Board Seat
 * (The Executive) → 4, Cargo Hold (The Commander) → 5; otherwise unchanged.
 * Used by the pub that follows the fight so the new slot can be filled there.
 */
export function getSlotsAfterBossComp(clearedMarkerIndex: number, unlockedSlots: number): 3 | 4 | 5 {
  const reward = GAUNTLET[clearedMarkerIndex]?.boss?.compReward;
  const granted = reward === 'BOARD_SEAT' ? 4 : reward === 'CARGO_HOLD' ? 5 : 3;
  return Math.min(5, Math.max(3, unlockedSlots, granted)) as 3 | 4 | 5;
}

export function getBossEntryCounter(markerIndex: number): number {
  if (!isBossMarker(markerIndex)) return 0;
  return GAUNTLET[markerIndex]?.boss?.rule === 'CROSS_CALIBRATION' ? 2 : 0;
}

/**
 * FB-032: the Payoff (cents) for a marker cleared by paying the boss off
 * instead of reaching a bankroll target, or null for a normal marker.
 * Currently only The Foreman: his Cut (the 20% skim) clears the room once it
 * totals payoffCents. Bankroll never clears a payoff marker.
 */
export function getBossPayoffCents(markerIndex: number): number | null {
  if (!isBossMarker(markerIndex)) return null;
  const params = GAUNTLET[markerIndex]?.boss?.ruleParams;
  return params?.rule === 'EXTORTION_FEE' ? params.payoffCents : null;
}

/**
 * DISABLE_CREW (Mme. Le Prix) entry charm: picks a random filled slot among the
 * active slots (0..unlockedSlots-1). Returns null when no active slot is filled.
 * Used by recruit.ts (pub exit) and Developer Mode scenario creation so both
 * start the fight identically.
 */
export function pickEntryCharmSlot(
  crewSlots:     readonly ({ crewId: number } | null)[],
  unlockedSlots: number,
  randomBelow:   (n: number) => number,
): number | null {
  const filledSlots = crewSlots
    .slice(0, unlockedSlots)
    .map((slot, i) => (slot !== null ? i : -1))
    .filter((i) => i >= 0);
  if (filledSlots.length === 0) return null;
  return filledSlots[randomBelow(filledSlots.length)] ?? null;
}

/**
 * Returns the boss-raised minimum Pass Line bet (in cents) for the current boss
 * encounter, or null when no boss minimum applies.
 *
 * No boss raises the minimum today — The Sovereign's tide used to (2×/3× at
 * EBB/HIGH/FLOW) until FB-037 gave each tide stage its own challenge. Kept as
 * the single place a boss minimum would go (getMaxBet, the client bet checks).
 */
export function getBossMinBet(_markerIndex: number, _bossPointHits: number): number | null {
  return null;
}

/**
 * Maximum single bet (pass line or individual hardway) for a given marker.
 *
 * Normally set at 10 % of the current marker target. When a boss raises the
 * minimum (The Sovereign's tide), the table max is dynamically floored at
 * 5 × the current boss minimum so the player always has room to place the
 * minimum pass-line bet and back it with full 5× odds on a 6 or 8.
 *
 * @param currentMarkerIndex  The marker the player is currently chasing (0-based).
 * @param bossPointHits       The boss counter (required for boss markers to compute
 *                            the dynamic floor; pass 0 when unknown — safe default,
 *                            never over-restricts).
 * @param ceilingPct          Fraction of the marker target to use as the normal max.
 *                            Defaults to 0.10 (10%). Pass 0.15 when The Old Pro is active.
 * @returns Maximum bet in cents.
 */
export function getMaxBet(currentMarkerIndex: number, bossPointHits = 0, ceilingPct = 0.10): number {
  const target    = GAUNTLET[currentMarkerIndex]?.targetCents ?? GAUNTLET[GAUNTLET.length - 1]!.targetCents;
  const normalMax = Math.floor(target * ceilingPct);

  // Boss floor: table max must be at least 5× the current minimum demand so
  // the player can place the minimum and cover full 5× odds on 6/8.
  const bossMin = getBossMinBet(currentMarkerIndex, bossPointHits);
  if (bossMin !== null) {
    return Math.max(normalMax, bossMin * 5);
  }

  return normalMax;
}

/**
 * Minimum Pass Line bet for a given marker, in cents.
 *
 * Set at approximately 1/6th of the table maximum, rounded to the nearest $5
 * (500 cents), with a hard floor of $5.  Scales with marker difficulty so the
 * stakes never feel trivially low late-game.
 *
 * Examples (marker → max → min):
 *   Marker 0  ($50 target)      → max $5      → min $5
 *   Marker 3  ($300 target)     → max $30     → min $5
 *   Marker 6  ($1,500 target)   → max $150    → min $25
 *   Marker 9  ($5k target)      → max $500    → min $85
 *   Marker 12 ($30k target)     → max $3,000  → min $500
 *   Marker 17 ($500k target)    → max $50,000 → min $8,335
 *
 * This minimum governs two things:
 *   1. Server rejects a come-out roll whose Pass Line bet is below this value.
 *   2. After any bet-clearing roll (NATURAL, CRAPS_OUT, POINT_HIT, SEVEN_OUT),
 *      if newBankroll < getMinBet() and no chips remain on the table, the
 *      server transitions the run to GAME_OVER.
 *
 * @param currentMarkerIndex  0-based index into GAUNTLET.
 * @returns Minimum bet in cents.
 */
export function getMinBet(currentMarkerIndex: number): number {
  const maxBet = getMaxBet(currentMarkerIndex);
  // ~1/6th of table max, snapped to nearest $5 (500 cents), never below $5.
  return Math.max(500, Math.round(maxBet / 6 / 500) * 500);
}

// ---------------------------------------------------------------------------
// Point Streak Hype — base-game escalating hype tick on consecutive point hits
// ---------------------------------------------------------------------------

/**
 * Flat hype added on the FIRST point hit of any streak.
 * Subsequent hits add STREAK_INCREMENT more per step, up to STREAK_CAP.
 */
export const STREAK_BASE_TICK = 0.15;
export const STREAK_INCREMENT = 0.05;
export const STREAK_CAP       = 3;  // tick caps at 4th+ hit: +0.30× per roll

/**
 * Returns the base-game hype bonus for a point hit given the current
 * consecutive-point-hit streak count (BEFORE incrementing it).
 *
 * Formula: STREAK_BASE_TICK + STREAK_INCREMENT × min(streak, STREAK_CAP)
 *
 * Streak entering → tick awarded:
 *   0 → +0.15   (1st hit)
 *   1 → +0.20   (2nd consecutive)
 *   2 → +0.25   (3rd consecutive)
 *   3 → +0.30   (4th+ consecutive, capped)
 *
 * Applied BEFORE the crew cascade so Holly and other HYPE crew layer
 * their bonuses on top of the already-excited crowd.
 */
export function getBaseHypeTick(consecutivePointHits: number): number {
  return Math.round(
    (STREAK_BASE_TICK + STREAK_INCREMENT * Math.min(consecutivePointHits, STREAK_CAP)) * 10_000,
  ) / 10_000;
}
