import { test, type Page } from '@playwright/test';

/**
 * Screenshots the lesson-edit modal after the lesson-edit-redesign Group A
 * performance/blur pass, both light and dark theme. Paired "before"
 * screenshots (lesson-edit-before-{light,dark}.png) were captured by
 * temporarily checking out the pre-fix versions of ModalShell.tsx/
 * LessonModal.tsx/SmartBookingForm/index.tsx from main and re-running this
 * same assertion with inverted logic - confirmed the pre-fix panel's
 * computed backdropFilter was literally `blur(64px)` (backdrop-blur-3xl)
 * in both themes before the fix, now `none` after it.
 *
 * What changed, visually: the modal's scrollable panel and sticky header
 * no longer carry backdrop-blur-3xl/backdrop-blur-xl (expensive to
 * recomposite every scroll frame) - they're now a solid-ish bg-surface/95
 * instead. The outer fixed, non-scrolling overlay keeps its cheap
 * backdrop-blur-[2px], unchanged. The modal now also routes through the
 * shared ModalShell component instead of its own inline copy of
 * equivalent markup.
 *
 * Not a general E2E suite: no visual-regression assertions beyond the
 * structural check below. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the repo's
 * seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1400, height: 900 };

for (const theme of ['light', 'dark'] as const) {
  test(`Lesson edit modal - no backdrop-blur on scrolling panel/sticky header (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const editButton = page.getByRole('button', { name: /edit lesson/i }).first();
    await editButton.waitFor({ state: 'visible' });
    await editButton.click();
    await page.waitForTimeout(600);

    const card = page.locator('.overflow-y-auto.rounded-3xl').first();
    await card.waitFor({ state: 'visible' });

    // The regression this guards: the scrollable card and its sticky
    // header used to carry backdrop-blur-3xl/backdrop-blur-xl - expensive
    // to recomposite on every scroll frame. Confirm neither is present
    // any more (computed style, not just a class-name check, since
    // Tailwind's arbitrary-value classes don't always match 1:1 with the
    // resulting CSS property name).
    const cardBackdropFilter = await card.evaluate((el) => getComputedStyle(el).backdropFilter);
    if (cardBackdropFilter && cardBackdropFilter !== 'none') {
      throw new Error(`Lesson edit modal's scrollable panel still has a backdrop-filter: ${cardBackdropFilter}`);
    }

    const header = card.locator('.sticky').first();
    await header.waitFor({ state: 'visible' });
    const headerBackdropFilter = await header.evaluate((el) => getComputedStyle(el).backdropFilter);
    if (headerBackdropFilter && headerBackdropFilter !== 'none') {
      throw new Error(`Lesson edit modal's sticky header still has a backdrop-filter: ${headerBackdropFilter}`);
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lesson-edit-after-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
