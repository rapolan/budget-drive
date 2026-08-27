import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    // Default 5000ms is too tight under full fork-parallelism on a loaded
    // machine (Express app bootstrap on first import per file, real
    // bcrypt.hash/compare in auth/acceptInvite tests, scheduling delay
    // across dozens of competing forks). A test that times out does NOT
    // cancel its in-flight promise chain - the orphaned work keeps running
    // and can call the shared per-file mockQuery/mockClientQuery singleton
    // (src/__tests__/mocks/database.ts) during a LATER sibling test in the
    // same file, corrupting that test's mock-call log or consuming a
    // mockResolvedValueOnce it queued for itself. This margin makes that
    // trigger far less likely to fire, but the underlying shared-mutable-
    // mock-singleton pattern (51 files) is the real defect and remains -
    // see the isolation rewrite tracked separately.
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/__tests__/**', 'src/index.ts'],
    },
  },
});
