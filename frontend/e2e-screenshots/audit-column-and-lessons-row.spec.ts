import { test, type Page } from '@playwright/test';

/**
 * Screenshots two independent fixes, both light and dark theme:
 *
 * 1. AuditColumn's Notion-style redesign - a single muted inline line
 *    (Created by/Edited by + relative time) with the full trail (both
 *    absolute-time entries) revealed in a hover/focus tooltip. Shown on
 *    both pages that render it (Lessons and Students - the only two
 *    usages in the app).
 * 2. The Lessons table row's tightened height: smaller (24x24, the WCAG
 *    2.5.8 AA floor) row-action buttons and a vertically-centered Date &
 *    Time cell. Not a visual-regression suite - the row-height assertion
 *    below is the actual check that the row got shorter, not just a
 *    screenshot.
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

    // The regression this guards: before this fix the row measured 105px
    // (28px reserved action strip + p-1.5/h-3.5 buttons). After shrinking
    // the buttons to the 24x24 WCAG floor and tightening the strip's
    // margin, it should be visibly shorter.
    if (rowBox.height > 102) {
      throw new Error(`Lessons row is ${rowBox.height}px tall - expected the tightened height (~99px), not the old ~105px`);
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
