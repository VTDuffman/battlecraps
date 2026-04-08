// One-off migration: adds mechanic_freeze JSONB column to the runs table.
// Run with: npx tsx src/db/migrate-add-mechanic-freeze.ts
import { db } from './client.js';
import { sql } from 'drizzle-orm';

await db.execute(sql`ALTER TABLE runs ADD COLUMN IF NOT EXISTS mechanic_freeze jsonb`);
console.log('mechanic_freeze column added (or already existed).');
process.exit(0);
