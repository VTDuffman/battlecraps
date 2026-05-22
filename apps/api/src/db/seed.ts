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
  4: 'Rare', 5: 'Uncommon', 6: 'Uncommon',
  7: 'Uncommon', 8: 'Rare', 9: 'Legendary',
  10: 'Common', 11: 'Uncommon', 12: 'Rare',
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
  4:  'Active Hardway bets survive a soft-number hit — and earn a floor-scaled bonus when they do.',
  5:  'On Seven Out, refunds your Pass Line bet — except on the final shooter.',
  6:  'Adds a floor-scaled bonus to every Natural.',
  7:  'Adds a floor-scaled cash bonus to every Hardway win.',
  8:  'Adds a floor-scaled cash bonus to every Point Hit.',
  9:  'Multiplies all winning payouts by 1.2×.',
  10: 'Adds +0.30× Hype on every Natural.',
  11: 'Adds +0.15× Hype on every Point Hit.',
  12: '33% chance per roll: +0.5× Hype or −0.25× Hype.',
  13: 'Copies the ability of the last crew member that fired.',
  14: 'Raises the table bet ceiling from 10% to 15% of the Marker target.',
  15: 'On the first Seven Out per shooter, injects +1.0 Hype before the reset.',
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
  4:  'When a roll hits a hardway total (4, 6, 8, or 10) with unmatched dice — a soft result that would normally wipe your Hardway bet — the Mathlete cancels that loss and keeps the bet alive. When the save fires, a floor-scaled bonus is also added to the payout pool — the Mathlete rewards the near-miss. Doesn\'t protect against a Seven Out, and doesn\'t interfere with hardway wins. Fires every qualifying roll; no cooldown.',
  5:  'When any shooter except the last sevens out, the Floor Walker gets your Pass Line stake back instead of losing it. Your Odds bet is not covered. Protection is used once per shooter and resets when a new shooter takes the table.',
  6:  'Every time the come-out roll is a Natural (7 or 11), the Regular adds a floor-scaled bonus to the payout pool — amplified by Hype and any active multipliers just like every other additive crew. No longer tied to your Pass Line bet size, so the bonus stays meaningful at every floor. Fires on every Natural; no cooldown.',
  7:  'Whenever a Hardway bet pays out, the Big Spender throws in a floor-scaled cash bonus. That bonus enters the payout pool before Hype is applied, so it scales up with your multiplier stack. Fires on every Hardway win; no cooldown.',
  8:  'Every time the shooter hits their point, the Shark adds a floor-scaled bonus to the payout pool. The bonus is applied before Hype and multipliers, so it gets amplified along with everything else. Fires on every Point Hit regardless of bet size; no cooldown.',
  9:  'On any roll that produces a winning payout, the Whale applies a 1.2× multiplier to the final result. Multiple multipliers from different crew stack by product — pair the Whale with the Mimic for a 1.44× combined boost. Does not fire on rolls where nothing wins.',
  10: 'Each come-out Natural (7 or 11) pumps global Hype up by 0.30×. Hype persists across rolls and amplifies every payout, so a steady stream of Naturals quietly compounds into a serious multiplier. No cooldown; fires on every Natural.',
  11: 'Every time the shooter hits their point, Holly adds 0.15× to global Hype. A run of consecutive Point Hits can stack Hype fast, turning every subsequent win into a bigger payout. No cooldown; fires on every Point Hit.',
  12: 'Each roll, the Drunk Uncle secretly rolls his own dice. He fires roughly one roll in three — when he does, an odd second die means +0.5× Hype; an even second die means −0.25× Hype. The upside is big, the downside is real, and he\'s unpredictable.',
  13: 'The Mimic repeats the exact action of whichever crew member fired immediately before it in the cascade. Place it after your most valuable crew to double that effect. In slot 0 the Mimic does nothing — there\'s no prior crew to copy. Slot 4 is the sweet spot.',
  14: 'The Old Pro raises your table bet ceiling from 10% to 15% of the Marker target — every roll, for the entire run. Bigger bets mean bigger payouts, and bigger payouts mean bigger records on the High Roller\'s Club leaderboard. No cooldown; the ceiling lift is always active while he\'s in your crew.',
  15: 'The first time each shooter sevens out, the Lucky Charm fires a +1.0 Hype boost before the reset kicks in. The server captures that delta, so the next shooter always starts with a Hype advantage. Once per shooter — the Charm resets when a new shooter takes the table. Stack with Sea Legs for an even softer landing.',
  16: 'The Lookout watches for the big number — any roll where at least one die lands on 6 generates +0.20 Hype. Fires on roughly 1 in 3 rolls, making it one of the most consistently active crew members. No conditions beyond the die face; no cooldown.',
  17: 'Snake eyes feel lucky now. Any roll where at least one die shows a 1 adds a floor-scaled bonus to your payout pool. Fires on roughly 1 in 3 rolls regardless of game phase or outcome. Pairs with The Lookout to cover more than half of all rolls between them.',
  18: 'When dice land on adjacent values — [1,2], [2,3], [3,4], [4,5], or [5,6] in either order — the Close Call adds a floor-scaled bonus to the payout pool. So close to a pair. Fires on roughly 1 in 4 rolls regardless of outcome or phase.',
  19: 'When the dice climb — any roll whose total beats the previous roll\'s total — the Momentum adds +0.2 Hype. The table reads the dice like a scoreboard. Fires on roughly 45% of rolls after the first of a shooter. Partners with The Echo and The Contrarian to cover nearly every roll with distinct rewards.',
  20: 'When the total matches the previous roll exactly, the Echo fires a +0.4 Hype burst — bigger than most Hype crew because repetition is rarer. Fires roughly 17% of rolls. Works alongside Momentum and Contrarian to cover almost every roll of a shooter with different rewards.',
  21: 'When the come-out craps out (2, 3, or 12), the Silver Lining adds +0.4 Hype as consolation. CRAPS_OUT is currently the only outcome where no crew fires at all. The Silver Lining makes the worst come-out result build toward something — turning grief into momentum for the next roll.',
  22: 'When both dice land on odd values (1, 3, or 5), the Odd Couple adds +0.2 Hype. Fires on 25% of all rolls regardless of phase or outcome. Pairs with The Even Keel to cover 50% of rolls between them — Hype on odd rolls, cash on even ones.',
  23: 'When both dice land on even values (2, 4, or 6), the Even Keel adds a floor-scaled bonus to the payout pool. Smooth and steady — fires on 25% of rolls. Partners with The Odd Couple to cover half of all rolls: Even Keel provides cash income while Odd Couple builds Hype.',
  24: 'Every time a come-out roll happens — Natural, Craps Out, or Point Set — the Doorman adds a floor-scaled bonus to the payout pool. The Doorman means every new come-out earns something, making the transition between shooters feel productive.',
  25: 'Every point-phase roll that doesn\'t resolve — no Point Hit, no Seven Out — the Grinder adds a floor-scaled bonus to the payout pool. At 65–70% of point-phase roll frequency, the Grinder turns the longest stretches of waiting into the most consistent earners.',
  26: 'Every time the come-out establishes a point, the Handicapper adds Hype scaled to difficulty: Point 6 or 8 gives +0.1 Hype, Point 5 or 9 gives +0.2, and Points 4 or 10 give +0.3. POINT_SET is currently ignored by every crew member. The Handicapper makes hard points feel like an opportunity instead of a threat.',
  27: 'Opposite faces of a real die always sum to 7. When the dice show that balance — Natural on come-out or Seven Out in point phase — the Mirror banks +0.2 Hype regardless. Seven Outs are still costly, but you carry Hype into the next shooter. Naturals get an extra Hype bump on top of the win.',
  28: 'Every third roll — regardless of outcome, phase, or dice values — the Bookkeeper adds a floor-scaled bonus to the payout pool. The predictability is the design: players count rolls out loud. "One, two, THREE." This is the most deliberately Pavlovian crew member in the set. Counter resets per shooter.',
  29: 'Every fifth consecutive NO_RESOLUTION roll in the point phase triggers a release: +0.5 Hype and a floor-scaled cash bonus. Long point phases feel like purgatory without this — the Pressure Cooker makes players actively want them. Each blank roll builds pressure; every five rolls it releases. Counter resets on any resolution.',
  30: 'When the dice fall — any roll whose total is below the previous roll\'s total — the Contrarian adds a floor-scaled bonus to the payout pool. Going down? Bank some cash. Different reward from The Momentum (Hype on ascent) and The Echo (big Hype on repeat) — together the three cover nearly every roll of a shooter with distinct rewards.',
};

