import { test, type Page } from '@playwright/test';

/**
 * Screenshots the "Ready to Complete" eligibility fix, both light and
 * dark theme.
 *
 * Reproduced live first: Jordan Vance (adult, lessons track, seeded with
 * 2 completed + 1 scheduled lesson) previously showed "Ready to
 * Complete" despite having an unfinished, still-scheduled lesson.
 * isReadyToMarkComplete only checked the completion bar
 * (lessonsCompleted >= 1), never whether any scheduled lesson remained.
 *
 * Fix: isReadyToMarkComplete now also requires zero remaining scheduled
 * lessons (a plain existence check on the caller's lessons list, not a
 * progress recalculation - computeStudentProgress remains the sole
 * source of the completion-bar math).
 *
 * Not a general E2E suite. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the
 * repo's seed data loaded (Jordan Vance: 2 completed + 1 scheduled).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Jordan Vance (adult, 1 scheduled lesson remaining) does NOT show Ready to Complete (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const row = page.locator('table tbody tr').filter({ hasText: 'Jordan Vance' }).first();
    await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const readyBadge = row.getByText(/ready to complete/i);
    const hasReadyBadge = await readyBadge.isVisible().catch(() => false);
    if (hasReadyBadge) {
      throw new Error('Jordan Vance still shows "Ready to Complete" despite having a scheduled lesson remaining');
    }

    const scheduledBadge = row.getByText(/scheduled/i);
    await scheduledBadge.waitFor({ state: 'visible' });

    const box = await row.boundingBox();
    if (!box) throw new Error('Jordan Vance row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/ready-to-complete-jordan-vance-${theme}.png`,
      clip: box,
    });
  });
}
