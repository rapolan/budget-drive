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

// Forces the filter-with-fallback path to trigger for real (not mocked):
// every active instructor's service area is set, via the same API the UI
// itself calls, to a zip that excludes Marcus Lee's LA pickup zip - so
// whichever instructor the ranked search picks, none of them are in-area
// and the search must fall back to all of them, flagged.
test.describe('booking wizard - outside service area fallback', () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: 'e2e-screenshots/.auth/admin.json' });
    const page = await context.newPage();
    await page.goto('/instructors');

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));

    const instructorsRes = await page.request.get('http://localhost:4000/api/v1/instructors', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data: instructors } = await instructorsRes.json();

    for (const instructor of instructors as Array<{ id: string; status: string }>) {
      if (instructor.status !== 'active') continue;
      await page.request.put(`http://localhost:4000/api/v1/instructors/${instructor.id}/service-areas`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { zipCodes: [OUT_OF_AREA_ZIP] },
      });
    }

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    // Restore every instructor to "serves everywhere" so this spec doesn't
    // leave the seed data in a state that breaks other screenshot specs
    // (booking-workflow.spec.ts books against these same seeded instructors).
    const context = await browser.newContext({ storageState: 'e2e-screenshots/.auth/admin.json' });
    const page = await context.newPage();
    await page.goto('/instructors');
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));

    const instructorsRes = await page.request.get('http://localhost:4000/api/v1/instructors', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data: instructors } = await instructorsRes.json();

    for (const instructor of instructors as Array<{ id: string; status: string }>) {
      if (instructor.status !== 'active') continue;
      await page.request.put(`http://localhost:4000/api/v1/instructors/${instructor.id}/service-areas`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { zipCodes: [] },
      });
    }

    await context.close();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`shows the "Outside their usual area" fallback group (${theme})`, async ({ page }) => {
      await page.goto('/students');
      await setTheme(page, theme);
      await page.getByText(STUDENT_NAME, { exact: false }).first().click();
      await page.getByRole('button', { name: 'Book Lesson', exact: true }).click();

      await page.getByRole('button', { name: /find available/i }).click();
      await page.getByText(/available time slots/i).waitFor();

      await expect(page.getByText('Outside their usual area')).toBeVisible();

      await page.screenshot({
        path: `e2e-screenshots/__screenshots__/booking-outside-service-area-${theme}.png`,
        fullPage: true,
      });
    });
  }
});
