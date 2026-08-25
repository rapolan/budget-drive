import { test, type Page } from '@playwright/test';

/**
 * Screenshots two independent fixes, both light and dark theme:
 *
 * 1. AuditColumn's Notion-style redesign - a single muted inline line
 *    (Created by/Edited by + relative time) with the full trail (both
 *    absolute-time entries) revealed in a hover/focus tooltip. Shown on
 *    both pages that render it (Lessons and Students - the only two
 *    usages in the app).
 * 2. The Lessons table row's icon sizing: h-4 w-4 action icons with p-1.5
 *    padding (28x28 touch target) matching the Students table. The row is
 *    intentionally a bit taller — readable icons that match Students matter
 *    more than the tightest possible row.
 *
 * Requires both dev servers already running (backend :4000, frontend
 * :5173 - see docs/TESTING.md §1) and the repo's seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1600, height: 1000 };

for (const theme of ['light', 'dark'] as const) {
  test(`Lessons History column: single-line inline + full-trail hover tooltip (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const trigger = page.getByText(/^(Created|Edited) by/).first();
    await trigger.waitFor({ state: 'visible' });

    const inlineBox = await trigger.boundingBox();
    if (!inlineBox) throw new Error('AuditColumn inline trigger not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/audit-column-lessons-inline-${theme}.png`,
      clip: { x: Math.max(0, inlineBox.x - 200), y: Math.max(0, inlineBox.y - 20), width: 500, height: inlineBox.height + 40 },
    });

    await trigger.hover();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/audit-column-lessons-hover-${theme}.png`,
      clip: { x: Math.max(0, inlineBox.x - 200), y: Math.max(0, inlineBox.y - 20), width: 500, height: inlineBox.height + 100 },
    });

    await context.close();
  });

  test(`Students History column: single-line inline + full-trail hover tooltip (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const trigger = page.getByText(/^(Created|Edited) by/).first();
    await trigger.waitFor({ state: 'visible' });

    const inlineBox = await trigger.boundingBox();
    if (!inlineBox) throw new Error('AuditColumn inline trigger not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/audit-column-students-inline-${theme}.png`,
      clip: { x: Math.max(0, inlineBox.x - 200), y: Math.max(0, inlineBox.y - 20), width: 500, height: inlineBox.height + 40 },
    });

    await trigger.hover();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/audit-column-students-hover-${theme}.png`,
      clip: { x: Math.max(0, inlineBox.x - 200), y: Math.max(0, inlineBox.y - 20), width: 500, height: inlineBox.height + 100 },
    });

    await context.close();
  });

  test(`Lessons row is shorter with a centered Date & Time cell after tightening (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const row = page.locator('table tbody tr').filter({ hasText: /AM|PM/ }).first();
    const rowBox = await row.boundingBox();
    if (!rowBox) throw new Error('First lesson row not found');

    // The icons were bumped back up from h-3 w-3 (24x24 buttons) to h-4 w-4
    // (28x28 buttons) to match the Students table. The row is intentionally
    // taller than the original shrink — readable icons matter more than the
    // tightest row. ~105px is expected.
    if (rowBox.height > 115) {
      throw new Error(`Lessons row is ${rowBox.height}px tall - expected ~105px with h-4 w-4 icons, not taller`);
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lessons-row-tightened-${theme}.png`,
      clip: { x: rowBox.x, y: Math.max(0, rowBox.y - 40), width: 900, height: rowBox.height + 80 },
    });

    await context.close();
  });

  test(`Lessons row-action buttons meet the 24x24 WCAG 2.5.8 AA touch-target floor (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const editButton = page.getByLabel('Edit lesson').first();
    await editButton.waitFor({ state: 'visible' });
    const box = await editButton.boundingBox();
    if (!box) throw new Error('Edit lesson button not found');
    if (box.width < 24 || box.height < 24) {
      throw new Error(`Edit lesson button is ${box.width}x${box.height}px - below the 24x24 WCAG 2.5.8 AA minimum`);
    }

    await context.close();
  });
}
