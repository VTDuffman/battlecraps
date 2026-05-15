// =============================================================================
// MIGRATION: migrate-remove-base-cost.ts
// FB-023 — Dynamic Crew Hiring Costs
//
// Run with:
//   cd apps/api && npx tsx --env-file=../../.env src/db/migrate-remove-base-cost.ts
//
// Operations:
//   1. crew_definitions — drop base_cost_cents column (now computed dynamically
//      via getCrewHireCost() in @battlecraps/shared based on rarity × marker max bet).
// =============================================================================

import { db } from './client.js';
import { sql } from 'drizzle-orm';

console.log('[migrate-remove-base-cost] Starting…');

await db.execute(sql`
  ALTER TABLE crew_definitions
  DROP COLUMN IF EXISTS base_cost_cents
`);

console.log('[migrate-remove-base-cost] crew_definitions: dropped base_cost_cents column.');
console.log('[migrate-remove-base-cost] Done.');
process.exit(0);
