import { test, type Page } from '@playwright/test';

/**
 * Screenshots three independent Lessons-page fixes, both light and dark
 * theme:
 *
 * 1. The History column (AuditColumn) now populates real creator/editor
 *    names instead of "Unknown" - getAllLessons/getLessonById now LEFT
 *    JOIN users on created_by/updated_by, mirroring studentService's
 *    identical fix, and the seed now sets created_by/updated_by on every
 *    lesson row.
 * 2. The sticky right-side Actions column is replaced with the same
 *    hover-reveal pattern shipped on the Students list, anchored under
 *    Date & Time (a lesson row has no single "name" column) - shown
 *    hidden, revealed on hover, and always-visible on a touch device.
 * 3. The Table/Cards/Month/Weekly view toggle moved from the page header
 *    down into the filter bar next to the Status filters, so switching
 *    views never requires scrolling back to the top.
 *
 * Not a general E2E suite: no visual-regression assertions. Requires both
 * dev servers already running (backend :4000, frontend :5173 - see
 * docs/TESTING.md §1) and the repo's seed data loaded (every seeded
 * lesson now carries created_by/updated_by, so the History column has
 * something to resolve without any manual setup).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1600, height: 1000 };

for (const theme of ['light', 'dark'] as const) {
  test(`Lessons list History column shows resolved creator/editor names, not "Unknown" (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const firstRow = page.locator('table tbody tr').filter({ hasText: /AM|PM/ }).first();
    await firstRow.waitFor({ state: 'visible' });

    // The regression this guards: History previously always read "Unknown"
    // because getAllLessons never joined users, regardless of seed data.
    const rowText = await firstRow.textContent();
    if (rowText?.includes('Unknown')) {
      throw new Error('History column still shows "Unknown" - the users join or seed audit columns are missing');
    }

    const box = await firstRow.boundingBox();
    if (!box) throw new Error('First lesson row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lessons-history-column-${theme}.png`,
      clip: { x: box.x, y: Math.max(0, box.y - 60), width: box.width, height: box.height + 60 },
    });

    await context.close();
  });

  test(`Lessons list row actions (under Date & Time) are hidden with no hover (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);

    const firstRow = page.locator('table tbody tr').filter({ hasText: /AM|PM/ }).first();
    const box = await firstRow.boundingBox();
    if (!box) throw new Error('First lesson row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lessons-actions-hidden-${theme}.png`,
      clip: { x: box.x, y: Math.max(0, box.y - 20), width: 550, height: box.height + 40 },
    });

    await context.close();
  });

  test(`Lessons list row actions reveal under Date & Time when hovering the row (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const firstRow = page.locator('table tbody tr').filter({ hasText: /AM|PM/ }).first();
    const box = await firstRow.boundingBox();
    if (!box) throw new Error('First lesson row not found');

    // Near the top of the row, not vertically centered - matches the
    // Students list screenshot spec's empirically-confirmed reliable
    // hover position for this table layout.
    await page.mouse.move(box.x + box.width / 2, box.y + 20);
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lessons-actions-revealed-${theme}.png`,
      clip: { x: box.x, y: Math.max(0, box.y - 20), width: 550, height: box.height + 40 },
    });

    await context.close();
  });

  test(`Lessons list row actions stay always-visible on a touch/coarse-pointer device (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const firstRow = page.locator('table tbody tr').filter({ hasText: /AM|PM/ }).first();
    const box = await firstRow.boundingBox();
    if (!box) throw new Error('First lesson row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lessons-actions-touch-fallback-${theme}.png`,
      clip: { x: box.x, y: Math.max(0, box.y - 20), width: 550, height: box.height + 40 },
    });

    await context.close();
  });

  test(`Lessons list falls back to always-visible actions in card view (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    // The view toggle now lives in the filter bar (item 3), not the header.
    await page.getByTitle('Card view').click();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lessons-card-view-actions-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`View toggle sits in the filter bar, not the page header (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const statusLabel = page.getByText('Status:');
    await statusLabel.waitFor({ state: 'visible' });
    const tableToggle = page.getByTitle('Table view');
    await tableToggle.waitFor({ state: 'visible' });

    // The toggle must be inside the same filter-bar container as the
    // Status label, not up in the header next to "Book New Lesson".
    const statusBarBox = await statusLabel.locator('../..').boundingBox();
    const toggleBox = await tableToggle.boundingBox();
    if (!statusBarBox || !toggleBox) throw new Error('Filter bar or toggle not found');
    if (toggleBox.y < statusBarBox.y || toggleBox.y > statusBarBox.y + statusBarBox.height + 20) {
      throw new Error('View toggle is not vertically aligned with the Status filter bar');
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lessons-view-toggle-relocated-${theme}.png`,
      clip: { x: 0, y: 0, width: VIEWPORT.width, height: 650 },
    });

    await context.close();
  });
}
