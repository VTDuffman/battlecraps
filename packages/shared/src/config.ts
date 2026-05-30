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
// Boss rule & reward types
// ---------------------------------------------------------------------------

/** The mechanical modifier a boss applies during their High Limit Room fight. */
export type BossRuleType =
  | 'EXTORTION_FEE'          // Floor 1 — The Foreman: 20% tax on all winning payouts
  | 'RISING_MIN_BETS'        // Floor 2 — Sarge: minimum Pass Line bet rises each Point Hit
  | 'DISABLE_CREW'           // Floor 3 — Mme. Le Prix: one crew member enchanted per come-out
  | 'FOURS_INSTANT_LOSS'     // Floor 4 — The Executive: rolling a total of 4 is instant loss
  | 'TRIBUTE'                // Floor 5 — The Hierophant: crew additives held in escrow; 25% seized on 7-out
  | 'TIDAL_SURGE'            // Floor 6 — The Sovereign: min bet floods 15% of target every 5 rolls
  | 'ORBITAL_DECAY'          // Floor 7 — The Commander: seven-out drains hype by 0.5×, can go below 1.0×
  | 'FIRST_CONTACT_PROTOCOL' // Floor 8 — retired mechanic; kept in union for historical safety
  | 'TRANSMISSION_DELAY'     // Floor 8 — The Emissary: crew additives held one roll; evaporate on 7-out
  | 'CONVERGENCE';           // Floor 9 — The Architect: each seven-out removes one crew slot from the cascade

/** The permanent comp perk awarded for defeating a boss. */
export type CompRewardType =
  | 'THE_VIG'         // Floor 1 — The Vig: crew cash abilities pay out 20% more
  | 'EXTRA_SHOOTER'   // Floor 2 — Member's Jacket: +1 Shooter at next segment reset
  | 'HYPE_RESET_HALF' // Floor 3 — Sea Legs: Hype resets to 50% of current (not 1.0×)
  | 'BOARD_SEAT'      // Floor 4 — Board Seat: a fourth crew slot unlocks
  | 'THE_COVENANT'    // Floor 5 — The Covenant: direct bankroll drains reduced by 50%
  | 'POSEIDONS_FAVOR' // Floor 6 — Poseidon's Favor: first come-out can never craps-out
  | 'CARGO_HOLD'      // Floor 7 — Cargo Hold: a fifth crew slot unlocks
  | 'THE_FREQUENCY'   // Floor 8 — The Frequency: come-out naturals award 3% of marker target as bonus
  | 'NONE';           // Floor 9 — No comp awarded; The Null Space is the end of the line

/**
 * Tunable parameters for the RISING_MIN_BETS boss rule.
 * All percentages are expressed as fractions of the marker's target (0.05 = 5%).
 * @deprecated Superseded by BossRuleParams. Retained while BossEntryModal still
 *   reads boss.risingMinBets directly. Removed in Part 7 once UI is migrated.
 */
export interface RisingMinBetsParams {
  /** Fraction of the marker target that becomes the min-bet on the very first roll. */
  startPct: number;
  /** Added to startPct after each Point Hit (min-bet holds on Seven Out — does not reset). */
  incrementPct: number;
  /** The min-bet never exceeds this fraction of the target, no matter how many rolls. */
  capPct: number;
}

/**
 * Discriminated union of per-rule tunable parameters.
 * TypeScript narrows inside each hook file so Sarge's startPct can never be
 * accidentally accessed on The Executive's config. Add a new union member here
 * when a new boss rule type is introduced — no other shared types need changing.
 */
export type BossRuleParams =
  | { rule: 'EXTORTION_FEE';      taxPct: number }
  | { rule: 'RISING_MIN_BETS';    startPct: number; incrementPct: number; capPct: number; nonComplianceFinePct: number }
  | { rule: 'DISABLE_CREW' }
  | { rule: 'FOURS_INSTANT_LOSS'; triggerTotal: number }
  | { rule: 'TRIBUTE';            escrowSeizurePct: number }
  | { rule: 'TIDAL_SURGE'; stageMultipliers: readonly [number, number, number, number]; stageLabels: readonly [string, string, string, string] }
  | {
      rule:            'ORBITAL_DECAY';
      /** Hype decay on 7-out when hype < 1.5× (below Heating Up). */
      baseDecay:       number;
      /** Hype decay on 7-out when 1.5× ≤ hype < 2.5× (Heating Up tier). */
      heatingUpDecay:  number;
      /** Hype decay on 7-out when hype ≥ 2.5× (On Fire tier). */
      onFireDecay:     number;
      /** Absolute minimum hype — never goes below this value. */
      hypeFloor:       number;
    }
  | { rule: 'FIRST_CONTACT_PROTOCOL' }   // Floor 8 — retired; kept for historical safety
  | { rule: 'TRANSMISSION_DELAY' }       // Floor 8 — no params; escrow logic is inline in rolls.ts
  | { rule: 'CONVERGENCE' };             // Floor 9 — no params; counter tracked via bossPointHits

