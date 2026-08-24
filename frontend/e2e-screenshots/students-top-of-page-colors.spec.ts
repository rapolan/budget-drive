import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Students page's top-of-page summary stat cards and
 * filter chips, now reconciled to the same status-color tokens the status
 * column uses (Scheduled = blue/status-info, Ready to Book = green/
 * status-success, Completed = neutral gray - previously Scheduled and
 * Ready to Book were swapped, and Completed used an unrelated purple),
 * both light and dark theme. Not a general E2E suite: no visual-regression
 * assertions. Requires both dev servers already running (backend :4000,
 * frontend :5173 - see docs/TESTING.md §1) and the repo's seed data
 * loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Top-of-page stat cards and filter chips use the reconciled status colors (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByText('Ready to Book').first().waitFor({ state: 'visible' });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-top-of-page-colors-${theme}.png`,
      fullPage: false,
    });
  });
}
