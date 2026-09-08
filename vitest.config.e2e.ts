import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Load `.env.test`/`.env` before any spec calls `loadConfiguration()`, and
    // create the database they name. Both need `test/env.ts`: globalSetup runs
    // in the main process, setupFiles in each worker.
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // E2E specs share one MySQL — run them serially.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
