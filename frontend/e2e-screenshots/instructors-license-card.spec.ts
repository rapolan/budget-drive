import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots the Instructors page's "Licenses Expiring Soon" summary card
 * (replacing the old, non-actionable "Avg Hourly Rate" card) in both light
 * and dark theme, and confirms clicking it filters the list. Requires both
 * dev servers already running (backend :4000, frontend :5173 - see
 * docs/TESTING.md §1) and the repo's seed data loaded (expired-license
 * instructors from last session's work).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Instructors page shows Licenses Expiring Soon instead of Avg Hourly Rate (${theme})`, async ({ page }) => {
    await page.goto('/instructors');
    await setTheme(page, theme);

    await expect(page.getByText('Licenses Expiring Soon')).toBeVisible();
    await expect(page.getByText('Avg Hourly Rate')).not.toBeVisible();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/instructors-license-card-${theme}.png`,
    });
  });
}

test('clicking the Licenses Expiring Soon card filters the instructor list', async ({ page }) => {
  await page.goto('/instructors');

  const card = page.getByText('Licenses Expiring Soon').locator('../..');
  await card.click();

  // Seed data has multiple instructors with an expired/missing license
  // from last session's work - the filtered list should show at least one
  // "License Expired" pill and exclude Roberto (valid license).
  await expect(page.getByText('License Expired').first()).toBeVisible();
});
