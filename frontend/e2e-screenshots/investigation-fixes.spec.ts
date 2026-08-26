import { test, type Page } from '@playwright/test';

/**
 * Screenshots the two investigation fixes, both light and dark theme:
 *
 * 1. TodaysScheduleWidget no longer buckets a past-due (still
 *    'scheduled', end time already passed) lesson under "Upcoming" -
 *    it gets its own "Needs marking" treatment instead, agreeing with
 *    the Dashboard's "Lessons Need Review" alert for the same lesson.
 *
 * 2. computeStudentStatus no longer fails to classify a same-day
 *    booking as "Scheduled" - the UTC-midnight-vs-local-midnight Date
 *    comparison was replaced with a calendar-date string comparison.
 *
 * Not a general E2E suite. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the
 * repo's dev DB state left over from the investigation session: two
 * students ("AutoCompleteRepro Test", "Test Booker55169") each with a
 * lesson dated today whose time window has already passed and is still
 * status: 'scheduled'.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Today's Schedule shows a past-due lesson as "Needs marking", not "Upcoming" (${theme})`, async ({ page }) => {
    await page.goto('/dashboard');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByText(/needs marking/i).first().waitFor({ state: 'visible' });

    const upcomingHeader = page.getByText(/^upcoming$/i);
    if (await upcomingHeader.isVisible().catch(() => false)) {
      throw new Error('A past-due lesson is still showing under "Upcoming" - regression');
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/widget-past-due-needs-marking-${theme}.png`,
      fullPage: false,
    });
  });

  test(`A same-day booking shows "Scheduled" on the Students page, not "Ready to Book" (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const row = page.locator('table tbody tr').filter({ hasText: 'Test Booker55169' }).first();
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const readyToBookBadge = row.getByText(/ready to book/i);
    if (await readyToBookBadge.isVisible().catch(() => false)) {
      throw new Error('A student with a same-day lesson still shows "Ready to Book" - regression');
    }

    await row.getByText(/^scheduled/i).waitFor({ state: 'visible' });

    const box = await row.boundingBox();
    if (!box) throw new Error('Test Booker55169 row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/same-day-booking-scheduled-${theme}.png`,
      clip: box,
    });
  });
}
