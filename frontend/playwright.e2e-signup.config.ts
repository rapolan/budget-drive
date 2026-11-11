import { defineConfig, devices } from '@playwright/test';

// Standalone config for signup-onboarding-e2e.spec.ts only - that spec
// creates its own account via signup itself and needs no pre-seeded admin
// session, so it must NOT depend on auth.setup.ts's chromium project
// (which requires an admin@budgetdrivingschool.com row this throwaway DB
// never seeds). Not part of the shared playwright.config.ts projects list
// for that reason. Delete this file once the live verification run this
// spec exists for is no longer needed, or keep it if the spec itself is
// kept as a record alongside the other e2e-screenshots specs.
export default defineConfig({
  testDir: './e2e-screenshots',
  testMatch: /signup-onboarding-e2e\.spec\.ts/,
  timeout: 60_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    ...devices['Desktop Chrome'],
  },
});
