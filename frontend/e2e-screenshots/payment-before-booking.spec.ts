import { test, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Screenshots the payment-before-booking feature: the "Payment needed"
 * banner and the payment-arrangement note in SmartBookingForm's Confirm
 * step, and the Settings page's "Payments and Booking" tab (toggle +
 * safety-report preview) - light and dark theme, plus one phone-width
 * check that nothing clips.
 *
 * Creates its own self-contained fixtures in beforeAll (direct API calls,
 * same pattern as payment-history-layout.spec.ts/widget-day-closing-
 * actions.spec.ts): flips tenant_settings.require_payment_before_booking
 * ON via the Settings API itself (not a raw SQL update - exercises the
 * real write path), then creates two students - one with $0 net paid and
 * no arrangement (triggers the banner) and one with a payment arrangement
 * set (triggers the blue note). Leaves both behind in the dev DB and the
 * setting ON afterward, by design, matching this repo's other one-shot
 * fixture-creating specs.
 *
 * Not a general E2E suite: no visual-regression assertions, just a
 * visible sanity check per screenshot. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

function tokenFromStorageState(): string {
  const state = JSON.parse(readFileSync('e2e-screenshots/.auth/admin.json', 'utf-8'));
  const origin = state.origins?.find((o: { origin: string }) => o.origin.includes('localhost'));
  const tokenEntry = origin?.localStorage?.find((e: { name: string }) => e.name === 'auth_token');
  if (!tokenEntry) throw new Error('Could not find auth_token in e2e-screenshots/.auth/admin.json - run the "setup" project first.');
  return tokenEntry.value;
}

