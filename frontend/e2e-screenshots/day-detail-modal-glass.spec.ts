import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots the Lessons calendar (monthly) view's Day Detail Modal in
 * both light and dark theme, after aligning its chrome (backdrop,
 * container, header) to StudentModal's glass conventions - the same
 * treatment SmartBookingForm was aligned to previously. Visual only, no
 * behavior change - see DayDetailModal.tsx. Requires both dev servers
 * already running (backend :4000, frontend :5173 - see docs/TESTING.md §1)
 * and the repo's seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`day detail modal matches the app's glass modal treatment (${theme})`, async ({ page }) => {
    await page.goto('/lessons');
    await setTheme(page, theme);

    await page.getByTitle('Month view').click();
    await page.waitForTimeout(500);

    const dayWithActivity = page.locator('button.cursor-pointer').first();
    await dayWithActivity.click();

    const modal = page.locator('.rounded-3xl.bg-surface\\/80');
    await expect(modal).toBeVisible({ timeout: 10000 });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/day-detail-modal-glass-${theme}.png`,
    });
  });
}
