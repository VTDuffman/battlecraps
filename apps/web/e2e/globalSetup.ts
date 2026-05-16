// =============================================================================
// BATTLECRAPS — PLAYWRIGHT GLOBAL SETUP
// apps/web/e2e/globalSetup.ts
//
// Runs once before any E2E test file executes.
// 1. Pushes the current Drizzle schema to the test database.
// 2. Seeds crewDefinitions (idempotent).
// 3. Upserts the E2E test user so socket auth succeeds.
// =============================================================================

import { execSync }        from 'node:child_process';
import { readFileSync }    from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }   from 'node:url';
import postgres            from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const API_ROOT   = resolve(__dirname, '../../api');

const E2E_CLERK_ID = 'test_user_e2e';
const FALLBACK_DB  = 'postgresql://battlecraps_test:battlecraps_test@localhost:5433/battlecraps_test';

function loadEnvFile(filePath: string): void {
  let content: string;
  try { content = readFileSync(filePath, 'utf-8'); }
  catch { return; }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

export default async function globalSetup(): Promise<void> {
  loadEnvFile(resolve(API_ROOT, '.env.test'));

  const dbUrl = process.env['DATABASE_URL'] ?? FALLBACK_DB;
  const env   = { ...process.env, DATABASE_URL: dbUrl, NODE_ENV: 'test' };

  // Push schema and seed crew definitions (both are idempotent).
  execSync('npx drizzle-kit push --config drizzle.test.config.ts', {
    cwd: API_ROOT, env, stdio: 'pipe',
  });
  execSync('npx tsx src/db/seed.ts', {
    cwd: API_ROOT, env, stdio: 'pipe',
  });

  // Upsert the E2E test user so the socket middleware can resolve it.
  const sql = postgres(dbUrl, { max: 1 });
  try {
    await sql`
      INSERT INTO users (clerk_id, username, email, tutorial_completed,
                         unlocked_crew_ids, comp_perk_ids, updated_at)
      VALUES (
        ${E2E_CLERK_ID}, 'E2E Test User', 'e2e@battlecraps.test',
        false, '{}'::integer[], '{}'::integer[], NOW()
      )
      ON CONFLICT (clerk_id)
      DO UPDATE SET tutorial_completed = false, updated_at = NOW()
    `;
  } finally {
    await sql.end();
  }
}
