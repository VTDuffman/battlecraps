// =============================================================================
// BATTLECRAPS — DATABASE CLIENT
// apps/api/src/db/client.ts
//
// Initialises the Drizzle ORM instance with a postgres.js driver.
// The connection string is read from the DATABASE_URL environment variable.
//
// MOCK NOTE: For local development without a live database, set:
//   DATABASE_URL=postgres://postgres:password@localhost:5432/battlecraps
// The schema can be pushed with `npm run db:push` once Postgres is running.
// =============================================================================

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';

// ---------------------------------------------------------------------------
// Connection — single shared pool for the process lifetime
// ---------------------------------------------------------------------------

const connectionString =
  process.env['DATABASE_URL'] ??
  // ⚠️  MOCK: Replace with a real connection string or set DATABASE_URL.
  'postgres://postgres:password@localhost:5432/battlecraps';

/**
 * postgres.js connection pool.
 *
 * max: 10 keeps us well under Neon's 100-connection limit while leaving
 * headroom for other services. Adjust for your hosting tier.
 */
const sql = postgres(connectionString, {
  max:          10,
  idle_timeout: 20,   // seconds before an idle connection is closed
  connect_timeout: 10, // seconds before a connection attempt is aborted
});

/**
 * The Drizzle client. Import this wherever you need DB access.
 *
 * @example
 * import { db } from '../db/client.js';
 * const run = await db.query.runs.findFirst({ where: eq(runs.id, runId) });
 */
export const db = drizzle(sql, { schema });

/** Re-export the raw postgres client for raw queries (migrations, health checks). */
export { sql as pgClient };
