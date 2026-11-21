import { test, type Page } from '@playwright/test';

/**
 * Screenshots the redesigned LessonDetailsPanel (lesson-details-panel-v2):
 * a quick-reference summary first, edit form second. Covers all three
 * lesson-status shapes the spec calls out - scheduled (action row +
 * editable fields), completed (read-only except Notes), cancelled
 * (read-only except Notes + "Book Again") - each in light and dark.
 *
 * Not a general E2E suite: no visual-regression assertions, just a visible
 * sanity check per screenshot. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and these three
 * specific seeded students/lessons to exist for this tenant (set up via the
 * real API during this task's own live verification, not fixtures checked
 * into this repo):
 *   - Samantha Monica Corona-Perez - a SCHEDULED lesson, moved to a future
 *     date so canReschedule is true (shows the full action row).
 *   - Benjamin Hayes - a COMPLETED lesson with notes (shows the read-only
 *     summary + "Last lesson" block from an earlier completed lesson for
 *     the same student/enrollment - this student needs a SECOND, earlier
 *     completed lesson with its own notes for the "Last lesson" block to
 *     have something to show; created via POST /lessons + POST
 *     /lessons/:id/complete, not seeded in migrations).
 *   - Olivia Martin - a CANCELLED lesson (shows "Book Again").
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1400, height: 1000 };

const CASES: Array<{ status: 'scheduled' | 'completed' | 'cancelled'; studentName: string; slug: string }> = [
  { status: 'scheduled', studentName: 'Samantha Monica Corona-Perez', slug: 'scheduled' },
  { status: 'completed', studentName: 'Benjamin Hayes', slug: 'completed' },
  { status: 'cancelled', studentName: 'Olivia Martin', slug: 'cancelled' },
];

for (const theme of ['light', 'dark'] as const) {
  for (const { status, studentName, slug } of CASES) {
    test(`Lesson details panel v2 - ${slug} lesson (${theme})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: VIEWPORT });
      const page = await context.newPage();
      await page.goto('/lessons');
      await setTheme(page, theme);
      await page.waitForTimeout(500);

      // The list defaults to the "scheduled" status filter - switch to the
      // matching filter so a completed/cancelled lesson's row is visible at
      // all, then search by student name to find the specific seeded row.
      // FilterButton's accessible name is "<Label><count>" (no separator),
      // so match on the label prefix rather than an exact/anchored string -
      // "No Show" also starts with "No", so capitalize to avoid ambiguity.
      const filterLabel = status.charAt(0).toUpperCase() + status.slice(1);
      await page.getByRole('button', { name: new RegExp(`^${filterLabel}\\d`, 'i') }).first().click();
      await page.waitForTimeout(300);

      const searchBox = page.getByPlaceholder(/search/i).first();
      await searchBox.fill(studentName);
      await page.waitForTimeout(400);

      // Scheduled rows open via "Edit lesson"; completed/no_show rows via
      // the "View lesson" discoverability-fix button added this session;
      // cancelled rows have no dedicated open button at all (only "Book
      // again"), but the row/card's own onClick already opens the panel
      // for any status - click the row itself for that case.
      let openTrigger = status === 'scheduled'
        ? page.getByRole('button', { name: /edit lesson/i }).first()
        : page.getByRole('button', { name: /view lesson/i }).first();

      if (status === 'cancelled') {
        openTrigger = page.locator('tr', { hasText: studentName }).first();
      }

      await openTrigger.waitFor({ state: 'visible' });
      await openTrigger.click();
      await page.waitForTimeout(800);

      const card = page.locator('.overflow-y-auto.rounded-3xl').first();
      await card.waitFor({ state: 'visible' });

      await page.screenshot({
        path: `e2e-screenshots/__screenshots__/lesson-details-panel-v2-${slug}-${theme}.png`,
        fullPage: false,
      });

      await context.close();
    });
  }
}
