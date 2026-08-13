import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots the two new pieces of booking-workflow UI - the setup step's
 * date-range presets and the success state's "Book another" offer - in
 * both light and dark theme. Not a general E2E suite: no visual-regression
 * assertions, one spec file, four PNGs. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the
 * repo's seed data loaded.
 */

const STUDENT_NAME = 'Marcus Lee'; // seeded 'completed' status, still bookable

// Auth comes from the 'setup' project (auth.setup.ts), which logs in ONCE
// and saves storageState - reused here via playwright.config.ts's
// 'chromium' project config, so these tests never hit /auth/login
// themselves and stay well under the backend's authLimiter on repeat runs.

async function setTheme(page: Page, theme: 'light' | 'dark') {
  // localStorage is only accessible once the page has navigated to the
  // app's origin - about:blank (the default new-page state) throws a
  // SecurityError on access.
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

async function openBookingWizardForMarcus(page: Page, theme: 'light' | 'dark') {
  await page.goto('/students');
  await setTheme(page, theme);
  await page.getByText(STUDENT_NAME, { exact: false }).first().click();
  // The student detail modal's own header button, not the row-level icon
  // button of the same accessible name in the underlying list.
  await page.getByRole('button', { name: 'Book Lesson', exact: true }).click();
}

for (const theme of ['light', 'dark'] as const) {
  test(`setup step shows populated date-range presets (${theme})`, async ({ page }) => {
    await openBookingWizardForMarcus(page, theme);

    // Wait for the server-computed date presets to resolve and populate
    // the From/To inputs - not an arbitrary timeout.
    const fromInput = page.locator('#booking-search-from');
    await expect(fromInput).not.toHaveValue('');
    await expect(page.getByRole('button', { name: 'Next 2 Weeks' })).toBeVisible();

    // The Search Dates block sits below the fold inside the modal's own
    // overflow-y-auto container (Students.tsx), which a page-level
    // fullPage screenshot does not expand - scroll the control into view
    // within that container instead, then screenshot the modal itself.
    await fromInput.scrollIntoViewIfNeeded();
    const modal = page.locator('div.max-h-\\[90vh\\].overflow-y-auto');
    await modal.screenshot({
      path: `e2e-screenshots/__screenshots__/setup-step-${theme}.png`,
    });
  });

  test(`success state offers "Book another" (${theme})`, async ({ page }) => {
    await openBookingWizardForMarcus(page, theme);

    // Any instructor, any slot - this screenshot only needs a real booking
    // to reach the success step, not a specific instructor/time. Picks the
    // LAST offered slot each attempt (least likely to have been consumed
    // by an earlier run against the same seeded data) and retries through
    // the wizard's own stale-slot-recovery notice if a prior run already
    // took it, rather than treating that recovery as a script failure.
    await page.getByRole('button', { name: /find available/i }).click();
    await page.getByText(/available time slots/i).waitFor();

    const bookedOrRecovered = async (): Promise<'booked' | 'recovered'> => {
      const instructorGroup = page.locator('button', { hasText: /available slots/i }).first();
      await instructorGroup.click();
      await page.getByText(/\d{1,2}:\d{2} (AM|PM) - \d{1,2}:\d{2} (AM|PM)/i).first().waitFor();
      await page.getByText(/\d{1,2}:\d{2} (AM|PM) - \d{1,2}:\d{2} (AM|PM)/i).last().click();

      await page.getByText('Booking Summary').waitFor();
      await page.getByRole('button', { name: /confirm booking/i }).click();

      const result = await Promise.race([
        page.getByText('Lesson Booked!').waitFor().then(() => 'booked' as const),
        page.getByText('That slot was just taken').waitFor().then(() => 'recovered' as const),
      ]);
      return result;
    };

    // At most 2 attempts: the wizard's own re-search already refreshes the
    // list on the first stale-slot hit, so a second attempt against the
    // freshly-recovered list should succeed.
    let outcome = await bookedOrRecovered();
    if (outcome === 'recovered') {
      outcome = await bookedOrRecovered();
    }
    expect(outcome).toBe('booked');

    await expect(page.getByRole('button', { name: /book another lesson/i })).toBeVisible();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/success-state-${theme}.png`,
      fullPage: true,
    });
  });

  // Visual-consistency pass: the wizard's chrome/headers/labels/inputs/
  // buttons were aligned to StudentModal's conventions (glass modal card,
  // uppercase tracking-wide section headers, token-only focus rings, the
  // shared common/Button component) - these two screenshots are for manual
  // side-by-side comparison against StudentModal, not automated pixel
  // assertions.
  test(`setup step matches StudentModal's visual conventions (${theme})`, async ({ page }) => {
    await openBookingWizardForMarcus(page, theme);

    await page.getByText('Search Dates').waitFor();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/setup-step-restyled-${theme}.png`,
    });
  });

  test(`confirm step matches StudentModal's visual conventions (${theme})`, async ({ page }) => {
    await openBookingWizardForMarcus(page, theme);

    await page.getByRole('button', { name: /find available/i }).click();
    await page.getByText(/available time slots/i).waitFor();

    const instructorGroup = page.locator('button', { hasText: /available slots/i }).first();
    await instructorGroup.click();
    await page.getByText(/\d{1,2}:\d{2} (AM|PM) - \d{1,2}:\d{2} (AM|PM)/i).first().waitFor();
    await page.getByText(/\d{1,2}:\d{2} (AM|PM) - \d{1,2}:\d{2} (AM|PM)/i).last().click();

    await page.getByText('Booking Summary').waitFor();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/confirm-step-restyled-${theme}.png`,
    });
  });
}
