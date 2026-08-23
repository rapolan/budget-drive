import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Students list's recolored/resized status column (several
 * states visible at once from the seeded cast), the table view's per-row
 * hover-reveal Actions column in both its hidden and revealed states, the
 * always-visible touch/coarse-pointer fallback, the card view at phone
 * width, and the create-student form's cleanup (no profile-completion
 * progress bar, relabeled Home Address, the new pickup-location toggle) -
 * all in both light and dark theme. Not a general E2E suite: no visual-
 * regression assertions. Requires both dev servers already running
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

  // These three share a wide viewport (the table's Actions column sits
  // past the right edge of the default 1280px width otherwise) and clip
  // the screenshot to the first row's own bounding box, so the Actions
  // column is actually in frame rather than requiring a manual scroll.
  const WIDE_VIEWPORT = { width: 1600, height: 800 };

  test(`Students list table-view Actions are hidden with no hover (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: WIDE_VIEWPORT });
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
      clip: { x: 0, y: Math.max(0, box.y - 60), width: WIDE_VIEWPORT.width, height: box.height + 80 },
    });

    await context.close();
  });

  test(`Students list table-view Actions reveal when hovering anywhere on the row (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: WIDE_VIEWPORT });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const firstRow = page.locator('table tbody tr').first();
    const box = await firstRow.boundingBox();
    if (!box) throw new Error('First student row not found');
    // Hover the LEFT side of the row (student name area) - proves the
    // reveal is row-scoped, not a screen-edge-detection zone near the
    // actions themselves.
    await page.mouse.move(box.x + 60, box.y + box.height / 2);
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-actions-revealed-${theme}.png`,
      clip: { x: 0, y: Math.max(0, box.y - 60), width: WIDE_VIEWPORT.width, height: box.height + 80 },
    });

    await context.close();
  });

  test(`Students list table-view Actions stay always-visible on a touch/coarse-pointer device (${theme})`, async ({ browser }) => {
    // A dedicated context with hasTouch: true - Chromium maps this to a
    // real (hover: none) / (pointer: coarse) media environment, which is
    // exactly the condition the component's [@media(hover:hover)] guard
    // checks. No mouse interaction happens here at all: a touch device has
    // no hover to trigger the reveal, so actions must already be visible.
    const context = await browser.newContext({ viewport: WIDE_VIEWPORT, hasTouch: true });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const firstRow = page.locator('table tbody tr').first();
    const box = await firstRow.boundingBox();
    if (!box) throw new Error('First student row not found');
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-actions-touch-fallback-${theme}.png`,
      clip: { x: 0, y: Math.max(0, box.y - 60), width: WIDE_VIEWPORT.width, height: box.height + 80 },
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
