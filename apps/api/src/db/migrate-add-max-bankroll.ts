// One-off migration: adds max_bankroll_cents BIGINT column to the users table.
// Run with: npm run --workspace=apps/api db:seed  (or tsx directly)
//   cd apps/api && npx tsx src/db/migrate-add-max-bankroll.ts
//
// The column tracks the highest bankroll the player has ever reached across
// all runs. Updated server-side by the roll handler on every roll where
// the post-roll bankroll exceeds the stored value. Starts at 0 (never played).
import { db } from './client.js';
import { sql } from 'drizzle-orm';

await db.execute(
  sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS max_bankroll_cents bigint NOT NULL DEFAULT 0`,
);
console.log('max_bankroll_cents column added (or already existed).');
process.exit(0);
