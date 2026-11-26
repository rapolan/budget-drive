import { test, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Screenshots the payment-history-layout fixes: the Payment History
 * modal's merged Type+Applied To and Reference #+Details columns, the
 * sticky Actions column, the widened desktop modal (1280px and 1440px),
 * and the stacked-card layout on a phone-width viewport - light and dark
 * theme.
 *
 * Creates ONE self-contained fixture in beforeAll (a fresh student, via
 * direct API calls - same pattern as widget-day-closing-actions.spec.ts)
 * rather than depending on another spec's hand-seeded live data: a new
 * student (auto-enrolled driver_training per studentService.createStudent's
 * default), one confirmed payment with both a reference number and a long
 * note (to exercise the merged Details column's truncation/title
 * behavior), and a partial refund against it (to exercise the same
 * indented adjustment-line rendering payments-adjustments.spec.ts already
 * covers, so this spec's screenshots also show a non-trivial history, not
 * just a single bare row).
 *
 * Not a general E2E suite: no visual-regression assertions, just a
 * visible sanity check per screenshot. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

// Reads the auth token from the SAME storageState auth.setup.ts already
// produced (e2e-screenshots/.auth/admin.json, applied to every test
// project per playwright.config.ts) instead of logging in again here -
// staying well under the backend's authLimiter (10 attempts/15min).
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
  opts: { method?: 'GET' | 'POST'; data?: unknown } = {}
): Promise<{ status: number; json: T }> {
  const resp = await request.fetch(`http://localhost:4000/api/v1${path}`, {
    method: opts.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}` },
    data: opts.data,
  });
  return { status: resp.status(), json: await resp.json() };
}

const LONG_NOTE =
  'Customer called ahead to say they would be running about ten minutes late dropping off the remaining balance in cash, and asked that the front desk hold their usual Tuesday slot open until they arrive - please do not release it to the waitlist.';

let studentName: string;

test.beforeAll(async ({ request }) => {
  const token = tokenFromStorageState();
  const uniqueSuffix = Date.now();
  studentName = `LayoutDemo Student${uniqueSuffix}`;

  const studentResp = await api(request, token, '/students', {
    method: 'POST',
    data: {
      fullName: studentName,
      email: `layoutdemo+${uniqueSuffix}@example.com`,
      phone: '(555) 000-0100',
      dateOfBirth: '1995-01-01',
      address: '1 Demo St',
      city: 'Demo City',
      state: 'CA',
      zipCode: '90001',
    },
  });
  if (studentResp.status !== 201) {
    throw new Error(`Failed to create demo student fixture: ${studentResp.status} ${JSON.stringify(studentResp.json)}`);
  }
  const studentId = studentResp.json.data.id;

  const paymentResp = await api(request, token, '/payments', {
    method: 'POST',
    data: {
      studentId,
      amount: 150,
      paymentMethod: 'cash',
      paymentType: 'lesson_payment',
      referenceNumber: 'SQ-7788',
      notes: LONG_NOTE,
    },
  });
  if (paymentResp.status !== 201) {
    throw new Error(`Failed to create demo payment fixture: ${paymentResp.status} ${JSON.stringify(paymentResp.json)}`);
  }
  const paymentId = paymentResp.json.data.id;

  const adjustmentResp = await api(request, token, `/payments/${paymentId}/adjustments`, {
    method: 'POST',
    data: {
      adjustmentType: 'refund',
      amount: 30,
      reasonCode: 'overpaid',
      note: 'Screenshot fixture',
    },
  });
  if (adjustmentResp.status !== 201) {
    throw new Error(`Failed to create demo refund fixture: ${adjustmentResp.status} ${JSON.stringify(adjustmentResp.json)}`);
  }
});

async function openHistoryModal(page: Page, theme: 'light' | 'dark') {
  await page.goto('/payments');
  await setTheme(page, theme);
  await page.waitForTimeout(500);
  await page.getByPlaceholder(/search by student name or email/i).fill(studentName);
  await page.waitForTimeout(300);
  const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
  await historyButton.waitFor({ state: 'visible' });
  await historyButton.click();
  await page.getByText('Payment History').waitFor({ state: 'visible' });
  // Both the table and the stacked-card list render for every payment
  // (CSS-only hidden/sm:hidden toggle, not conditional rendering - see
  // this spec's own top comment and PaymentHistoryModal.tsx), so this
  // text matches twice regardless of viewport width - one copy is always
  // display:none. `.first()` alone (as payments-adjustments.spec.ts uses
  // for a different, single-rendering selector) isn't enough here since
  // DOM order, not visibility, decides which match is "first" - the
  // table's (possibly hidden) copy comes before the card list's in markup
  // order. `locator.visible()` filters down to whichever copy the current
  // viewport actually shows.
  await page.getByText(/Refunded -/).locator('visible=true').first().waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(300);
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [1280, 1440] as const) {
    test(`Payment history desktop table at ${width}px, no horizontal scroll, sticky actions column (${theme})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width, height: 1000 } });
      const page = await context.newPage();
      await openHistoryModal(page, theme);

      await page.screenshot({
        path: `e2e-screenshots/__screenshots__/payment-history-layout-desktop-${width}-${theme}.png`,
        fullPage: false,
      });

      await context.close();
    });
  }

  test(`Payment history stacked-card layout on a phone-width viewport (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await openHistoryModal(page, theme);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-history-layout-mobile-card-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
