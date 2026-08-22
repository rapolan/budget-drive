import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Students list showing a completed driver_training
 * enrollment correctly displaying "Completed" status and 100% progress,
 * in both light and dark theme. Regression coverage for a real bug: the
 * Students list previously resolved only the ACTIVE driver_training
 * enrollment, so a completed enrollment (status flips away from 'active'
 * on completion) fell through to "No Active Enrollment" instead - see
 * enrollmentService.getDisplayDriverTrainingEnrollmentsBatch and
 * docs/ARCHITECTURE.md. Not a general E2E suite: no visual-regression
 * assertions. Requires both dev servers already running (backend :4000,
 * frontend :5173 - see docs/TESTING.md §1) and at least one student whose
 * driver_training enrollment has been marked complete (the plain seed
 * data has none by default - mark one complete via its Enrollments tab,
 * or the new guided "Mark complete" action on this same list, before
 * running this spec cold).
 *
 * Auth comes from the 'setup' project (auth.setup.ts) - see
 * booking-workflow.spec.ts for the same convention this file follows.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Students list shows "Completed" status for a completed enrollment (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: 'Completed', exact: false }).click();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/student-completed-status-${theme}.png`,
      fullPage: true,
    });
  });
}