/** Full descriptor for a boss fight. Only present on markers where isBoss is true. */
export interface BossConfig {
  // ── Identity ──────────────────────────────────────────────────────────────
  /** NPC name shown in boss entry and victory screens. */
  name: string;
  /** Subtitle rendered beneath the name on the dread screen. */
  title: string;

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
  /**
   * Parameters for RISING_MIN_BETS — read by BossEntryModal and getBossMinBet().
   * @deprecated Superseded by ruleParams. Retained while BossEntryModal and
   *   getBossMinBet() still reference this field directly. Removed in Part 7.
   */
  risingMinBets?: RisingMinBetsParams;
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
  MEMBER_JACKET:    1,  // Floor 2 boss reward — +1 Shooter per segment reset
  SEA_LEGS:         2,  // Floor 3 boss reward — Hype resets to 50%
  // ID 3 (GOLDEN_TOUCH) retired in FB-025 — slot unlock comps use perkId 0
  THE_COVENANT:     5,  // Floor 5 boss reward — direct bankroll drains reduced by 50%
  POSEIDONS_FAVOR:  6,  // Floor 6 boss reward — first come-out can never craps-out
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
//   Floor 4 — The Strip:        $5,000 / $7,500 / $15,000
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
      // Vibe
      dreadTagline:        'PAY UP.',
      entryLines: [
        "You're blocking my dock.",
        "I don't care who you are or how good you shoot.",
        "Twenty percent off the top. Every time. Non-negotiable.",
      ],
      ruleBlurb:          "20% tax on every winning payout. The Foreman always gets his cut.",
      victoryQuote:       "…you got lucky. Don't let me catch you around here again.",
      defeatAnnouncement: 'DOCK CLEARED',
      // Mechanic
      rule:           'EXTORTION_FEE',
      ruleHeaderText: 'THE FOREMAN TAKES 20% OF ALL WINNING PAYOUTS',
      ruleParams:     { rule: 'EXTORTION_FEE', taxPct: 0.20 },
      // Comp
      compReward:      'THE_VIG',
      compPerkId:      COMP_PERK_IDS.THE_VIG,
      compName:        'THE VIG',
      compDescription: "You took over the corner. Crew cash abilities pay out 20% more.",
      compFanLabel:    'THE VIG',
      // Legacy
      flavorText: "You're blocking my dock. Clear out or pay up.",
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
      // Vibe
      dreadTagline:        'FALL IN.',
      entryLines: [
        "You want to shoot in MY hall?",
        "Every point you hit, the price goes up.",
        "And it never comes back down.",
      ],
      ruleBlurb:          "The minimum pass-line bet rises with every Point Hit and holds on Seven Out. Miss the minimum and you can still roll — but you'll pay a 5% marker fine for the privilege. Odds bets must also clear the minimum, or the same fine applies.",
      victoryQuote:       "…not bad, soldier. Dismissed.",
      defeatAnnouncement: 'ENEMY NEUTRALIZED',
      // Mechanic
      rule:           'RISING_MIN_BETS',
      ruleHeaderText: 'MIN BET RISES EACH POINT — SKIP IT AND PAY A 5% MARKER FINE',
      ruleParams:     { rule: 'RISING_MIN_BETS', startPct: 0.04, incrementPct: 0.02, capPct: 0.20, nonComplianceFinePct: 0.05 },
      // Comp
      compReward:      'EXTRA_SHOOTER',
      compPerkId:      COMP_PERK_IDS.MEMBER_JACKET,
      compName:        "MEMBER'S JACKET",
      compDescription: "+1 SHOOTER this segment — they know you earned your seat.",
      compFanLabel:    'JACKET',
      // Legacy
      flavorText:    "You want to play in MY hall? Ante up, soldier.",
      risingMinBets: {
        startPct:     0.04,
        incrementPct: 0.02,
        capPct:       0.20,
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
      // Vibe
      dreadTagline:        'HOW CHARMING.',
      entryLines: [
        "Bienvenue. You may sit.",
        "Your crew is welcome here — most of them.",
        "Every come-out, one of yours will be... occupied with other things.",
      ],
      ruleBlurb:          "Before each come-out roll, Mme. Le Prix enchants one of your crew. That crew member is mesmerized for the duration of the come-out — and through any point phase that follows. Upon resolution, her eye falls on someone new.",
      victoryQuote:       "…improbable. You may keep your winnings.",
      defeatAnnouncement: 'TABLE CLOSED',
      // Mechanic
      rule:           'DISABLE_CREW',
      ruleHeaderText: 'ONE CREW ENCHANTED EACH COME-OUT — SITS OUT THE CASCADE',
      ruleParams:     { rule: 'DISABLE_CREW' },
      // Comp
      compReward:      'HYPE_RESET_HALF',
      compPerkId:      COMP_PERK_IDS.SEA_LEGS,
      compName:        'SEA LEGS',
      compDescription: "On Seven Out, Hype resets to 50% instead of 1.0× — safely below The Commander's High Altitude danger zone.",
      compFanLabel:    'SEA LEGS',
      // Legacy
      flavorText: "On my table, the crew works backwards. Adapt.",
    },
  },

  // ── Floor 4: The Strip ────────────────────────────────────────────────────

  {
    targetCents: 500_000,  // $5,000
    venue:       'The Strip',
    floor:       4,
    isBoss:      false,
  },
  {
    targetCents: 750_000,  // $7,500
    venue:       'The Strip',
    floor:       4,
    isBoss:      false,
  },
  {
    targetCents: 1_500_000,  // $15,000 — BOSS: The Executive
    venue:       'The Strip — Penthouse',
    floor:       4,
    isBoss:      true,
    boss: {
      // Identity
      name:  'The Executive',
      title: 'CFO, High Limit Division',
      // Vibe
      dreadTagline:        'YOUR MEETING IS SCHEDULED.',
      entryLines: [
        "Sit down. We've been expecting you.",
        "One rule. Roll a four — and it costs you. The first time.",
        "The house has reviewed your file. Three strikes and you're finished.",
      ],
      ruleBlurb:          "Roll a 4 and it costs you. First offence: 20% of your bankroll. Second: 40%. Third: the run ends. No exceptions. The Executive always collects.",
      victoryQuote:       "…restructuring was inevitable. Well played.",
      defeatAnnouncement: 'EXECUTIVE OVERRIDE',
      // Mechanic
      rule:           'FOURS_INSTANT_LOSS',
      ruleHeaderText: 'ROLLING A 4: FIRST STRIKE −20% | SECOND −40% | THIRD = GAME OVER',
      ruleParams:     { rule: 'FOURS_INSTANT_LOSS', triggerTotal: 4 },
      // Comp
      compReward:      'BOARD_SEAT',
      compPerkId:      0,
      compName:        'BOARD SEAT',
      compDescription: 'A fourth crew slot unlocks. Expand your operation.',
      compFanLabel:    'BOARD',
      // Legacy
      flavorText: "Fours are for losers. Don't roll one.",
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
      // Vibe
      dreadTagline:        'THE ORDER COLLECTS.',
      entryLines: [
        "You were vouched for. That person is no longer welcome.",
        "Three centuries of tradition: your earnings are not yours until the point resolves.",
        "Seven out, and the order takes its cut. Every time.",
      ],
      ruleBlurb:          "Your crew's cash bonuses don't pay out immediately — they're held in escrow. Hit the point and the escrow releases in full. Seven-out and The Hierophant seizes 25% of the escrow as tribute before releasing the rest.",
      victoryQuote:       "…the rites acknowledge your offering. Leave before the observers decide otherwise.",
      defeatAnnouncement: 'RITES CONCLUDED',
      // Mechanic
      rule:           'TRIBUTE',
      ruleHeaderText: 'CREW ADDITIVES HELD IN ESCROW — 25% SEIZED ON SEVEN-OUT',
      ruleParams:     { rule: 'TRIBUTE', escrowSeizurePct: 0.25 },
      // Comp
      compReward:      'THE_COVENANT',
      compPerkId:      COMP_PERK_IDS.THE_COVENANT,
      compName:        'THE COVENANT',
      compDescription: 'Hierophant Escrow seizures on Seven Out are halved — 25% becomes 12.5%. Sarge non-compliance fines are also halved.',
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
      // Vibe
      dreadTagline:        'THE TIDE TURNS.',
      entryLines: [
        "Three thousand years. Every empire above you has collapsed from here.",
        "My table runs on a tide. Five rolls calm, two rolls flood.",
        "You can see it coming. That was never the point.",
      ],
      ruleBlurb:          "The tide runs a four-stage cycle — LOW, EBB, HIGH, FLOW — and advances on every come-out roll. LOW TIDE is the standard table minimum. EBB and FLOW hold at 2×. High Tide demands 3×. The rhythm is visible. The rhythm is inevitable.",
      victoryQuote:       "…the tide will return. It always does.",
      defeatAnnouncement: 'THE TIDE RECEDES',
      // Mechanic
      rule:           'TIDAL_SURGE',
      ruleHeaderText: 'TIDE CYCLES EACH COME-OUT: LOW (1×) → EBB (2×) → HIGH (3×) → FLOW (2×)',
      ruleParams:     {
        rule:             'TIDAL_SURGE',
        stageMultipliers: [1, 2, 3, 2] as const,
        stageLabels:      ['LOW TIDE', 'EBB', 'HIGH TIDE', 'FLOW'] as const,
      },
      // Comp
      compReward:      'POSEIDONS_FAVOR',
      compPerkId:      COMP_PERK_IDS.POSEIDONS_FAVOR,
      compName:        "POSEIDON'S FAVOR",
      compDescription: "First come-out roll of each shooter can never craps-out — treated as a blank re-roll instead.",
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
      // Vibe
      dreadTagline:        'MOMENTUM DECAYS.',
      entryLines: [
        "Eleven months up here. I don't miss the ground.",
        "Your hype is a resource. In this environment, resources decay faster at altitude.",
        "The higher you climb, the steeper the fall. There is no floor — until there is.",
      ],
      ruleBlurb:          "Seven-out drains your Hype — and the higher you fly, the harder you fall. On Fire costs 0.8× per seven-out. Heating Up costs 0.6×. Below 1.5× costs 0.4×. Below 0.75× you lose a cascade slot. Below 0.5× your max bet is halved.",
      victoryQuote:       "…orbital mechanics didn't account for you. Gravity's compliments.",
      defeatAnnouncement: 'ORBITAL AUTHORITY LOST',
      // Mechanic
      rule:           'ORBITAL_DECAY',
      ruleHeaderText: 'ON FIRE 7-OUT: −0.8× HYPE | HEATING UP: −0.6× | BELOW 1.5×: −0.4×',
      ruleParams:     {
        rule:           'ORBITAL_DECAY',
        baseDecay:       0.40,
        heatingUpDecay:  0.60,
        onFireDecay:     0.80,
        hypeFloor:       0.25,
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
      // Vibe
      dreadTagline: 'WE SHOULD NOT HAVE ANSWERED.',
      entryLines: [
        "The table is here. The felt, the chips, the dice. All correct.",
        "Your crew's signals arrive one step behind. Everything echoes.",
        "It has no concept of free money. When the shooter dies, the echo dies with them.",
      ],
      ruleBlurb:          "The Emissary doesn't understand delay. Your crew's cash bonuses from each roll are held until the next. Seven-out and they vanish — untranslatable. Naturals resolve normally; The Emissary has simply never understood them.",
      victoryQuote:       "[The entity pauses for 0.3 seconds. This is the equivalent of applause.]",
      defeatAnnouncement: 'SIGNAL LOST',
      // Mechanic
      rule:           'TRANSMISSION_DELAY',
      ruleHeaderText: 'CREW ADDITIVES HELD ONE ROLL — EVAPORATE ENTIRELY ON SEVEN-OUT',
      ruleParams:     { rule: 'TRANSMISSION_DELAY' },
      // Comp
      compReward:      'THE_FREQUENCY',
      compPerkId:      COMP_PERK_IDS.THE_FREQUENCY,
      compName:        'THE FREQUENCY',
      compDescription: 'Come-out natural 7s and 11s award a flat bonus equal to 3% of the current marker target for the rest of the run.',
      compFanLabel:    'FREQ.',
      // Legacy
      flavorText: "Your crew's signals arrive one step behind. Seven-out and the echo dies with them.",
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
      // Vibe
      dreadTagline: 'YOUR CREW IS TEMPORARY.',
      entryLines: [
        "You've been here before. This table was built from the pattern you left behind.",
        "Every seven-out, one of them disappears. Not gone — just reclaimed.",
        "By the fifth, you'll be rolling alone. The table will still be here. Will you?",
      ],
      ruleBlurb: "Every seven-out permanently removes one crew slot from the cascade, starting with slot 5. After five seven-outs, you roll naked craps.",
      victoryQuote: "…the pattern was incomplete after all. Interesting.",
      defeatAnnouncement: 'NULL SPACE COLLAPSED',
      // Mechanic
      rule:           'CONVERGENCE',
      ruleHeaderText: 'SEVEN-OUT REMOVES A CREW SLOT — 5 SEVEN-OUTS = NAKED CRAPS',
      ruleParams:     { rule: 'CONVERGENCE' },
      // No comp — The Null Space is the end of the line
      compReward:     'NONE',
      compPerkId:      0,
      compName:        '',
      compDescription: '',
      compFanLabel:    '',
      // Legacy
      flavorText: "You built this table from every run you ever played. Now it takes you apart.",
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
 * Returns the minimum Pass Line bet (in cents) for the current boss encounter,
 * or null if the marker is not a boss fight or has no RISING_MIN_BETS rule.
 *
 * Formula:
 *   minBet = targetCents × clamp(startPct + incrementPct × bossPointHits, 0, capPct)
 *   Result is rounded up to the nearest dollar (100 cents).
 *
 * Design note — "Hold on Seven Out, Rise on Point Hit":
 *   bossPointHits only increments when the player hits the point (POINT_HIT without
 *   clearing the marker). All other outcomes — NATURAL, CRAPS_OUT, POINT_SET,
 *   SEVEN_OUT, NO_RESOLUTION — leave the counter unchanged. The min-bet holds at
 *   its current level on Seven Out so Sarge never lets the pressure drop.
 *   Counter resets to 0 on any marker clear (TRANSITION).
 *
 * @param markerIndex  0-based index into GAUNTLET.
 * @param bossPointHits Point hits scored so far this boss segment (0 = first approach).
 */
export function getBossMinBet(markerIndex: number, bossPointHits: number): number | null {
  const config = GAUNTLET[markerIndex];
  if (!config?.isBoss || !config.boss) return null;

  const { targetCents } = config;
  const boss = config.boss;

  if (boss.rule === 'TIDAL_SURGE') {
    const params = boss.ruleParams as Extract<BossRuleParams, { rule: 'TIDAL_SURGE' }>;
    const stageIndex = bossPointHits % params.stageMultipliers.length;
    const multiplier = params.stageMultipliers[stageIndex] ?? 1;
    if (multiplier <= 1) return null; // LOW TIDE — no min-bet override
    return Math.round(getMinBet(markerIndex) * multiplier / 500) * 500;
  }

  if (!boss.risingMinBets) return null;

  const { startPct, incrementPct, capPct } = boss.risingMinBets;

  const rawPct     = startPct + incrementPct * bossPointHits;
  const clampedPct = Math.min(rawPct, capPct);
  const rawCents   = targetCents * clampedPct;

  // Round up to the nearest dollar to keep bet amounts clean.
  return Math.ceil(rawCents / 100) * 100;
}

/**
 * Maximum single bet (pass line or individual hardway) for a given marker.
 *
 * Normally set at 10 % of the current marker target. In boss rooms that use
 * RISING_MIN_BETS (e.g. Sarge), the table max is dynamically floored at
 * 5 × the current boss minimum so the player always has room to place the
 * minimum pass-line bet and back it with full 5× odds on a 6 or 8.
 *
 * @param currentMarkerIndex  The marker the player is currently chasing (0-based).
 * @param bossPointHits       Point hits scored so far this boss segment (required
 *                            for boss markers to compute the dynamic floor; pass 0
 *                            when unknown — safe default, never over-restricts).
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
