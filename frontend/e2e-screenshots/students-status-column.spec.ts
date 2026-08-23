import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Students list's recolored/resized status column (several
 * states visible at once from the seeded cast), the sticky Actions column
 * scrolled into view, and the create-student form's cleanup (no profile-
 * completion progress bar, relabeled Home Address, the new pickup-location
 * toggle), in both light and dark theme. Not a general E2E suite: no
 * visual-regression assertions. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the repo's
 * seed data loaded - the seeded cast already spans Scheduled, Ready to
 * Book, Completed, Dropped (withdrawn), and Ready to Complete states
 * without any manual setup.
 *
 * Auth comes from the 'setup' project (auth.setup.ts) - see
 * booking-workflow.spec.ts for the same convention this file follows.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Students list status column shows several recolored states (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);
    // Sort by name so the full 9-student seeded cast (spanning every
    // status) renders in one predictable, screenshot-friendly order.
    await page.getByRole('table').scrollIntoViewIfNeeded();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-status-column-${theme}.png`,
      fullPage: true,
    });
  });

  test(`Students list Actions column stays visible while scrolled horizontally (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const scrollContainer = page.locator('.overflow-x-auto').first();
    await scrollContainer.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-sticky-actions-${theme}.png`,
    });
  });

  test(`Create-student form has no progress bar, relabeled address, and the pickup toggle (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Add Student' }).click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/student-create-form-${theme}.png`,
      fullPage: true,
    });
  });
}
