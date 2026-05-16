import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include:           ['src/__tests__/integration/**/*.test.ts'],
    globalSetup:       ['src/__tests__/globalSetup.ts'],
    environment:       'node',
    pool:              'forks',
    fileParallelism:   false,   // run test files sequentially — DB isolation
    testTimeout:       30_000,
    hookTimeout:       30_000,
  },
  resolve: {
    alias: {
      '@battlecraps/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
    },
  },
});
