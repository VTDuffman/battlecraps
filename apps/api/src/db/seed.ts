// =============================================================================
// BATTLECRAPS — DATABASE SEED
// apps/api/src/db/seed.ts
//
// Populates the `crew_definitions` table with all 30 crew members.
// Run once after the initial Drizzle migration:
//
//   cd apps/api && npx tsx --env-file=.env src/db/seed.ts
//
// Safe to re-run — uses INSERT ... ON CONFLICT DO UPDATE so it is idempotent.
// If a crew member's metadata changes in the shared package, re-running the
// seed will update the DB to match without needing a manual migration.
// =============================================================================

import {
  lefty,
  physicsProfessor,
  mechanic,
  mathlete,
  floorWalker,
  regular,
  bigSpender,
  shark,
  whale,
  nervousIntern,
  hypeTrainHolly,
  drunkUncle,
  mimic,
  oldPro,
  luckyCharm,
  lookout,
  aceMcgee,
  closeCall,
  momentum,
  echo,
  silverLining,
  oddCouple,
  evenKeel,
  doorman,
  grinder,
  handicapper,
  mirror,
  bookkeeper,
  pressureCooker,
  contrarian,
} from '@battlecraps/shared';
import type { CrewMember } from '@battlecraps/shared';
import { db, pgClient } from './client.js';
import { crewDefinitions } from './schema.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Rarity — authoritative tier for each crew member
// ---------------------------------------------------------------------------

const RARITY: Record<number, string> = {
  1: 'Epic', 2: 'Rare', 3: 'Legendary',
  4: 'Uncommon', 5: 'Rare', 6: 'Uncommon',
  7: 'Common', 8: 'Rare', 9: 'Legendary',
  10: 'Common', 11: 'Uncommon', 12: 'Common',
  13: 'Epic', 14: 'Epic', 15: 'Rare',
  16: 'Starter', 17: 'Starter', 18: 'Starter',
  19: 'Starter', 20: 'Starter', 21: 'Starter', 22: 'Starter',
  23: 'Starter', 24: 'Starter', 25: 'Starter',
  26: 'Starter', 27: 'Starter',
  28: 'Starter', 29: 'Starter', 30: 'Starter',
};

// ---------------------------------------------------------------------------
// Brief descriptions — one sentence shown on crew cards and hover tooltips.
// Canonical copy from crew_framework.md.
// ---------------------------------------------------------------------------

const BRIEF_DESCRIPTIONS: Record<number, string> = {
  1:  'Re-rolls a Seven Out once per shooter.',
  2:  'On any paired roll, nudges both dice ±1 to land on the active point.',
  3:  'Once per shooter: lock a die to any face for up to 4 rolls.',
  4:  'Active Hardway bets survive a soft-number hit.',
  5:  'The first Seven Out of a shooter refunds your Pass Line bet.',
  6:  'Grants a free Odds bet equal to your Pass Line on a Natural.',
  7:  'Adds a flat $100 bonus to every Hardway win.',
  8:  'Adds a flat $100 bonus to every Point Hit.',
  9:  'Multiplies all winning payouts by 1.2×.',
  10: 'Adds +0.2× Hype on every Natural.',
  11: 'Adds +0.3× Hype on every Point Hit.',
  12: '33% chance per roll: +0.5× Hype or −0.1× Hype.',
  13: 'Copies the ability of the last crew member that fired.',
  14: 'Earn +1 Shooter life each time you clear a Marker.',
  15: 'When alone on the rail, your Hype can\'t drop below 2.0×.',
  16: 'Adds Hype whenever a 6 appears on either die.',
  17: 'Adds a flat bonus whenever a 1 appears on either die.',
  18: 'Pays out whenever the dice show consecutive face values.',
  19: 'Adds Hype whenever this roll\'s total is higher than the last.',
  20: 'Pops Hype when the dice repeat the same total as the last roll.',
  21: 'Converts a Craps Out into a Hype bump.',
  22: 'Adds Hype whenever both dice show odd faces.',
  23: 'Pays a flat bonus whenever both dice show even faces.',
  24: 'Pays a small bonus on every come-out roll regardless of outcome.',
  25: 'Earns a steady bonus on every in-between point-phase roll.',
  26: 'Adds Hype when a point is set — more for harder points.',
  27: 'Adds Hype on any roll totalling 7, regardless of phase.',
  28: 'Pays out on every 3rd roll of the current shooter, like clockwork.',
  29: 'Releases a big payout after 5 consecutive blank point-phase rolls.',
  30: 'Pays cash whenever this roll\'s total is lower than the last.',
};

