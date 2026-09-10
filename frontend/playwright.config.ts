import { defineConfig, devices } from '@playwright/test';

// Minimal, ad-hoc setup for one-off Playwright verification scripts, used
// throughout this app's development to visually confirm a specific fix or
// feature (screenshot before/after, both themes) rather than as an
// automated regression suite. Started out scoped to just the booking-
// workflow screenshots but has since grown to 28+ specs, each covering a
// different historical fix (see frontend/e2e-screenshots/*.spec.ts) - kept
// around as a record of what was live-verified, not re-run as a suite.
// This is NOT a general E2E framework - no visual-regression baselines, no
// CI wiring, Chromium only. Requires both dev servers already running
// (backend on :4000, frontend on :5173 - see docs/TESTING.md §1).
export default defineConfig({
  testDir: './e2e-screenshots',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: 'e2e-screenshots/.auth/admin.json' },
      dependencies: ['setup'],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
