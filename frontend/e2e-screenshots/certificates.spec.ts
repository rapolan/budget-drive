import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Certificates page (awaiting-certificate worklist + the
 * Issued/Void count tiles) and a student's Enrollments tab showing a
 * recorded certificate's gold badge, in both light and dark theme. Not a
 * general E2E suite: no visual-regression assertions. Requires both dev
 * servers already running (backend :4000, frontend :5173 - see
 * docs/TESTING.md §1) and the repo's seed data loaded, PLUS at least one
 * completed minor driver_training enrollment with no certificate yet (for
 * the worklist row) and at least one completed enrollment with a
 * certificate already recorded (for the gold badge) - the plain seed data
 * has neither by default, since seeded enrollments start active. See
 * docs/TESTING.md §2.46/§2.47 for the manual steps to produce this state
 * if running this spec cold.
 *
 * Auth comes from the 'setup' project (auth.setup.ts) - see
 * booking-workflow.spec.ts for the same convention this file follows.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Certificates page shows the worklist and Issued/Void tiles (${theme})`, async ({ page }) => {
    await page.goto('/certificates');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/certificates-worklist-${theme}.png`,
      fullPage: true,
    });
  });

  test(`Student record shows a recorded certificate's gold badge (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(600);

    await page.getByText('Olivia Garcia').first().click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Enrollments' }).click();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/certificate-gold-badge-${theme}.png`,
      fullPage: true,
    });
  });
}
