import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Today's Schedule widget's fixed completion-bar
 * denominator, both light and dark theme.
 *
 * Reproduced live before fixing: the widget showed "0/3 complete" with
 * today's real seeded data, even though only 2 of today's 3 lessons
 * were scheduled (the group header elsewhere on the same page correctly
 * showed "Today 2"). Root cause: totalLessons = lessons.length counted
 * every lesson for today regardless of status, including one that was
 * cancelled/no-show - a lesson that can never become "completed", so
 * the bar could never reach 100% and the ratio was wrong. "Today" itself
 * was already correctly resolved in tenant time (Lessons.tsx filters by
 * tenantNow.today before ever passing lessons to the widget) - the bug
 * was purely which statuses count toward the denominator, not the date
 * filter.
 *
 * Fix: totalLessons = scheduledLessons.length + completedLessons.length
 * (excludes cancelled/no_show, which can never complete).
 *
 * Not a general E2E suite. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the
 * repo's seed data loaded (today has 2 scheduled lessons plus at least
 * one cancelled/no-show lesson also dated today, to exercise the fix).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Today's Schedule completion bar reflects only actionable lessons, not the phantom cancelled/no-show one (${theme})`, async ({ page }) => {
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const widget = page.getByText("Today's Schedule").locator('..');
    await widget.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const completeLabel = page.locator('text=/\\d+\\/\\d+ complete/');
    await completeLabel.waitFor({ state: 'visible' });
    const text = await completeLabel.textContent();
    const match = text?.match(/(\d+)\/(\d+) complete/);
    if (!match) throw new Error(`Could not parse completion label: "${text}"`);
    const [, completed, total] = match.map(Number) as unknown as [number, number, number];

    // The regression this guards: seed data has 2 scheduled + 1 no-show
    // lesson today - the denominator must reflect only the 2 actionable
    // ones, never 3.
    if (total !== 2) {
      throw new Error(`Expected denominator 2 (2 scheduled lessons today, excluding the no-show), got ${total} ("${text}")`);
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/today-widget-denominator-fixed-${theme}.png`,
      fullPage: false,
    });
  });
}
