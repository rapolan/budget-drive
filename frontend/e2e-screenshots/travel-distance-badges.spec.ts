import { test, type Page } from '@playwright/test';

/**
 * Screenshots the SmartBookingForm's reworked "Travel distance" vocabulary
 * (Nearby/Moderate/Far, replacing the old Very Close/Nearby/Close/Far
 * proximity tags) in both the grouped slot list and the confirm step, both
 * light and dark theme. The ranked-slots response is mocked via page.route
 * so all three tiers are guaranteed to appear regardless of what proximity
 * scores the seeded instructors/pickup zip actually happen to produce -
 * this is a display-only change, not a test of the ranking itself (see
 * ranked-slots-badge-contrast.spec.ts for the real-data badge-contrast
 * check this file complements). Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the repo's
 * seed data loaded (student "Priya Anand", used only to drive the booking
 * wizard to the slot-list step - the ranked-slots response itself is
 * mocked, so her actual pickup zip/instructor matches don't matter).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const MOCK_SLOTS = [
  {
    date: '2026-08-25',
    startTime: '2026-08-25T17:00:00.000Z',
    endTime: '2026-08-25T19:00:00.000Z',
    startTimeLocal: '10:00',
    endTimeLocal: '12:00',
    instructorId: 'instructor-nearby',
    available: true,
    proximityScore: 95,
    instructorName: 'Renee Okafor',
    instructorZip: '90008',
    comingFrom: 'home',
    outsideServiceArea: false,
  },
  {
    date: '2026-08-25',
    startTime: '2026-08-25T20:00:00.000Z',
    endTime: '2026-08-25T22:00:00.000Z',
    startTimeLocal: '13:00',
    endTimeLocal: '15:00',
    instructorId: 'instructor-moderate',
    available: true,
    proximityScore: 65,
    instructorName: 'Marcus Webb',
    instructorZip: '90015',
    comingFrom: 'home',
    outsideServiceArea: false,
  },
  {
    date: '2026-08-26',
    startTime: '2026-08-26T17:00:00.000Z',
    endTime: '2026-08-26T19:00:00.000Z',
    startTimeLocal: '10:00',
    endTimeLocal: '12:00',
    instructorId: 'instructor-far',
    available: true,
    proximityScore: 30,
    instructorName: 'Dana Whitfield',
    instructorZip: '93001',
    comingFrom: 'home',
    outsideServiceArea: false,
  },
];

async function mockRankedSlots(page: Page) {
  await page.route('**/availability/find-slots-ranked', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: MOCK_SLOTS, count: MOCK_SLOTS.length, failedInstructors: [] }),
    });
  });
}

async function openBookingWizardToSlots(page: Page) {
  await page.goto('/lessons');
  await page.getByRole('button', { name: /book new lesson/i }).click();

  const studentSearch = page.getByPlaceholder(/search by name or email/i);
  await studentSearch.click();
  await studentSearch.fill('Anand');
  const option = page.getByRole('button', { name: /Priya Anand/i });
  await option.waitFor({ state: 'visible' });
  await option.click({ force: true });

  const findBtn = page.getByRole('button', { name: /find available/i });
  await findBtn.waitFor({ state: 'visible' });
  await findBtn.click();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Booking slot list shows Nearby/Moderate/Far travel-distance badges (${theme})`, async ({ page }) => {
    await mockRankedSlots(page);
    await page.goto('/lessons');
    await setTheme(page, theme);

    await openBookingWizardToSlots(page);

    // All three instructor cards, each carrying a distinct tier's
    // "Travel distance:" header badge.
    await page.getByText('Travel distance: 🏠 Nearby').waitFor({ state: 'visible' });
    await page.getByText('Travel distance: 📍 Moderate').waitFor({ state: 'visible' });
    await page.getByText('Travel distance: 🗺️ Far').waitFor({ state: 'visible' });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/travel-distance-slot-list-${theme}.png`,
      fullPage: true,
    });
  });

  test(`Booking confirm step shows the selected slot's own travel-distance badge (${theme})`, async ({ page }) => {
    await mockRankedSlots(page);
    await page.goto('/lessons');
    await setTheme(page, theme);

    await openBookingWizardToSlots(page);

    // Expand the "Moderate" instructor and select their slot, so the
    // confirm step's badge is neither the closest nor the farthest tier -
    // proves it reads the selected slot's own score, not some default.
    await page.getByRole('button', { name: /Marcus Webb/i }).click();
    const slotRow = page.getByRole('button', { name: /1:00 PM - 3:00 PM/i });
    await slotRow.waitFor({ state: 'visible' });
    await slotRow.click();

    await page.getByText('Booking Summary').waitFor({ state: 'visible' });
    await page.getByText('📍 Moderate').waitFor({ state: 'visible' });

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/travel-distance-confirm-step-${theme}.png`,
    });
  });
}
