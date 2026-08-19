import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots the instructor form's relabeled license section and new
 * service-area zip manager, plus the booking wizard's "Outside their usual
 * area" fallback group, in both light and dark theme. Not a general E2E
 * suite: no visual-regression assertions. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the
 * repo's seed data loaded.
 *
 * Auth comes from the 'setup' project (auth.setup.ts) - see
 * booking-workflow.spec.ts for the same convention this file follows.
 */

const INSTRUCTOR_NAME = 'Roberto Alejandro Polan'; // seeded with a zip_code
const STUDENT_NAME = 'Marcus Lee'; // seeded pickup zip 90012 (Los Angeles)
const OUT_OF_AREA_ZIP = '10001'; // NYC - guaranteed not to include Marcus Lee's LA pickup zip

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

async function openInstructorModal(page: Page, theme: 'light' | 'dark') {
  await page.goto('/instructors');
  await setTheme(page, theme);
  await page.getByText(INSTRUCTOR_NAME, { exact: false }).first().click();
  await page.getByText('Driving School Instructor License').waitFor();
}

for (const theme of ['light', 'dark'] as const) {
  test(`instructor form shows the relabeled Driving School Instructor License section (${theme})`, async ({ page }) => {
    await openInstructorModal(page, theme);

    await page.getByPlaceholder('DSI-123456').fill('DSI-482913');

    const licenseSection = page.getByText('Driving School Instructor License').locator('..').locator('..');
    await licenseSection.screenshot({
      path: `e2e-screenshots/__screenshots__/instructor-license-${theme}.png`,
    });
  });

  test(`instructor form shows the service-area zip manager (${theme})`, async ({ page }) => {
    await openInstructorModal(page, theme);

    // Two inputs share the "92101" placeholder (the address zip field and
    // the service-area add-zip field), and "Add" collides with the page's
    // own "Add Instructor" header button - scope everything to the section.
    const serviceAreaSection = page.getByText('Service Area', { exact: true }).locator('..').locator('..');
    const zipInput = serviceAreaSection.getByPlaceholder('92101');
    await zipInput.fill(OUT_OF_AREA_ZIP);
    await serviceAreaSection.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(serviceAreaSection.getByText(OUT_OF_AREA_ZIP)).toBeVisible();
    await serviceAreaSection.getByRole('button', { name: /save service area/i }).click();
    await serviceAreaSection.getByText('Saved').waitFor();

    await serviceAreaSection.screenshot({
      path: `e2e-screenshots/__screenshots__/instructor-service-area-${theme}.png`,
    });
  });
}

// Service area now ranks, never filters (see schedulingService's
// findRankedAvailableSlots) - both groups appearing together is the common
// case, not a rare fallback. This scenario mixes a genuinely configured,
// out-of-area instructor (Roberto - his real seeded service areas are all
// San Diego-area zips, which already exclude Marcus Lee's LA pickup zip)
// with the unconfigured instructors (always in-area, Constraint B), so a
// single search naturally produces both groups at once. Roberto needs real
// availability rows to have any bookable slots at all - none are seeded for
// him by default - added here via the same API the availability grid uses.
test.describe('booking wizard - both in-area and out-of-area groups present', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e-screenshots/.auth/admin.json' });
    const page = await context.newPage();
    await page.goto('/instructors');
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));

    const instructorsRes = await page.request.get('http://localhost:4000/api/v1/instructors', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data: instructors } = await instructorsRes.json();
    const roberto = (instructors as Array<{ id: string; fullName: string }>).find((i) => i.fullName === INSTRUCTOR_NAME);
    if (!roberto) throw new Error(`Seed data missing expected instructor: ${INSTRUCTOR_NAME}`);

    // Same whole-week-replace endpoint the availability grid editor uses -
    // one row per day of week, all working days.
    await page.request.put(`http://localhost:4000/api/v1/availability/instructor/${roberto.id}/week`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          isActive: true,
          startTime: '09:00',
          endTime: '17:00',
          maxStudents: 3,
        })),
      },
    });

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    // Deactivate every day so this spec doesn't leave seed data in a state
    // that affects other screenshot specs - same "uncheck the day" shape
    // the real availability grid uses (never a hard delete of the row).
    const context = await browser.newContext({ storageState: 'e2e-screenshots/.auth/admin.json' });
    const page = await context.newPage();
    await page.goto('/instructors');
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));

    const instructorsRes = await page.request.get('http://localhost:4000/api/v1/instructors', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data: instructors } = await instructorsRes.json();
    const roberto = (instructors as Array<{ id: string; fullName: string }>).find((i) => i.fullName === INSTRUCTOR_NAME);
    if (!roberto) {
      await context.close();
      return;
    }

    await page.request.put(`http://localhost:4000/api/v1/availability/instructor/${roberto.id}/week`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        days: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, isActive: false })),
      },
    });

    await context.close();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`shows both the usual-area and "Outside their usual area" groups in one result set (${theme})`, async ({ page }) => {
      await page.goto('/students');
      await setTheme(page, theme);
      await page.getByText(STUDENT_NAME, { exact: false }).first().click();
      await page.getByRole('button', { name: 'Book Lesson', exact: true }).click();

      // Marcus Lee has a prior lesson, so "Book Lesson" prefills the setup
      // step with that instructor preselected (the "Book again" continuity
      // default) - clear it back to "Any available instructor" so the
      // search actually spans every candidate, not just the one instructor.
      const instructorSelect = page.locator('#booking-instructor-select');
      if (await instructorSelect.isVisible().catch(() => false)) {
        await instructorSelect.selectOption('');
      }

      await page.getByRole('button', { name: /find available/i }).click();
      await page.getByText(/available time slots/i).waitFor();

      // Roberto's real service areas (San Diego zips) exclude Marcus Lee's
      // LA pickup zip, so he lands in the out-of-area group; the other,
      // unconfigured instructors land in the (unheaded) in-area group above
      // it - both present together in the one ranked list.
      await expect(page.getByText('Outside their usual area')).toBeVisible();
      await expect(page.getByText(INSTRUCTOR_NAME, { exact: false })).toBeVisible();

      await page.screenshot({
        path: `e2e-screenshots/__screenshots__/booking-both-groups-${theme}.png`,
        fullPage: true,
      });
    });
  }
});