// ---------------------------------------------------------------------------
// Unlock quotes — IDs 1–15 only; shown in the cinematic unlock modal.
// First-person voice of the crew member describing what attracted them to
// the player's play. Leave as empty string '' until authored — the modal
// skips the section when the string is empty.
// ---------------------------------------------------------------------------

const UNLOCK_QUOTES: Record<number, string> = {
  1:  'Impressive, kid. I thought you were done for sure. But, you\'ve got something special. I can show you a special trick of mine to take care of that pesky seven out.',
  2:  'Only a master of time and space could pull off a trick like that! I\'ve got some tricks of my own that could be of use to you.',
  3:  'You have to be doing something to those dice to get them to land like that! If you show me yours, I\`ll show you mine.',
  4:  'I\'ve got a special system that can prevent losing precious hardway bets to soft rolls. It\'s a bit of a gamble, but it could be worth it.',
  5:  'Seven outs are a pain, I know how to soften that blow a bit.',
  6:  'Is there anything better than a couple of naturals? I\'d pay to see those.',
  7:  'If you like hardways, I have enough puns to last all night!',
  8:  'You look like you\'re out for blood. I could smell it from miles away.',
  9:  'Scared money don\'t make money. Let\'s make some money!',
  10: 'Wait, sevens are good? I thought they were bad? I don\'t get this game, but I love watching you play!',
  11: 'Let\'s go shooter! If you bring the points, I\'ll bring the hype!',
  12: 'Listen...hersh the thingaboutcrapz. It all schtarted when I...forgot...are we in a casino?',
  13: 'The best part about this game is the power of freindship! We all win together!',
  14: 'I know a pro when I see one. Well done, I\'ll see you out there next time.',
  15: 'Why do I only get lucky when there\'s no one else around to see it? Shenanigans!',
};

