// =============================================================================
// BATTLECRAPS — DATABASE SEED
// apps/api/src/db/seed.ts
//
// Populates the `crew_definitions` table with the 15 MVP starter crew members.
// Run once after the initial Drizzle migration:
//
//   npx tsx src/db/seed.ts
//
// Safe to re-run — uses INSERT ... ON CONFLICT DO UPDATE so it is idempotent.
// If a crew member's metadata changes in the shared package, re-running the
// seed will update the DB to match without needing a manual migration.
// =============================================================================

process.loadEnvFile();
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
} from '@battlecraps/shared';
import type { CrewMember } from '@battlecraps/shared';
import { db, pgClient } from './client.js';
import { crewDefinitions } from './schema.js';
import { sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Ability descriptions — one-line flavour text for the Pub recruitment screen.
// Kept here rather than in the shared package (which has no UI concerns).
// ---------------------------------------------------------------------------

const DESCRIPTIONS: Record<number, string> = {
  1:  'Re-rolls a Seven Out once per shooter.',
  2:  'Occasionally swaps a 7 for the active Point number.',
  3:  'Locks a chosen die value for up to 4 rolls.',
  4:  'Active Hardway bets survive a soft-number hit.',
  5:  'The first Seven Out of a shooter refunds your Pass Line bet.',
  6:  'Grants a free Odds bet equal to your Pass Line on a Natural.',
  7:  'Adds a flat $100 bonus to every Hardway win.',
  8:  'Adds a flat $100 bonus to every Point Hit payout.',
  9:  'Multiplies all winning payouts by 1.2× on every roll.',
  10: 'Adds +0.2× Hype on every Natural.',
  11: 'Adds +0.3× Hype on every Point Hit.',
  12: 'Has a 33% chance to add +0.5× Hype — or subtract 0.1× Hype.',
  13: 'Copies the ability of the last crew member that fired.',
  14: 'If all other crew members are on cooldown, activates all of them.',
  15: 'When alone, sets a Hype floor of 2.0×.',
};

// ---------------------------------------------------------------------------
// Build seed rows from canonical shared package definitions
// ---------------------------------------------------------------------------

const ALL_CREW: CrewMember[] = [
  lefty, physicsProfessor, mechanic,
  mathlete, floorWalker, regular,
  bigSpender, shark, whale,
  nervousIntern, hypeTrainHolly, drunkUncle,
  mimic, oldPro, luckyCharm,
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
    id:              crew.id,
    name:            crew.name,
    abilityCategory: crew.abilityCategory,
    cooldownType:    crew.cooldownType,
    baseCostCents:   crew.baseCost,
    visualId:        crew.visualId,
    description:     DESCRIPTIONS[crew.id] ?? null,
    isStarterRoster: true,
  }));

  // Upsert: safe to re-run. Updates name/description/cost if they've changed.
  await db
    .insert(crewDefinitions)
    .values(rows)
    .onConflictDoUpdate({
      target: crewDefinitions.id,
      set: {
        name:            sql`excluded.name`,
        abilityCategory: sql`excluded.ability_category`,
        cooldownType:    sql`excluded.cooldown_type`,
        baseCostCents:   sql`excluded.base_cost_cents`,
        visualId:        sql`excluded.visual_id`,
        description:     sql`excluded.description`,
        isStarterRoster: sql`excluded.is_starter_roster`,
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
