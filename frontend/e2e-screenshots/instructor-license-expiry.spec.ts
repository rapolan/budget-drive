import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots the Dashboard's "Instructor Licenses" alert tile and the
 * Instructors list showing per-instructor license expiry status, in both
 * light and dark theme. Not a general E2E suite: no visual-regression
 * assertions. Requires both dev servers already running (backend :4000,
 * frontend :5173 - see docs/TESTING.md §1) and the repo's seed data loaded.
 *
 * Uses the seeded data as-is (John Smith and Maria Rodriguez both have a
 * past instructor_license_expiration; Roberto Alejandro Polan's is far in
 * the future) - no setup/teardown mutation needed, unlike
 * instructor-service-areas.spec.ts. The InstructorModal pill itself is
 * covered by InstructorModal.test.tsx, not here.
 *
 * Auth comes from the 'setup' project (auth.setup.ts) - see
 * booking-workflow.spec.ts for the same convention this file follows.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Dashboard shows the Instructor Licenses alert tile (${theme})`, async ({ page }) => {
    await page.goto('/');
    await setTheme(page, theme);

    const tile = page.getByText('Instructor Licenses', { exact: true });
    await tile.waitFor();

    const alertsCard = tile.locator('xpath=ancestor::div[contains(@class, "rounded-2xl") or contains(@class, "rounded-xl")][1]/..');
    const screenshotTarget = (await alertsCard.count()) > 0 ? alertsCard : tile.locator('..').locator('..');

    await screenshotTarget.first().screenshot({
      path: `e2e-screenshots/__screenshots__/dashboard-license-alert-${theme}.png`,
    });
  });

  test(`Instructors list shows license expiry status in table view (${theme})`, async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/instructors');
    await setTheme(page, theme);

    await expect(page.getByRole('columnheader', { name: 'License' })).toBeVisible();
    await expect(page.getByText('License Expired').first()).toBeVisible();

    const table = page.locator('table');
    await table.scrollIntoViewIfNeeded();
    await table.screenshot({
      path: `e2e-screenshots/__screenshots__/instructors-list-license-status-${theme}.png`,
    });
  });
}