// ---------------------------------------------------------------------------
// Detailed descriptions — 2–3 sentences shown in the expanded help view.
// Canonical copy from crew_framework.md.
// ---------------------------------------------------------------------------

const DETAILED_DESCRIPTIONS: Record<number, string> = {
  1:  'When the shooter rolls a Seven Out, Lefty steps in with a second chance. The dice are re-rolled — if the new roll isn\'t a 7, the shooter lives and play continues. Any Hype or bonuses already built up in the cascade carry through. One use per shooter.',
  2:  'Whenever both dice show the same face, the Physics Prof shifts each die by one pip toward the active point, turning a near-miss into a Point Hit. Because the dice stay paired after the shift, any active Hardway bet also pays out. Fires on every paired roll; no cooldown.',
  3:  'Tap the Mechanic to choose a die face (1–6). That value is held on one die for the next 4 rolls or until the shooter sevens out. The lock is applied before any other crew fires, so the rest of your crew sees it. One use per shooter.',
  4:  'When a roll hits a hardway total (4, 6, 8, or 10) with unmatched dice — a soft result that would normally wipe your Hardway bet — the Mathlete cancels that loss and keeps the bet alive. Doesn\'t protect against a Seven Out, and doesn\'t interfere with hardway wins. Fires every qualifying roll; no cooldown.',
  5:  'When the shooter sevens out, the Floor Walker gets your Pass Line stake back instead of losing it. Your Odds bet is not covered. Protection is used once per shooter and resets when a new shooter takes the table.',
  6:  'Every time the come-out roll is a Natural (7 or 11), the Regular adds a bonus to your payout equal to your Pass Line bet — treated like an Odds win and amplified by Hype and any active multipliers. Fires on every Natural; no cooldown.',
  7:  'Whenever a Hardway bet pays out, the Big Spender throws in an extra $100. That bonus enters the payout pool before Hype is applied, so it scales up with your multiplier stack. Fires on every Hardway win; no cooldown.',
  8:  'Every time the shooter hits their point, the Shark adds $100 to the payout pool. The bonus is applied before Hype and multipliers, so it gets amplified along with everything else. Fires on every Point Hit regardless of bet size; no cooldown.',
  9:  'On any roll that produces a winning payout, the Whale applies a 1.2× multiplier to the final result. Multiple multipliers from different crew stack by product — pair the Whale with the Mimic for a 1.44× combined boost. Does not fire on rolls where nothing wins.',
  10: 'Each come-out Natural (7 or 11) pumps global Hype up by 0.2×. Hype persists across rolls and amplifies every payout, so a steady stream of Naturals quietly compounds into a serious multiplier. No cooldown; fires on every Natural.',
  11: 'Every time the shooter hits their point, Holly adds 0.3× to global Hype. A run of consecutive Point Hits can stack Hype fast, turning every subsequent win into a bigger payout. No cooldown; fires on every Point Hit.',
  12: 'Each roll, the Drunk Uncle secretly rolls his own dice. He fires roughly one roll in three — when he does, an odd second die means +0.5× Hype; an even second die means −0.1× Hype. The upside is big, the downside is small, but he\'s unpredictable.',
  13: 'The Mimic repeats the exact action of whichever crew member fired immediately before it in the cascade. Place it after your most valuable crew to double that effect. In slot 0 the Mimic does nothing — there\'s no prior crew to copy. Slot 4 is the sweet spot.',
  14: 'Each time you hit a Gauntlet Marker and advance to the next floor, the Old Pro grants an extra Shooter — so you enter the next stretch with one more life than normal. Fires at the Transition state between floors, not during rolls. No cooldown; applies every Marker you clear.',
  15: 'If the Lucky Charm is the only crew member in your five slots, global Hype is prevented from falling below 2.0× — guaranteeing every payout is at least doubled. The moment any other crew occupies a slot, the floor effect is inactive. Hype can still rise above 2.0× from point streaks and other sources.',
  16: 'The Lookout watches for the big number — any roll where at least one die lands on 6 generates +0.15 Hype. Fires on roughly 1 in 3 rolls, making it one of the most consistently active crew members. No conditions beyond the die face; no cooldown.',
  17: 'Snake eyes feel lucky now. Any roll where at least one die shows a 1 adds $50 to your payout pool. Fires on roughly 1 in 3 rolls regardless of game phase or outcome. Pairs with The Lookout to cover more than half of all rolls between them.',
  18: 'When dice land on adjacent values — [1,2], [2,3], [3,4], [4,5], or [5,6] in either order — the Close Call adds $100 to the payout pool. So close to a pair. Fires on roughly 1 in 4 rolls regardless of outcome or phase.',
  19: 'When the dice climb — any roll whose total beats the previous roll\'s total — the Momentum adds +0.2 Hype. The table reads the dice like a scoreboard. Fires on roughly 45% of rolls after the first of a shooter. Partners with The Echo and The Contrarian to cover nearly every roll with distinct rewards.',
  20: 'When the total matches the previous roll exactly, the Echo fires a +0.4 Hype burst — bigger than most Hype crew because repetition is rarer. Fires roughly 17% of rolls. Works alongside Momentum and Contrarian to cover almost every roll of a shooter with different rewards.',
  21: 'When the come-out craps out (2, 3, or 12), the Silver Lining adds +0.6 Hype as consolation. CRAPS_OUT is currently the only outcome where no crew fires at all. The Silver Lining makes the worst come-out result build toward something — turning grief into momentum for the next roll.',
  22: 'When both dice land on odd values (1, 3, or 5), the Odd Couple adds +0.2 Hype. Fires on 25% of all rolls regardless of phase or outcome. Pairs with The Even Keel to cover 50% of rolls between them — Hype on odd rolls, cash on even ones.',
  23: 'When both dice land on even values (2, 4, or 6), the Even Keel adds $80 to the payout pool. Smooth and steady — fires on 25% of rolls. Partners with The Odd Couple to cover half of all rolls: Even Keel provides cash income while Odd Couple builds Hype.',
  24: 'Every time a come-out roll happens — Natural, Craps Out, or Point Set — the Doorman adds $40 to the payout pool. Come-out rolls that aren\'t Naturals currently feel ignored by most crew. The Doorman means every new come-out earns something, making the transition between shooters feel productive.',
  25: 'Every point-phase roll that doesn\'t resolve — no Point Hit, no Seven Out — the Grinder adds $30 to the payout pool. These blank rolls currently feel like dead air. At 65–70% of point-phase roll frequency, the Grinder turns the longest stretches of waiting into the most consistent earners.',
  26: 'Every time the come-out establishes a point, the Handicapper adds Hype scaled to difficulty: Point 6 or 8 gives +0.1 Hype, Point 5 or 9 gives +0.2, and Points 4 or 10 give +0.3. POINT_SET is currently ignored by every crew member. The Handicapper makes hard points feel like an opportunity instead of a threat.',
  27: 'Opposite faces of a real die always sum to 7. When the dice show that balance — Natural on come-out or Seven Out in point phase — the Mirror banks +0.2 Hype regardless. Seven Outs are still costly, but you carry Hype into the next shooter. Naturals get an extra Hype bump on top of the win.',
  28: 'Every third roll — regardless of outcome, phase, or dice values — the Bookkeeper adds $60 to the payout pool. The predictability is the design: players count rolls out loud. "One, two, THREE." This is the most deliberately Pavlovian crew member in the set. Counter resets per shooter.',
  29: 'Every fifth consecutive NO_RESOLUTION roll in the point phase triggers a release: +0.5 Hype and +$100 additive. Long point phases feel like purgatory without this — the Pressure Cooker makes players actively want them. Each blank roll builds pressure; every five rolls it releases. Counter resets on any resolution.',
  30: 'When the dice fall — any roll whose total is below the previous roll\'s total — the Contrarian adds $75 to the payout pool. Going down? Bank some cash. Different reward from The Momentum (Hype on ascent) and The Echo (big Hype on repeat) — together the three cover nearly every roll of a shooter with distinct rewards.',
};

