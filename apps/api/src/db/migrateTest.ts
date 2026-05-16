import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(__dir, '../..');

const dbUrl = process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('DATABASE_URL is not set. Make sure .env.test is loaded.');
  process.exit(1);
}

execSync('npx drizzle-kit push --config drizzle.test.config.ts', {
  cwd: API_ROOT,
  env: { ...process.env },
  stdio: 'inherit',
});

console.log('Test database migration complete.');
