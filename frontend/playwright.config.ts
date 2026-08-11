import { defineConfig, devices } from '@playwright/test';

// Minimal, from-scratch setup scoped strictly to capturing the booking-
// workflow screenshots (frontend/e2e-screenshots/booking-workflow.spec.ts).
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
