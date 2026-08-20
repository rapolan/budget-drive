import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots the Lessons weekly view immediately after opening it, in
 * both light and dark theme, showing the grid already scrolled so the
 * tenant's current day (plus the remainder of the week) is visible without
 * the admin needing to scroll - see InstructorWeeklySchedule.tsx's
 * scroll-to-today effect. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the repo's
 * seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`weekly view opens scrolled to today (${theme})`, async ({ page }) => {
    // Narrow enough that the 7-day grid overflows and would require
    // scrolling if today's column weren't brought into view on open.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/lessons');
    await setTheme(page, theme);

    await page.getByTitle('Weekly view').click();

    const todayHeader = page.locator('th', { hasText: 'TODAY' });
    await todayHeader.waitFor({ state: 'visible', timeout: 10000 });
    await todayHeader.scrollIntoViewIfNeeded();

    const box = await todayHeader.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(905);
    }

    const gridContainer = page.locator('.overflow-x-auto').filter({ has: page.locator('table') }).first();
    await gridContainer.scrollIntoViewIfNeeded();
    await gridContainer.screenshot({
      path: `e2e-screenshots/__screenshots__/weekly-view-scroll-to-today-${theme}.png`,
    });
  });
}
