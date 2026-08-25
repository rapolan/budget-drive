import { test, type Page } from '@playwright/test';

/**
 * Screenshots the Dashboard's booking modal fixes, both light and dark
 * theme:
 *
 * 1. "Schedule Lesson" (and the empty-state "Schedule a Lesson" CTA)
 *    previously navigated to /lessons; they now open SmartBookingForm
 *    in place on the dashboard, using the shared ModalShell chrome.
 * 2. The create-student modal's "Book Lesson" follow-up (only shown once
 *    onBookLesson is wired up - it wasn't, on Dashboard, before this fix)
 *    opens the same in-place modal with the just-created student
 *    preselected.
 *
 * Not a general E2E suite: no visual-regression assertions beyond the
 * URL-stays-on-dashboard check below. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1400, height: 900 };

for (const theme of ['light', 'dark'] as const) {
  test(`Dashboard "Schedule Lesson" opens the booking modal in place, no navigation (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/dashboard');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const urlBefore = page.url();
    await page.getByRole('button', { name: /^schedule lesson$/i }).click();
    await page.waitForTimeout(600);

    if (page.url() !== urlBefore) {
      throw new Error(`Schedule Lesson navigated away (from ${urlBefore} to ${page.url()}) instead of opening a modal in place`);
    }
    await page.getByText('Smart Booking').waitFor({ state: 'visible' });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/dashboard-booking-modal-inplace-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Dashboard create-student "Book Lesson" follow-up opens the booking modal with the new student preselected (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/dashboard');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByRole('button', { name: /^student$/i }).click();
    await page.waitForTimeout(600);

    const rand = Math.floor(Math.random() * 1000000);
    await page.fill('input[placeholder="First"]', 'Playwright');
    await page.fill('input[placeholder="Last"]', `BookLessonSpec${rand}`);
    await page.fill('input[type="date"]', '1990-01-01');
    await page.fill('input[placeholder="Street address"]', '1 Test Way');
    await page.fill('input[placeholder="City"]', 'Los Angeles');
    await page.fill('input[placeholder="ZIP"]', '90001');
    await page.fill('input[type="email"]', `playwright-book-lesson-${rand}@example.com`);
    await page.fill('input[type="tel"]', '5551234567');

    await page.getByRole('button', { name: /create student/i }).click();
    await page.waitForTimeout(1200);

    const bookLessonButton = page.getByRole('button', { name: /book lesson/i });
    await bookLessonButton.waitFor({ state: 'visible' });
    await bookLessonButton.click();
    await page.waitForTimeout(600);

    await page.getByText('Smart Booking').waitFor({ state: 'visible' });
    await page.getByText(`Playwright BookLessonSpec${rand}`).waitFor({ state: 'visible' });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/dashboard-create-then-book-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
