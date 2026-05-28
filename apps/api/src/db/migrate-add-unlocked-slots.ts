// Migration: adds unlocked_slots integer column to the runs table.
// Run once with: cd apps/api && npx tsx src/db/migrate-add-unlocked-slots.ts
//
// FB-025 — Crew Slot Progression:
//   New runs start with 3 active crew slots. Slot 4 unlocks via BOARD_SEAT comp
//   (beating F4 boss The Executive). Slot 5 unlocks via CARGO_HOLD comp (beating
//   F7 boss The Commander).
//
// The migration adds the column with DEFAULT 3, then immediately backfills all
// existing runs to unlocked_slots = 5 (pre-FB-025 runs had all 5 slots active
// by implication). The default is then reset to 3 so new runs start with 3 slots.
import { db } from './client.js';
import { sql } from 'drizzle-orm';

// Step 1: add column (no-op if already present)
await db.execute(
  sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS unlocked_slots integer NOT NULL DEFAULT 3`,
);
console.log('runs.unlocked_slots column added (or already existed).');

// Step 2: backfill all existing rows — they were played with all 5 slots active
await db.execute(
  sql`UPDATE runs SET unlocked_slots = 5 WHERE unlocked_slots = 3`,
);
console.log('Existing runs backfilled to unlocked_slots = 5.');

// Step 3: reset column default to 3 so new runs start with 3 active slots
await db.execute(
  sql`ALTER TABLE runs ALTER COLUMN unlocked_slots SET DEFAULT 3`,
);
console.log('Column default reset to 3.');

process.exit(0);
