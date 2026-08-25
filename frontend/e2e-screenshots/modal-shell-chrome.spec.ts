import { test, type Page } from '@playwright/test';

/**
 * Screenshots the shared ModalShell chrome fix, both light and dark theme:
 * the book-lesson modal (SmartBookingForm, opened from Lessons and from
 * Students) now matches the create-student modal's chrome exactly -
 * blurred+dimmed backdrop (bg-black/40 backdrop-blur-[2px], not the old
 * darker bg-black bg-opacity-50 with no blur), rounded corners that
 * actually clip content (overflow-y-auto and rounded-3xl on the same
 * element), and internal scroll (the scrollbar rides inside the rounded
 * card, not on a separate square wrapper one layer out).
 *
 * Not a general E2E suite: no visual-regression assertions beyond the
 * structural checks below. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the repo's
 * seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1400, height: 800 };

for (const theme of ['light', 'dark'] as const) {
  test(`Book-lesson modal chrome matches create-student modal - blur, rounding, internal scroll (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/lessons');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: /book new lesson/i }).click();
    await page.waitForTimeout(600);

    const card = page.locator('.overflow-y-auto.rounded-3xl').first();
    await card.waitFor({ state: 'visible' });

    // Scroll+round structural checks - the actual bug (chrome split
    // across two elements) would fail this even if it visually looked
    // fine on a page short enough to never overflow.
    const scrollInfo = await card.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    if (scrollInfo.scrollHeight <= scrollInfo.clientHeight) {
      throw new Error('Booking modal content does not overflow - cannot confirm internal scroll with this content');
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/modal-shell-booking-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Create-student modal scrolls internally within its own rounded card (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: /add student/i }).click();
    await page.waitForTimeout(600);

    const card = page.locator('.overflow-y-auto.rounded-3xl').first();
    await card.waitFor({ state: 'visible' });

    await card.evaluate((el) => { el.scrollTop = 300; });
    await page.waitForTimeout(300);
    const scrollTop = await card.evaluate((el) => el.scrollTop);
    if (scrollTop === 0) {
      throw new Error('Create-student modal card did not scroll internally');
    }

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/modal-shell-create-student-scrolled-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
