import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots the Lessons calendar (monthly) view's new instructor filter,
 * in both light and dark theme, with a specific instructor selected -
 * matches the weekly view's existing filter (see
 * InstructorWeeklySchedule.tsx). Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1) and
 * the repo's seed data loaded (instructor "John Smith").
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`calendar view instructor filter (${theme})`, async ({ page }) => {
    await page.goto('/lessons');
    await setTheme(page, theme);

    await page.getByTitle('Month view').click();
    await expect(page.getByRole('button', { name: 'All Instructors' })).toBeVisible();

    await page.getByTitle('John Smith').click();
    await expect(page.getByTitle('John Smith')).toHaveClass(/bg-primary/);
    await expect(page.getByRole('button', { name: 'All Instructors' })).not.toHaveClass(/bg-primary/);

    const filterRow = page.getByTitle('John Smith').locator('../..');
    await filterRow.screenshot({
      path: `e2e-screenshots/__screenshots__/calendar-instructor-filter-${theme}.png`,
    });
  });
}
