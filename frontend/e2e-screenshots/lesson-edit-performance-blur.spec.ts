import { test, type Page } from '@playwright/test';

/**
 * Screenshots the lesson-edit modal after the lesson-edit-redesign
 * performance/blur passes, both light and dark theme. Paired "before"
 * screenshots (lesson-edit-before-{light,dark}.png) were captured by
 * temporarily checking out the pre-fix versions of the relevant files from
 * main and re-running this same assertion with inverted logic.
 *
 * What changed, visually: the modal's scrollable panel and sticky header
 * no longer carry backdrop-blur-3xl/backdrop-blur-xl (Group A) - they're a
 * solid-ish bg-surface/95 instead. The modal routes through the shared
 * ModalShell component instead of its own inline copy of equivalent
 * markup.
 *
 * The OUTER fixed, non-scrolling overlay's backdrop-blur-[2px] - initially
 * assumed cheap in Group A - was ALSO removed after a user report that
 * scrolling was still janky on a large seeded tenant, and a real CDP
 * performance trace confirmed it: a backdrop-filter element keeps a live
 * composited blur surface for as long as it exists, and that surface gets
 * re-rasterized/re-composited on every frame the browser redraws,
 * independent of whether the pixels behind it are visibly changing.
 * Traced on a ~2,000-row tenant: with the overlay blur present, scrolling
 * inside the modal dropped 9/20 frames (28ms avg, 68.6ms max); with it
 * removed, 0/20 dropped (16.1ms avg, 18.7ms max) - a clean 60fps. See
 * docs/ARCHITECTURE.md §32 for the full trace summary and the same result
 * measured on StudentModal and SmartBookingForm.
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

    // The fixed, non-scrolling overlay (ModalShell's own backdrop) - this
    // is the one that was measured to actually cause the dropped frames,
    // not the card/header above. Confirmed via a real CDP trace, not
    // assumed: a live backdrop-filter surface costs a recomposite on every
    // frame the browser redraws, not just when its own pixels change.
    const overlay = page.locator('.fixed.inset-0').first();
    await overlay.waitFor({ state: 'visible' });
    const overlayBackdropFilter = await overlay.evaluate((el) => getComputedStyle(el).backdropFilter);
    if (overlayBackdropFilter && overlayBackdropFilter !== 'none') {
      throw new Error(`Modal overlay still has a backdrop-filter: ${overlayBackdropFilter}`);
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/lesson-edit-after-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
