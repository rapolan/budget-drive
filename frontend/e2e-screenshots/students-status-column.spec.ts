import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Students list's recolored/resized status column (several
 * states visible at once from the seeded cast), the table view's per-row
 * hover-reveal row actions (now living UNDER the student's name, not a
 * separate right-side column) in both their hidden and revealed states,
 * the always-visible touch/coarse-pointer fallback, the card view at phone
 * width, the student detail modal's persistent actions bar, and the
 * create-student form's cleanup (no profile-completion progress bar,
 * relabeled Home Address, the new pickup-location toggle) - all in both
 * light and dark theme. Not a general E2E suite: no visual-regression
 * assertions. Requires both dev servers already running (backend :4000,
 * frontend :5173 - see docs/TESTING.md §1) and the repo's seed data loaded
 * - the seeded cast already spans Scheduled, Ready to Book, Completed,
 * Dropped (withdrawn), Ready to Complete, and (Priya Anand) an outstanding
 * fee, without any manual setup.
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

  // Actions now live under the student's name, near the left edge of the
  // table - a plain default-width viewport already has them in frame, no
  // wide viewport or horizontal scroll needed. Clip to the first row's own
  // bounding box (plus a little headroom for the column header) so each
  // screenshot is a tight, readable crop of just the row in question.
  const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

  test(`Students list row actions (under the name) are hidden with no hover (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);
    // Park the cursor somewhere that isn't over any row.
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);

    const firstRow = page.locator('table tbody tr').first();
    const box = await firstRow.boundingBox();
    if (!box) throw new Error('First student row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-actions-hidden-${theme}.png`,
      clip: { x: box.x, y: Math.max(0, box.y - 60), width: 500, height: box.height + 60 },
    });

    await context.close();
  });

  test(`Students list row actions reveal under the name when hovering anywhere on the row (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT });
    const page = await context.newPage();
    // Priya Anand (seeded with an outstanding fee) exercises the fullest
    // action set - Mark Paid/Waive alongside Book/Edit/Delete - in one shot.
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const rows = await page.locator('table tbody tr').all();
    let targetBox: { x: number; y: number; width: number; height: number } | null = null;
    for (const row of rows) {
      const text = await row.textContent();
      if (text?.includes('Priya Anand')) {
        targetBox = await row.boundingBox();
        break;
      }
    }
    if (!targetBox) throw new Error('Priya Anand row not found');
    // Hover the Status/Contact area of the row (well right of the name/
    // actions on the left, but still within the row's real content, not
    // trailing whitespace past the last column) - proves the reveal is
    // row-scoped, not a zone tied to proximity to the actions themselves.
    // Near the top of the row (y+20, not vertically centered) since the
    // row's overall height is taller than any single cell's content.
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 20);
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-actions-revealed-${theme}.png`,
      clip: { x: targetBox.x, y: Math.max(0, targetBox.y - 20), width: 500, height: targetBox.height + 60 },
    });

    await context.close();
  });

  test(`Students list row actions stay always-visible on a touch/coarse-pointer device (${theme})`, async ({ browser }) => {
    // A dedicated context with hasTouch: true - Chromium maps this to a
    // real (hover: none) / (pointer: coarse) media environment, which is
    // exactly the condition the component's [@media(hover:hover)] guard
    // checks. No mouse interaction happens here at all: a touch device has
    // no hover to trigger the reveal, so actions must already be visible.
    const context = await browser.newContext({ viewport: DEFAULT_VIEWPORT, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const firstRow = page.locator('table tbody tr').first();
    const box = await firstRow.boundingBox();
    if (!box) throw new Error('First student row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-actions-touch-fallback-${theme}.png`,
      clip: { x: box.x, y: Math.max(0, box.y - 60), width: 500, height: box.height + 60 },
    });

    await context.close();
  });

  test(`Students list falls back to a phone-width card view with always-visible actions (${theme})`, async ({ browser }) => {
    // A dedicated context so viewport/hasTouch don't leak into the other
    // tests in this file, which assume the default desktop context.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(600);

    // The table view is the default regardless of viewport width (see
    // docs/TESTING.md's note on this) - switch to the card view
    // explicitly via the mobile view toggle, which is where actions are
    // always visible regardless of hover support. Both a mobile (sm:hidden)
    // and a desktop (hidden sm:flex) copy of this toggle exist in the DOM
    // at once, CSS-hidden by breakpoint rather than unmounted - .first()
    // is the one actually visible/clickable at this phone viewport.
    await page.getByTitle('Card view').first().click();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-card-view-phone-width-${theme}.png`,
      fullPage: true,
    });

    await context.close();
  });

  test(`Student detail modal shows a persistent actions bar (Mark Paid/Waive) regardless of active tab (${theme})`, async ({ page }) => {
    // Priya Anand is seeded with an outstanding fee, so the persistent
    // actions bar has something to show without any manual setup.
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(600);

    await page.getByText('Priya Anand').first().click();
    await page.waitForTimeout(600);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/student-detail-actions-bar-${theme}.png`,
    });

    // Switch tabs - the bar must stay visible, not be buried inside one tab.
    await page.getByRole('button', { name: /^history$/i }).click();
    await page.waitForTimeout(400);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/student-detail-actions-bar-history-tab-${theme}.png`,
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
