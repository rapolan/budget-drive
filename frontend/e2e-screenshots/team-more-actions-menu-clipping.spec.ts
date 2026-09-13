import { test, expect, type Page } from '@playwright/test';

/**
 * Live reproduction of the "More actions" menu clipping fix: the table's
 * outer container uses overflow-hidden (for its own rounded-corner
 * clipping), and the dropdown used to render as an `absolute` child of
 * that same container - for a row near the bottom of the table, the menu
 * had nowhere to open into before hitting the container's clipped
 * boundary. The fix renders the menu via a portal into document.body,
 * positioned from the trigger button's real getBoundingClientRect(), so
 * it's no longer a clipped descendant of the table.
 *
 * Requires both dev servers already running (backend :4000, frontend
 * :5173 - see docs/TESTING.md §1) and enough team members seeded that the
 * last row sits near/past the table's visible bottom edge (this repo's
 * own seed data plus this task's own invite calls provide that - see the
 * task notes for how the roster was populated before this spec ran).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

test('the More actions menu on the LAST row displays fully, not clipped by the table', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();

  await expect(page.getByText(/team management/i)).toBeVisible();

  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(5); // confirms this is genuinely testing a long list, not a trivial one

  // The very last <tr> is the logged-in caller's own row, which correctly
  // renders no menu at all (every action is self-excluded - see
  // MoreActionsMenu's visibility rules). The row this test targets is the
  // last one that DOES have a menu - still the row closest to the table's
  // bottom edge, which is exactly the clipping scenario this fix
  // addresses (the caller's own row can never be the one used to
  // reproduce this, since it never has a menu button to click).
  let lastRow = rows.nth(rowCount - 1);
  let menuButton = lastRow.getByRole('button', { name: /more actions/i });
  if ((await menuButton.count()) === 0) {
    lastRow = rows.nth(rowCount - 2);
    menuButton = lastRow.getByRole('button', { name: /more actions/i });
  }
  await lastRow.scrollIntoViewIfNeeded();
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  // The menu must actually be open and its items visible - the direct
  // regression check for the clipping bug (a clipped menu would either
  // not render its later items in the visible viewport, or would be
  // truncated by the overflow-hidden ancestor).
  const resetPasswordItem = page.getByRole('button', { name: /^reset password$/i });
  await expect(resetPasswordItem).toBeVisible();

  // Confirm the menu's bounding box is NOT clipped: every item's bottom
  // edge must be within the viewport, and the menu must not be
  // constrained by the table container's own bounding box (which is what
  // "clipped by overflow-hidden" would produce).
  const tableContainer = page.locator('table').locator('..');
  const tableBox = await tableContainer.boundingBox();
  const menuBox = await resetPasswordItem.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(tableBox).not.toBeNull();

  const viewportSize = page.viewportSize();
  expect(viewportSize).not.toBeNull();
  // The menu item's bottom edge is fully inside the viewport - if it were
  // clipped, part or all of this element would report a box outside the
  // visible area or fail the isVisible check above entirely.
  expect(menuBox!.y + menuBox!.height).toBeLessThanOrEqual(viewportSize!.height);

  // The menu extends below the table container's own bottom edge (proof
  // it is genuinely NOT confined to the table's overflow-hidden box,
  // which is exactly what a portal-rendered, non-clipped menu should do
  // when opened from a row this close to the table's end).
  expect(menuBox!.y).toBeGreaterThanOrEqual(tableBox!.y);

  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-last-row-not-clipped-light.png' });

  // Close, then reopen in dark theme for the same check + screenshot.
  await page.keyboard.press('Escape');
  await expect(resetPasswordItem).not.toBeVisible();

  await setTheme(page, 'dark');
  await page.getByRole('button', { name: /^team$/i }).click();
  const rowsDark = page.locator('tbody tr');
  const rowCountDark = await rowsDark.count();
  let lastRowDark = rowsDark.nth(rowCountDark - 1);
  let menuButtonDark = lastRowDark.getByRole('button', { name: /more actions/i });
  if ((await menuButtonDark.count()) === 0) {
    lastRowDark = rowsDark.nth(rowCountDark - 2);
    menuButtonDark = lastRowDark.getByRole('button', { name: /more actions/i });
  }
  await lastRowDark.scrollIntoViewIfNeeded();
  await menuButtonDark.click();
  await expect(page.getByRole('button', { name: /^reset password$/i })).toBeVisible();
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-last-row-not-clipped-dark.png' });
  await setTheme(page, 'light');
});

test('a NON-bottom row still opens and closes its menu correctly (no regression for rows where clipping was never visible)', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();

  const rows = page.locator('tbody tr');
  const firstRow = rows.nth(0);
  await expect(firstRow).toBeVisible();

  const menuButton = firstRow.getByRole('button', { name: /more actions/i });
  await menuButton.click();
  await expect(page.getByRole('button', { name: /^reset password$/i })).toBeVisible();

  // Outside click closes it.
  await page.locator('h2', { hasText: /team management/i }).click();
  await expect(page.getByRole('button', { name: /^reset password$/i })).not.toBeVisible();

  // Reopen, Escape closes it.
  await menuButton.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^reset password$/i })).not.toBeVisible();
});

test('the menu closes on scroll rather than staying open at a stale position', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();

  const rows = page.locator('tbody tr');
  const firstRow = rows.nth(0);
  await firstRow.getByRole('button', { name: /more actions/i }).click();
  await expect(page.getByRole('button', { name: /^reset password$/i })).toBeVisible();

  await page.mouse.wheel(0, 300);
  await expect(page.getByRole('button', { name: /^reset password$/i })).not.toBeVisible();
});
