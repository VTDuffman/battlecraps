// One-off migration: promotes bankroll and payout columns from INTEGER to BIGINT.
//
// Without the advancement bankroll cap, players can accumulate bankrolls beyond
// the PostgreSQL INTEGER ceiling (~$21.47M in cents), causing "integer out of range"
// errors that silently prevent rolls from resolving.
//
// Columns migrated:
//   runs.bank_roll_cents
//   runs.highest_roll_amplified_cents
//   runs.peak_bankroll_cents
//   leaderboard_entries.final_bankroll_cents
//   leaderboard_entries.highest_roll_amplified_cents
//   leaderboard_entries.peak_bankroll_cents
//
// Run with: cd apps/api && npx tsx src/db/migrate-bigint-bankroll.ts
import { db } from './client.js';
import { sql } from 'drizzle-orm';

await db.execute(sql`
  ALTER TABLE runs
    ALTER COLUMN bankroll_cents          TYPE bigint,
    ALTER COLUMN highest_roll_amplified_cents TYPE bigint,
    ALTER COLUMN peak_bankroll_cents     TYPE bigint
`);
console.log('runs columns promoted to bigint.');

await db.execute(sql`
  ALTER TABLE leaderboard_entries
    ALTER COLUMN final_bankroll_cents            TYPE bigint,
    ALTER COLUMN highest_roll_amplified_cents    TYPE bigint,
    ALTER COLUMN peak_bankroll_cents             TYPE bigint
`);
console.log('leaderboard_entries columns promoted to bigint.');

process.exit(0);
