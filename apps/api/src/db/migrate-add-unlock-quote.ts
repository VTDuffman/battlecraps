// One-off migration: adds unlock_quote TEXT column to crew_definitions.
// Run with:
//   cd apps/api && npx tsx --env-file=.env src/db/migrate-add-unlock-quote.ts
//
// Stores a first-person character quote shown in the cinematic unlock modal.
// Null until authored — the modal skips the quote section when null/empty.
import { db } from './client.js';
import { sql } from 'drizzle-orm';

await db.execute(
  sql`ALTER TABLE crew_definitions ADD COLUMN IF NOT EXISTS unlock_quote text`,
);
console.log('unlock_quote column added (or already existed).');
process.exit(0);
