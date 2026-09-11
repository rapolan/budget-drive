import { test, type Page } from '@playwright/test';

/**
 * StudentModal's needs-attention summary: reasons a student is flagged
 * (needs guardian / fee due / follow-up / no-show) now surface at the top
 * of the detail view, integrated into the header near the name - not only
 * as a hover tooltip on the Students list row badge. Reuses the exact
 * same computation (studentStatus.ts's getNeedsAttentionReasons) the list
 * row already uses, so the two surfaces can never disagree.
 *
 * Requires both dev servers already running (backend :4000, frontend
 * :5173 - see docs/TESTING.md §1) and dev-database data giving:
 * - Chloe Ramirez: THREE reasons (needs guardian, fee due, no-show
 *   follow-up) - the multi-reason case.
 * - a student with exactly one reason (Diego Fuentes originally had a
 *   fee-due-only case; if that's since drifted, any single-reason
 *   student works) - the single-reason case.
 * - any ordinary student with none - the no-section case.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1200, height: 900 };

for (const theme of ['light', 'dark'] as const) {
  test(`StudentModal shows a single needs-attention reason at the top of the header (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByText('Diego Fuentes').first().click();
    await page.waitForTimeout(500);

    const header = page.locator('h2', { hasText: 'Diego Fuentes' }).locator('..').locator('..');
    await header.waitFor({ state: 'visible' });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/student-modal-attention-single-${theme}.png`,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: 220 },
    });

    await context.close();
  });

  test(`StudentModal shows multiple needs-attention reasons as a compact set, not stacked banners (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByText('Chloe Ramirez').first().click();
    await page.waitForTimeout(500);

    const header = page.locator('h2', { hasText: 'Chloe Ramirez' }).locator('..').locator('..');
    await header.waitFor({ state: 'visible' });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/student-modal-attention-multiple-${theme}.png`,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: 220 },
    });

    await context.close();
  });

  test(`StudentModal shows no needs-attention section (and no layout gap) for a student with none (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByText('Marcus Lee').first().click();
    await page.waitForTimeout(500);

    const header = page.locator('h2', { hasText: 'Marcus Lee' }).locator('..').locator('..');
    await header.waitFor({ state: 'visible' });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/student-modal-attention-none-${theme}.png`,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: 220 },
    });

    await context.close();
  });
}
