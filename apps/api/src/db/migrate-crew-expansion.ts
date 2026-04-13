// =============================================================================
// MIGRATION: migrate-crew-expansion.ts
// Crew Expansion & Unlock System (FB-012)
//
// Run with:
//   cd apps/api && npx tsx --env-file=../../.env src/db/migrate-crew-expansion.ts
//
// Operations (all idempotent via IF NOT EXISTS / safe UPDATE):
//   1. runs         — add previous_roll_total, shooter_roll_count,
//                     point_phase_blank_streak, per_run_unlock_counters
//   2. users        — add unlock_progress
//   3. crew_definitions — add rarity, brief_description, detailed_description,
//                         unlock_description; set is_starter_roster = false for
//                         original crew IDs 1–15
// =============================================================================

import { db } from './client.js';
import { sql } from 'drizzle-orm';

console.log('[migrate-crew-expansion] Starting…');

// ── 1. runs table ─────────────────────────────────────────────────────────────

await db.execute(sql`
  ALTER TABLE runs
    ADD COLUMN IF NOT EXISTS previous_roll_total        smallint,
    ADD COLUMN IF NOT EXISTS shooter_roll_count         smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS point_phase_blank_streak   smallint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS per_run_unlock_counters    jsonb    NOT NULL
      DEFAULT '{"naturalsThisRun":0,"softHardwayLossesThisRun":0,"pairedRollsThisRun":0,"sevenOutsThisRun":0}'::jsonb
`);
console.log('[migrate-crew-expansion] runs: 4 columns added (or already existed).');

// ── 2. users table ────────────────────────────────────────────────────────────

await db.execute(sql`
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS unlock_progress jsonb NOT NULL DEFAULT '{}'::jsonb
`);
console.log('[migrate-crew-expansion] users: unlock_progress column added (or already existed).');

// ── 3. crew_definitions table ─────────────────────────────────────────────────

await db.execute(sql`
  ALTER TABLE crew_definitions
    ADD COLUMN IF NOT EXISTS rarity               text NOT NULL DEFAULT 'Common',
    ADD COLUMN IF NOT EXISTS brief_description    text,
    ADD COLUMN IF NOT EXISTS detailed_description text,
    ADD COLUMN IF NOT EXISTS unlock_description   text NOT NULL DEFAULT ''
`);
console.log('[migrate-crew-expansion] crew_definitions: 4 columns added (or already existed).');

// Semantic correction: IDs 1–15 are NOT auto-available; they require unlock.
// isStarterRoster = true will be set by seed.ts for IDs 16–30.
await db.execute(sql`
  UPDATE crew_definitions
     SET is_starter_roster = false
   WHERE id BETWEEN 1 AND 15
`);
console.log('[migrate-crew-expansion] crew_definitions: is_starter_roster reset for IDs 1–15.');

console.log('[migrate-crew-expansion] Done.');
process.exit(0);
