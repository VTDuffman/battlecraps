// =============================================================================
// BATTLECRAPS — VITEST GLOBAL SETUP
// apps/api/src/__tests__/globalSetup.ts
//
// Runs ONCE before any test file executes (main process, not in workers).
// 1. Loads .env.test so DATABASE_URL is set before workers fork.
// 2. Pushes the current Drizzle schema to the test database.
// 3. Seeds crewDefinitions (idempotent) so recruit tests have data.
//
// process.env mutations here are inherited by forked test workers because
// vitest spawns them after setup() returns.
// =============================================================================

import { execSync }          from 'child_process';
import { readFileSync }       from 'fs';
import { resolve, dirname }   from 'path';
import { fileURLToPath }      from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dir      = dirname(__filename);
const API_ROOT   = resolve(__dir, '../..');   // apps/api/

// ---------------------------------------------------------------------------
// Minimal .env file parser — avoids adding a dotenv dependency.
// Does not overwrite variables already present in the environment.
// ---------------------------------------------------------------------------

function loadEnvFile(filePath: string): void {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return; // file absent — DATABASE_URL must be set externally
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key   = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    // Only set if not already provided by the outer environment.
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// Setup — called once before any test worker starts
// ---------------------------------------------------------------------------

export async function setup(): Promise<void> {
  loadEnvFile(resolve(API_ROOT, '.env.test'));

  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    throw new Error(
      'DATABASE_URL is not set. Create apps/api/.env.test or export the variable before running tests.',
    );
  }

  // Push the current schema.ts to the test DB.
  // Uses drizzle.test.config.ts (strict: false) so the push never prompts.
  execSync('npx drizzle-kit push --config drizzle.test.config.ts', {
    cwd: API_ROOT,
    env: { ...process.env },
    stdio: 'pipe',
  });

  // Seed crewDefinitions — idempotent upsert, safe to re-run.
  // The seed script calls pgClient.end() before exiting, so no leaked handles.
  execSync('npx tsx src/db/seed.ts', {
    cwd: API_ROOT,
    env: { ...process.env },
    stdio: 'pipe',
  });
}

// ---------------------------------------------------------------------------
// Teardown — no persistent connections were opened in this file
// ---------------------------------------------------------------------------

export async function teardown(): Promise<void> {
  // execSync processes complete synchronously; nothing to close here.
}
