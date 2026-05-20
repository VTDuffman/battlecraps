// Migration: adds comp_perk_ids integer[] column to the runs table.
// Run once with: cd apps/api && npx tsx src/db/migrate-add-run-comp-perk-ids.ts
//
// Comps are per-run (earned by defeating bosses during that run) and must not
// carry over across runs. Moving the column to runs ensures new runs always
// start with an empty comp set. The existing users.comp_perk_ids column is
// retained for future meta-progression work but is no longer used for gameplay.
import { db } from './client.js';
import { sql } from 'drizzle-orm';

await db.execute(
  sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS comp_perk_ids integer[] NOT NULL DEFAULT '{}'::integer[]`,
);
console.log('runs.comp_perk_ids column added (or already existed).');
process.exit(0);
