import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_DB_URL =
  process.env['DATABASE_URL'] ??
  'postgresql://battlecraps_test:battlecraps_test@localhost:5433/battlecraps_test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    actionTimeout: 10_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  globalSetup: './e2e/globalSetup.ts',

  webServer: [
    {
      // API server — must run with NODE_ENV=test so auth middleware accepts
      // x-test-user-id headers and Bearer test_* socket tokens.
      command: 'npx tsx src/server.ts',
      cwd: path.resolve(__dirname, '../api'),
      port: 3001,
      reuseExistingServer: true,
      env: {
        NODE_ENV:          'test',
        DATABASE_URL:      TEST_DB_URL,
        PORT:              '3001',
        CLERK_SECRET_KEY:  'test_placeholder',
        CLIENT_ORIGIN:     'http://localhost:5173',
      },
      timeout: 30_000,
    },
    {
      // Vite dev server — --mode test loads .env.test (VITE_TEST_MODE=true)
      command: 'npx vite --mode test',
      cwd: __dirname,
      port: 5173,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
