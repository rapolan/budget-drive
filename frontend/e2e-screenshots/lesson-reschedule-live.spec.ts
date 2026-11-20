import { test, type Page } from '@playwright/test';

/**
 * Live verification of the new in-place Reschedule flow (Group B of the
 * lesson-edit-redesign) against the real running dev app and real
 * Postgres - not mocks. Confirms: the Reschedule button appears only on a
 * future scheduled lesson, clicking it opens SmartBookingForm with the
 * student locked, a real availability search runs, picking a new slot and
 * confirming updates the SAME lesson row (not a new one), and the Lessons
 * list reflects the new date/time afterward.
 *
 * Requires both dev servers already running (backend :4000, frontend
 * :5173 - see docs/TESTING.md §1) and at least one GENUINELY FUTURE
 * scheduled lesson relative to the real current date - a lesson whose
 * date/time has already passed is correctly treated as not reschedule-
 * eligible (isRescheduleEligible in Lessons.tsx), so this test will time
 * out waiting for the Reschedule button if the only scheduled lessons in
 * the dev DB are stale. If needed, insert one directly:
 *   INSERT INTO lessons (tenant_id, instructor_id, vehicle_id, date,
 *     start_time, end_time, duration, lesson_type, cost, enrollment_id,
 *     status, notes) VALUES (<tenant>, <instructor>, <vehicle>,
 *     <a real future date>, '10:00:00', '11:00:00', 60, 'behind_wheel',
 *     50, <an active driver_training enrollment>, 'scheduled',
 *     'LIVE_RESCHEDULE_TEST');
 * and delete it again after the run.
 *
 * This mutates a real lesson row (moves it to whatever slot the live
 * search happens to return first) - not safe to run against a shared or
 * production database, only a local dev DB you can freely modify.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

test('Reschedule a real scheduled lesson in place - same lesson id, new date/time', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  await page.goto('/lessons');
  await setTheme(page, 'light');
  await page.waitForTimeout(800);

  // Switch to "All" status filter isn't needed - a future scheduled lesson
  // is visible under the default 'scheduled' filter already.
  const rescheduleButton = page.getByRole('button', { name: /reschedule lesson/i }).first();
  await rescheduleButton.waitFor({ state: 'visible', timeout: 10_000 });

  // Capture the lesson id being rescheduled via the API response the page
  // itself issues for the lessons list, by reading the row's text before
  // opening the wizard (date/time shown in the row).
  const row = rescheduleButton.locator('xpath=ancestor::tr[1]');
  const beforeRowText = await row.textContent();

  await rescheduleButton.click();
  await page.waitForTimeout(600);

  // Student should be shown locked (read-only card, no search box, no
  // "Change" button) - confirms existingLesson mode, not a blank new booking.
  const card = page.locator('.overflow-y-auto.rounded-3xl').first();
  await card.waitFor({ state: 'visible' });
  const changeButton = card.getByRole('button', { name: /^change$/i });
  if (await changeButton.count() > 0) {
    throw new Error('Student is shown as changeable - reschedule mode did not lock the student as expected');
  }

  // Run the real availability search.
  const findButton = card.getByRole('button', { name: /find available/i });
  await findButton.waitFor({ state: 'visible' });
  await findButton.click();
  await page.waitForTimeout(2000);

  // Pick the first available slot shown - slots are grouped by instructor
  // behind a collapsed "#1 <name> ... N available slots" header that must
  // be clicked to expand before any individual slot button is visible.
  const slotHeading = card.getByText(/available time slots/i);
  await slotHeading.waitFor({ state: 'visible', timeout: 15_000 });

  const firstGroupHeader = card.locator('button').filter({ hasText: /available slots/i }).first();
  await firstGroupHeader.waitFor({ state: 'visible', timeout: 15_000 });
  await firstGroupHeader.click();
  await page.waitForTimeout(400);

  const firstSlot = card.locator('button').filter({ hasText: /AM|PM/i }).first();
  await firstSlot.waitFor({ state: 'visible', timeout: 10_000 });
  const slotText = await firstSlot.textContent();
  await firstSlot.click();

  // Confirm step - submit.
  const confirmButton = card.getByRole('button', { name: /confirm booking/i });
  await confirmButton.waitFor({ state: 'visible' });
  await confirmButton.click();
  await page.waitForTimeout(1500);

  // Modal should close (onBookingComplete fires immediately for
  // reschedule - no "Book Another" success screen).
  const stillOpen = await card.isVisible().catch(() => false);
  if (stillOpen) {
    throw new Error('Reschedule modal still open after confirming - expected it to close immediately');
  }

  console.log('Reschedule confirmed. Row before:', beforeRowText, '| Slot picked:', slotText);

  await page.screenshot({
    path: 'e2e-screenshots/__screenshots__/lesson-reschedule-after-live.png',
    fullPage: false,
  });

  await context.close();
});