// ---------------------------------------------------------------------------
// Unlock descriptions — IDs 1–15 only; Starter crew have no unlock condition.
// Canonical copy from crew_framework.md.
// ---------------------------------------------------------------------------

const UNLOCK_DESCRIPTIONS: Record<number, string> = {
  1:  'Lose 3 or more shooters to Seven Out in a single run and still clear the floor marker.',
  2:  'Roll doubles (paired dice) 5 times in a single run.',
  3:  'Hit the active point 4 consecutive times within a single shooter without a Seven Out.',
  4:  'Lose 3 Hardway bets to soft rolls in a single run.',
  5:  'Lose a shooter to Seven Out on 8 separate occasions across all runs (cumulative).',
  6:  'Hit 3 Naturals in a single come-out sequence within one run.',
  7:  'Win your first Hardway bet.',
  8:  'Accumulate 10 total Point Hits across all runs.',
  9:  'Reach a bankroll of $8,000 in a single run.',
  10: 'Roll a Natural (7 or 11) on your very first come-out roll.',
  11: 'Hit the same point 3 consecutive times within a single shooter\'s life.',
  12: 'See Hype climb above 2.0× in any single run.',
  13: 'Have 4 or more distinct crew bonuses activate in a single cascade.',
  14: 'Clear all 9 Gauntlet markers in a single run (win the game once).',
  15: 'Clear any Gauntlet marker with only 1 crew member filling your roster.',
};