async function api<T = any>(
  request: APIRequestContext,
  token: string,
  path: string,
  opts: { method?: 'GET' | 'POST' | 'PUT'; data?: unknown } = {}
): Promise<{ status: number; json: T }> {
  const resp = await request.fetch(`http://localhost:4000/api/v1${path}`, {
    method: opts.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}` },
    data: opts.data,
  });
  return { status: resp.status(), json: await resp.json() };
}

let blockedStudentName: string;
let arrangementStudentName: string;

test.beforeAll(async ({ request }) => {
  const token = tokenFromStorageState();
  const uniqueSuffix = Date.now();

  const settingsResp = await api(request, token, '/tenant/settings', {
    method: 'PUT',
    data: { requirePaymentBeforeBooking: true },
  });
  if (settingsResp.status !== 200) {
    throw new Error(`Failed to enable requirePaymentBeforeBooking: ${settingsResp.status} ${JSON.stringify(settingsResp.json)}`);
  }

  blockedStudentName = `PBBDemo Blocked${uniqueSuffix}`;
  const blockedStudentResp = await api(request, token, '/students', {
    method: 'POST',
    data: {
      fullName: blockedStudentName,
      email: `pbbdemo-blocked+${uniqueSuffix}@example.com`,
      phone: '(555) 000-0300',
      dateOfBirth: '1995-01-01',
      address: '1 Demo St',
      city: 'Demo City',
      state: 'CA',
      zipCode: '90001',
    },
  });
  if (blockedStudentResp.status !== 201) {
    throw new Error(`Failed to create blocked demo student: ${blockedStudentResp.status} ${JSON.stringify(blockedStudentResp.json)}`);
  }
  // No payment at all - net paid $0, no arrangement, so any priced lesson
  // is blocked.

  arrangementStudentName = `PBBDemo Arrangement${uniqueSuffix}`;
  const arrangementStudentResp = await api(request, token, '/students', {
    method: 'POST',
    data: {
      fullName: arrangementStudentName,
      email: `pbbdemo-arrangement+${uniqueSuffix}@example.com`,
      phone: '(555) 000-0400',
      dateOfBirth: '1995-01-01',
      address: '1 Demo St',
      city: 'Demo City',
      state: 'CA',
      zipCode: '90001',
    },
  });
  if (arrangementStudentResp.status !== 201) {
    throw new Error(`Failed to create arrangement demo student: ${arrangementStudentResp.status} ${JSON.stringify(arrangementStudentResp.json)}`);
  }
  const arrangementEnrollmentId = arrangementStudentResp.json.data.activeEnrollment?.id;
  if (!arrangementEnrollmentId) {
    throw new Error('Newly created student has no activeEnrollment.id to set a payment arrangement against');
  }
  const arrangementResp = await api(request, token, `/enrollments/${arrangementEnrollmentId}/payment-arrangement`, {
    method: 'POST',
    data: { note: 'Screenshot fixture - paying $50/month' },
  });
  if (arrangementResp.status !== 201 && arrangementResp.status !== 200) {
    throw new Error(`Failed to set payment arrangement: ${arrangementResp.status} ${JSON.stringify(arrangementResp.json)}`);
  }
});

// Searches Students.tsx's own search box down to exactly one match, opens
// that student's detail modal, clicks "Book Lesson" there, and advances
// through SmartBookingForm (free-choice instructor/slot pick - whichever
// the backend's own availability search returns first, not hardcoded to
// any particular seeded instructor's name) to the Confirm step.
async function openConfirmStepForStudent(page: Page, studentName: string, theme: 'light' | 'dark') {
  await page.goto('/students');
  await setTheme(page, theme);
  await page.waitForTimeout(500);

  await page.getByPlaceholder(/search students and guardians/i).fill(studentName);
  await page.waitForTimeout(800);
  // Not { exact: true } - the name can render CSS-truncated (e.g. at
  // phone width) across nested text nodes, so an exact full-string match
  // against the rendered text fails even though the untruncated name is
  // still present in the DOM.
  const studentRow = page.getByText(studentName).first();
  await studentRow.waitFor({ state: 'visible', timeout: 10000 });
  await studentRow.click();
  await page.waitForTimeout(800);

  // "Book Lesson" at normal widths, abbreviated to just "Book" below sm
  // (StudentModal.tsx's own sm:hidden/sm:inline text-swap pattern).
  const bookButton = page.getByRole('button', { name: /^book(\s+lesson)?$/i }).first();
  await bookButton.waitFor({ state: 'visible' });
  await bookButton.click();
  await page.getByText('Smart Booking').waitFor({ state: 'visible' });
  await page.waitForTimeout(500);

  const findButton = page.getByRole('button', { name: /find available instructors|find available times/i });
  await findButton.waitFor({ state: 'visible' });
  await findButton.click();

  await page.getByText('Available Time Slots').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);

  // Expand whichever instructor group the search actually returned first -
  // generic, not tied to any specific seeded instructor's name.
  const instructorGroupHeading = page.locator('button:has(span.font-semibold)').first();
  await instructorGroupHeading.waitFor({ state: 'visible', timeout: 10000 });
  await instructorGroupHeading.click();
  await page.waitForTimeout(300);

  const slotButton = page.getByText(/\d{1,2}:\d{2}\s*(AM|PM)\s*-\s*\d{1,2}:\d{2}\s*(AM|PM)/i).first();
  await slotButton.waitFor({ state: 'visible', timeout: 10000 });
  await slotButton.click();

  await page.getByText('Booking Summary').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);
}

for (const theme of ['light', 'dark'] as const) {
  test(`SmartBookingForm "Payment needed" banner, no dollar amounts shown (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    await openConfirmStepForStudent(page, blockedStudentName, theme);

    await page.getByText('Payment needed').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-before-booking-banner-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`SmartBookingForm payment-arrangement note instead of the banner (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    await openConfirmStepForStudent(page, arrangementStudentName, theme);

    await page.getByText(/payment arrangement on file/i).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-before-booking-arrangement-note-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Settings page "Payments and Booking" tab - toggle and safety-report preview (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const page = await context.newPage();
    await page.goto('/settings');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByRole('button', { name: /payments and booking/i }).click();
    await page.getByText('Require payment before booking').waitFor({ state: 'visible' });
    await page.getByText(/preview: students who couldn't book today/i).waitFor({ state: 'visible' });
    // Wait for the preview table/empty-state to resolve past "Loading...".
    await page.waitForTimeout(800);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-before-booking-settings-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}

test('Phone-width check - banner and Settings tab both stay fully readable, nothing clipped', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await openConfirmStepForStudent(page, blockedStudentName, 'light');

  await page.getByText('Payment needed').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `e2e-screenshots/__screenshots__/payment-before-booking-banner-phone.png`,
    fullPage: false,
  });

  await page.goto('/settings');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /payments and booking/i }).click();
  await page.getByText('Require payment before booking').waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: `e2e-screenshots/__screenshots__/payment-before-booking-settings-phone.png`,
    fullPage: false,
  });

  await context.close();
});
