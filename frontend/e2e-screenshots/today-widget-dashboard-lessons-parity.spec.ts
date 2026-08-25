import { test, type Page } from '@playwright/test';

/**
 * Screenshots item 3's fix: TodaysScheduleWidget renders identically on
 * the Dashboard and the Lessons page for the same day, both light and
 * dark theme - specifically the "all done" celebration and the
 * completion progress bar, which previously only appeared on the
 * Dashboard (via its own hand-rolled, incorrect copy of the widget) and
 * never matched the real shared widget's behavior on Lessons.
 *
 * Reproduced live before fixing: Dashboard showed "All done for today!
 * 2/2" for two lessons that were still status: 'scheduled' (its
 * completedLessons check was lesson.endTime <= now, a clock inference),
 * while the Lessons page's real TodaysScheduleWidget correctly showed
 * "0/2 complete" with those same two lessons under "Upcoming" - and the
 * Dashboard's own "Lessons Need Review" alert simultaneously listed
 * those same 2 lessons as still needing a status, contradicting its own
 * "all done" claim.
 *
 * Fix: Dashboard now renders the actual shared TodaysScheduleWidget
 * (same component, same props shape as Lessons.tsx's own usage) instead
 * of a hand-rolled duplicate - "completed" everywhere means status ===
 * 'completed', never a clock inference.
 *
 * Not a general E2E suite. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1). This spec
 * itself drives today's real seeded lessons to completion via the
 * Lessons page's own "Mark as completed" action (an idempotent,
 * data-mutating precondition - matching how earlier specs in this
 * cluster create real test data) so that the "all done" state being
 * screenshotted is genuine, not mocked.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

async function completeAllOfTodaysLessons(page: Page) {
  await page.goto('/lessons');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Today', exact: true }).first().click();
  await page.waitForTimeout(400);

  for (let i = 0; i < 10; i++) {
    const completeButtons = page.getByTitle('Mark as completed');
    const count = await completeButtons.count();
    if (count === 0) break;
    page.once('dialog', (d) => d.accept());
    await completeButtons.first().click();
    await page.waitForTimeout(600);
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`Today's Schedule shows the same "all done" celebration and progress bar on Lessons (${theme})`, async ({ page }) => {
    await completeAllOfTodaysLessons(page);
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const widget = page.getByText("Today's Schedule").locator('..');
    await widget.scrollIntoViewIfNeeded();

    await page.getByText(/all lessons completed for today/i).waitFor({ state: 'visible' });
    const completeLabel = page.locator('text=/\\d+\\/\\d+ complete/');
    await completeLabel.waitFor({ state: 'visible' });
    const text = await completeLabel.textContent();
    const match = text?.match(/(\d+)\/(\d+) complete/);
    if (!match || match[1] !== match[2]) {
      throw new Error(`Expected a fully-complete ratio (N/N), got "${text}"`);
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/today-widget-parity-lessons-${theme}.png`,
      fullPage: false,
    });
  });

  test(`Today's Schedule shows the same "all done" celebration and progress bar on Dashboard (${theme})`, async ({ page }) => {
    await completeAllOfTodaysLessons(page);

    await page.goto('/dashboard');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByText(/all lessons completed for today/i).waitFor({ state: 'visible' });
    const completeLabel = page.locator('text=/\\d+\\/\\d+ complete/');
    await completeLabel.waitFor({ state: 'visible' });
    const text = await completeLabel.textContent();
    const match = text?.match(/(\d+)\/(\d+) complete/);
    if (!match || match[1] !== match[2]) {
      throw new Error(`Expected a fully-complete ratio (N/N), got "${text}"`);
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/today-widget-parity-dashboard-${theme}.png`,
      fullPage: false,
    });
  });
}
