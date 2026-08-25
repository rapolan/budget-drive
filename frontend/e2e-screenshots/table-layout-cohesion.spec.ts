import { test, type Page } from '@playwright/test';

/**
 * Screenshots for the table-layout-cohesion fix:
 *
 * 1. Matched icon size: Lessons and Students row-action icons both use
 *    h-4 w-4 at p-1.5 padding (28×28px touch targets). We hover a row
 *    on each page to reveal the action icons and screenshot them.
 *
 * 2. Tightened right edge: the last column (History) on both tables now
 *    uses pl-6 pr-2 instead of px-6, reducing the trailing gap from
 *    24px to 8px. We scroll each table fully right and screenshot.
 *
 * Both themes captured for each.
 *
 * Requires both dev servers already running (backend :4000, frontend
 * :5173 — see docs/TESTING.md §1) and the repo's seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1600, height: 1000 };

for (const theme of ['light', 'dark'] as const) {
  // ── 1. Matched icon size ──────────────────────────────────────────────

  test(`Lessons row-action icons (h-4 w-4, matched to Students) — ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    // On touch contexts the action buttons are always visible (no hover needed)
    const editButton = page.getByLabel('Edit lesson').first();
    await editButton.waitFor({ state: 'visible' });
    const editBox = await editButton.boundingBox();
    if (!editBox) throw new Error('Lessons Edit button not found');

    // Screenshot the first row showing the action icons
    const row = page.locator('table tbody tr').filter({ hasText: /AM|PM/ }).first();
    const rowBox = await row.boundingBox();
    if (!rowBox) throw new Error('First lesson row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/table-cohesion-lessons-icons-${theme}.png`,
      clip: { x: rowBox.x, y: Math.max(0, rowBox.y - 10), width: 600, height: rowBox.height + 20 },
    });
    await context.close();
  });

  test(`Students row-action icons (h-4 w-4, reference) — ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    // On touch contexts the action buttons are always visible
    const editButton = page.getByLabel('Edit student').first();
    await editButton.waitFor({ state: 'visible' });
    const editBox = await editButton.boundingBox();
    if (!editBox) throw new Error('Students Edit button not found');

    const row = page.locator('table tbody tr').first();
    const rowBox = await row.boundingBox();
    if (!rowBox) throw new Error('First student row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/table-cohesion-students-icons-${theme}.png`,
      clip: { x: rowBox.x, y: Math.max(0, rowBox.y - 10), width: 600, height: rowBox.height + 20 },
    });
    await context.close();
  });

  // ── 2. Tightened right edge (scrolled fully right) ────────────────────
  //
  // History is `hidden lg:table-cell` - it only renders (and is only the
  // true last column) at >=1024px viewport width. A narrower viewport
  // would make Status the visually-last column instead, so a right-edge
  // check there wouldn't be testing the fix this task actually asked for.

  test(`Lessons table right edge tightened (scrolled right) — ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const scrollable = page.locator('div.overflow-x-auto').first();
    await scrollable.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(300);

    const scrollableBox = await scrollable.boundingBox();
    const lastCell = page.locator('table tbody tr').filter({ hasText: /AM|PM/ }).first().locator('td').last();
    const cellBox = await lastCell.boundingBox();
    if (!scrollableBox || !cellBox) throw new Error('Scrollable container or last cell not found');

    // The regression this guards: before this fix, the trailing gap
    // (scrollable container's right edge minus the last column's content)
    // was ~24px (px-6). It should now be small and tight (~8px, pr-2).
    const trailingGap = (scrollableBox.x + scrollableBox.width) - (cellBox.x + cellBox.width);
    if (trailingGap > 16) {
      throw new Error(`Lessons table's trailing right gap is ${trailingGap}px - expected the tightened ~8px, not the old ~24px`);
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/table-cohesion-lessons-right-edge-${theme}.png`,
      clip: { x: Math.max(0, scrollableBox.x + scrollableBox.width - 300), y: scrollableBox.y, width: 300, height: 250 },
    });
    await context.close();
  });

  test(`Students table right edge tightened (scrolled right) — ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const scrollable = page.locator('div.overflow-x-auto').first();
    await scrollable.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(300);

    const scrollableBox = await scrollable.boundingBox();
    const lastCell = page.locator('table tbody tr').first().locator('td').last();
    const cellBox = await lastCell.boundingBox();
    if (!scrollableBox || !cellBox) throw new Error('Scrollable container or last cell not found');

    const trailingGap = (scrollableBox.x + scrollableBox.width) - (cellBox.x + cellBox.width);
    if (trailingGap > 16) {
      throw new Error(`Students table's trailing right gap is ${trailingGap}px - expected the tightened ~8px, not the old ~24px`);
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/table-cohesion-students-right-edge-${theme}.png`,
      clip: { x: Math.max(0, scrollableBox.x + scrollableBox.width - 300), y: scrollableBox.y, width: 300, height: 250 },
    });
    await context.close();
  });
}
