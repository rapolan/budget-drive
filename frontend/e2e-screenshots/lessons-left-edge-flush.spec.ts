import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Lessons table's left-edge fix, both light and dark
 * theme: rows are now flush with the table's left edge, matching Students
 * and Instructors.
 *
 * Root cause, found by live measurement (className comparison alone
 * showed no difference - all three tables use identical px-6 on their
 * first column): Lessons.tsx mixes colSpan={7} date-group header rows
 * with regular per-lesson rows inside a table-layout: auto table under
 * Tailwind Preflight's default border-collapse: collapse - a well-known
 * browser rendering quirk where colSpan cells can shift the computed
 * left edge of the first real column by a sub-pixel-rounded amount (a
 * consistent, measured 2px here). Students and Instructors have no
 * colSpan rows and never hit this. Also cleaned up a stray extra
 * wrapper <div> left over from an earlier, reverted attempt at a
 * different scrollbar-gap fix - harmless on its own but not matching
 * Students'/Instructors' clean structure.
 *
 * Fix: border-separate border-spacing-0 on the Lessons table, which
 * removes collapse-mode's cell-border-merging math (the actual source
 * of the rounding) without needing table-layout: fixed (which would
 * require explicit column widths and change how content-driven columns
 * size themselves).
 *
 * Not a general E2E suite: the measurement assertion below is the real
 * check, screenshots are for visual confirmation. Requires both dev
 * servers already running (backend :4000, frontend :5173 - see
 * docs/TESTING.md §1) and the repo's seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1400, height: 1000 };

for (const theme of ['light', 'dark'] as const) {
  test(`Lessons table rows are flush with the left edge, matching Students and Instructors (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();

    const measureLeftInset = async (path: string): Promise<number> => {
      await page.goto(path);
      await setTheme(page, theme);
      await page.waitForTimeout(800);
      const table = page.locator('table').first();
      await table.scrollIntoViewIfNeeded();
      const tableBox = await table.boundingBox();
      const firstCell = page.locator('table tbody tr td').first();
      const cellBox = await firstCell.boundingBox();
      if (!tableBox || !cellBox) throw new Error(`Could not measure table/cell on ${path}`);
      return cellBox.x - tableBox.x;
    };

    const lessonsInset = await measureLeftInset('/lessons');
    const studentsInset = await measureLeftInset('/students');
    const instructorsInset = await measureLeftInset('/instructors');

    // The regression this guards: Lessons previously measured a 2px
    // inset here (colSpan row rounding artifact) while Students/
    // Instructors measured 0px. All three must now match exactly.
    if (lessonsInset !== studentsInset || lessonsInset !== instructorsInset) {
      throw new Error(
        `Left inset mismatch - Lessons: ${lessonsInset}px, Students: ${studentsInset}px, Instructors: ${instructorsInset}px (all three should be identical)`
      );
    }

    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);
    const table = page.locator('table').first();
    await table.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lessons-left-edge-flush-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
