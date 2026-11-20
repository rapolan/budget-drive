import { test, type Page } from '@playwright/test';

/**
 * Screenshots the new LessonDetailsPanel (lesson-edit-redesign Group C),
 * both light and dark theme - the edit entry point for an existing
 * lesson's non-schedule fields (notes, cost, pickup, vehicle) plus status
 * transitions and a Reschedule link. Replaces the old LessonModal, which
 * this spec's own earlier counterpart (if any) would have screenshotted
 * instead.
 *
 * Not a general E2E suite: no visual-regression assertions beyond the
 * structural check below. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the repo's
 * seed data loaded, with at least one scheduled lesson to click Edit on.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1400, height: 900 };

for (const theme of ['light', 'dark'] as const) {
  test(`Lesson details panel - edit entry point for an existing lesson (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const editButton = page.getByRole('button', { name: /edit lesson/i }).first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();
    await page.waitForTimeout(800);

    const card = page.locator('.overflow-y-auto.rounded-3xl').first();
    await card.waitFor({ state: 'visible' });

    // Confirm this is genuinely the details panel, not the old flat form -
    // no student/instructor <select> should exist anywhere in it.
    const studentSelect = card.locator('select[name="studentId"]');
    if (await studentSelect.count() > 0) {
      throw new Error('A studentId select still renders - this looks like the old LessonModal, not LessonDetailsPanel');
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lesson-details-panel-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