// ---------------------------------------------------------------------------
// Build seed rows from canonical shared package definitions
// ---------------------------------------------------------------------------

const ALL_CREW: CrewMember[] = [
  // Original 15 (IDs 1–15) — require unlock
  lefty, physicsProfessor, mechanic,
  mathlete, floorWalker, regular,
  bigSpender, shark, whale,
  nervousIntern, hypeTrainHolly, drunkUncle,
  mimic, oldPro, luckyCharm,
  // Starter 15 (IDs 16–30) — always available
  lookout, aceMcgee, closeCall,
  momentum, echo, silverLining, oddCouple,
  evenKeel, doorman, grinder,
  handicapper, mirror,
  bookkeeper, pressureCooker, contrarian,
];

async function seed(): Promise<void> {
  console.log('🎲 BattleCraps seed starting…');

  // Verify no duplicate IDs — this would indicate a bug in the shared package.
  const ids = ALL_CREW.map((c) => c.id);
  const uniqueIds = new Set(ids);
  if (uniqueIds.size !== ALL_CREW.length) {
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    throw new Error(`Duplicate crew IDs detected: [${dupes.join(', ')}]. Fix shared package before seeding.`);
  }

  const rows = ALL_CREW.map((crew) => ({
    id:                  crew.id,
    name:                crew.name,
    abilityCategory:     crew.abilityCategory,
    cooldownType:        crew.cooldownType,
    baseCostCents:       crew.baseCost,
    visualId:            crew.visualId,
    description:         BRIEF_DESCRIPTIONS[crew.id] ?? null,
    rarity:              RARITY[crew.id] ?? 'Common',
    briefDescription:    BRIEF_DESCRIPTIONS[crew.id] ?? null,
    detailedDescription: DETAILED_DESCRIPTIONS[crew.id] ?? null,
    unlockDescription:   UNLOCK_DESCRIPTIONS[crew.id] ?? '',
    isStarterRoster:     (RARITY[crew.id] === 'Starter'),
  }));

  // Upsert: safe to re-run. Updates all fields if they've changed.
  await db
    .insert(crewDefinitions)
    .values(rows)
    .onConflictDoUpdate({
      target: crewDefinitions.id,
      set: {
        name:                sql`excluded.name`,
        abilityCategory:     sql`excluded.ability_category`,
        cooldownType:        sql`excluded.cooldown_type`,
        baseCostCents:       sql`excluded.base_cost_cents`,
        visualId:            sql`excluded.visual_id`,
        description:         sql`excluded.description`,
        rarity:              sql`excluded.rarity`,
        briefDescription:    sql`excluded.brief_description`,
        detailedDescription: sql`excluded.detailed_description`,
        unlockDescription:   sql`excluded.unlock_description`,
        isStarterRoster:     sql`excluded.is_starter_roster`,
      },
    });

  console.log(`✅ Seeded ${rows.length} crew members into crew_definitions.`);
  console.log('   IDs:', rows.map((r) => `${r.id} (${r.name})`).join('\n        '));

  await pgClient.end();
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
