import { test, expect } from '@playwright/test';

/**
 * Screenshots LessonHistoryTimeline's 3-item cap + "Show all (N)" expander
 * on StudentModal's History tab, in both light and dark theme. Not a
 * general E2E suite: no visual-regression assertions, one spec file, four
 * PNGs. Requires both dev servers already running (backend :4000, frontend
 * :5173 - see docs/TESTING.md §1) and the repo's seed data loaded.
 */

const STUDENT_NAME = 'Sarah Johnson'; // seeded with 9 lessons - well over the 3-item cap

for (const theme of ['light', 'dark'] as const) {
  test(`lesson history caps to 3 with a "Show all (N)" expander (${theme})`, async ({ page }) => {
    // localStorage is only accessible once the page has navigated to the
    // app's origin - about:blank (the default new-page state) throws a
    // SecurityError on access.
    await page.goto('/students');
    await page.evaluate((t) => localStorage.setItem('theme', t), theme);
    await page.reload();

    const row = page.locator('tbody tr', { hasText: STUDENT_NAME });
    await row.locator('td').first().click();

    await page.getByRole('button', { name: /^history$/i }).click();
    await page.getByText('Lesson History').waitFor();

    const showAllButton = page.getByRole('button', { name: /show all \(\d+\)/i });
    await expect(showAllButton).toBeVisible();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lesson-history-collapsed-${theme}.png`,
    });

    await showAllButton.click();
    await expect(page.getByRole('button', { name: /show less/i })).toBeVisible();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lesson-history-expanded-${theme}.png`,
      fullPage: true,
    });
  });
}
