import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Today's Schedule widget's Now/Upcoming section, both
 * light and dark theme.
 *
 * Reproduced live first (data level): confirmed via the seeded data that
 * two lessons ("Gigi Polan" and "Owen Castillo") share an identical
 * start/end time today - exactly the scenario the task described. The
 * classification BUG itself (only the first same-start-time lesson
 * showing "Now", the second silently falling through to plain
 * "Upcoming") is a pure function of TodaysScheduleWidget's own
 * currentTime-vs-lesson-time comparison logic and does not depend on
 * which lesson happens to sort first - so it's verified precisely and
 * deterministically in TodaysScheduleWidget.test.tsx (which freezes
 * tenantNow.currentTime and asserts BOTH same-start-time lessons render
 * under "Now", using these same two student names), rather than by
 * fighting real wall-clock alignment in a live Playwright run: the
 * seeded lesson window (11:00-13:00) may or may not overlap "now" at
 * the moment this spec runs, but the fix does not depend on that -
 * .filter() (not .find()) is used unconditionally, at every point in
 * time.
 *
 * This spec documents the live page state (whatever it is when this
 * runs) as a visual record; the unit test is the authoritative
 * regression guard for the exact classification bug.
 *
 * Not a general E2E suite. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the
 * repo's seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Today's Schedule widget renders correctly (${theme})`, async ({ page }) => {
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const widget = page.getByText("Today's Schedule").locator('..');
    await widget.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/today-widget-now-upcoming-${theme}.png`,
      fullPage: false,
    });
  });
}