// ---------------------------------------------------------------------------
// Unlock descriptions — IDs 1–15 only; Starter crew have no unlock condition.
// Canonical copy from crew_framework.md.
// ---------------------------------------------------------------------------

const UNLOCK_DESCRIPTIONS: Record<number, string> = {
  1:  'Lose 3 or more shooters to Seven Out within a single marker segment and still clear it.',
  2:  'Roll 3 doubles in a row — three consecutive paired rolls within a single run.',
  3:  'Roll the exact same dice combination 3 times in a row.',
  4:  'Win a Hardway bet on 3 different numbers in a single run.',
  5:  'Lose a shooter to Seven Out on 8 separate occasions across all runs (cumulative).',
  6:  'Hit 3 Naturals in a single run.',
  7:  'Win 3 Hardway bets in a single run.',
  8:  'Accumulate 40 total Point Hits across all runs.',
  9:  'Reach a bankroll of $20,000 in a single run.',
  10: 'Roll a Natural (7 or 11) on your very first come-out roll.',
  11: 'Hit the point 3 consecutive times within a single shooter\'s run.',
  12: 'See Hype reach 3.0× in any single run.',
  13: 'Have 4 or more distinct crew bonuses activate in a single cascade.',
  14: 'Clear all 9 Gauntlet markers in a single run (win the game once).',
  15: 'Clear all 3 markers of any Gauntlet floor with only 1 crew member in your slots the entire time.',
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
    visualId:            crew.visualId,
    description:         BRIEF_DESCRIPTIONS[crew.id] ?? null,
    rarity:              RARITY[crew.id] ?? 'Common',
    briefDescription:    BRIEF_DESCRIPTIONS[crew.id] ?? null,
    detailedDescription: DETAILED_DESCRIPTIONS[crew.id] ?? null,
    unlockDescription:   UNLOCK_DESCRIPTIONS[crew.id] ?? '',
    unlockQuote:         UNLOCK_QUOTES[crew.id] ?? null,
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
        visualId:            sql`excluded.visual_id`,
        description:         sql`excluded.description`,
        rarity:              sql`excluded.rarity`,
        briefDescription:    sql`excluded.brief_description`,
        detailedDescription: sql`excluded.detailed_description`,
        unlockDescription:   sql`excluded.unlock_description`,
        unlockQuote:         sql`excluded.unlock_quote`,
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
