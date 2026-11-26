import { test, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Screenshots the payment-history-layout fixes: the Payment History
 * modal's merged Type+Applied To and Reference #+Details columns, the
 * sticky Actions column, the widened desktop modal (1280px and 1440px),
 * the stacked-card layout on a phone-width viewport, and (review fix)
 * PaymentRowMenu's portaled dropdown opened on the first row, the last
 * row (where it has to flip above the trigger instead of below), and
 * with a single payment on file - light and dark theme.
 *
 * Creates TWO self-contained fixtures in beforeAll (fresh students, via
 * direct API calls - same pattern as widget-day-closing-actions.spec.ts)
 * rather than depending on another spec's hand-seeded live data:
 * - `studentName` / `paymentId`: one confirmed payment with both a
 *   reference number and a long note (to exercise the merged Details
 *   column's truncation/title behavior), plus a partial refund against
 *   it (to exercise the indented adjustment-line rendering
 *   payments-adjustments.spec.ts already covers) - used for the general
 *   layout screenshots and the "single payment" menu screenshot.
 * - `manyPaymentsStudentName`: EIGHT confirmed payments on one student,
 *   so the table has enough rows that its last row's trigger sits near
 *   the bottom of a normal-height viewport once scrolled into view -
 *   the actual condition PaymentRowMenu's flip-above logic needs to
 *   fire for real, not just in a mocked unit test.
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
let manyPaymentsStudentName: string;

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

  // Second student with EIGHT payments (review fix) - enough rows that
  // the last one sits near the bottom of a normal-height viewport once
  // scrolled into view, so the flip-above-the-trigger screenshot proves
  // the real condition, not a contrived one.
  const manyUniqueSuffix = uniqueSuffix + 1;
  manyPaymentsStudentName = `LayoutDemoMany Student${manyUniqueSuffix}`;
  const manyStudentResp = await api(request, token, '/students', {
    method: 'POST',
    data: {
      fullName: manyPaymentsStudentName,
      email: `layoutdemomany+${manyUniqueSuffix}@example.com`,
      phone: '(555) 000-0200',
      dateOfBirth: '1995-01-01',
      address: '1 Demo St',
      city: 'Demo City',
      state: 'CA',
      zipCode: '90001',
    },
  });
  if (manyStudentResp.status !== 201) {
    throw new Error(`Failed to create many-payments demo student fixture: ${manyStudentResp.status} ${JSON.stringify(manyStudentResp.json)}`);
  }
  const manyStudentId = manyStudentResp.json.data.id;

  for (let i = 0; i < 8; i++) {
    const resp = await api(request, token, '/payments', {
      method: 'POST',
      data: {
        studentId: manyStudentId,
        amount: 50,
        paymentMethod: 'cash',
        paymentType: 'lesson_payment',
      },
    });
    if (resp.status !== 201) {
      throw new Error(`Failed to create many-payments fixture payment #${i}: ${resp.status} ${JSON.stringify(resp.json)}`);
    }
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

  // Review fix: PaymentRowMenu's dropdown used to be clipped to a thin
  // grey sliver by the table's own overflow-x-auto/overflow-hidden
  // wrapper, with later rows painting over whatever did render. Now
  // portaled to document.body with fixed positioning - these three
  // screenshots prove every menu item is fully visible with nothing
  // clipped, on the first row, the last row (flipped above the trigger),
  // and with a single payment on file.
  test(`Payment row menu open on the FIRST row, fully visible, no clipping (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);
    await page.getByPlaceholder(/search by student name or email/i).fill(manyPaymentsStudentName);
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.getByText('Payment History').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    const table = page.getByRole('table');
    const firstRowTrigger = table.getByRole('button', { name: /payment actions/i }).first();
    await firstRowTrigger.waitFor({ state: 'visible' });
    await firstRowTrigger.scrollIntoViewIfNeeded();
    await firstRowTrigger.click();
    await page.getByRole('button', { name: /^void$/i }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-history-layout-row-menu-first-row-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Payment row menu open on the LAST row, flipped above the trigger, fully visible (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);
    await page.getByPlaceholder(/search by student name or email/i).fill(manyPaymentsStudentName);
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.getByText('Payment History').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    const table = page.getByRole('table');
    const triggers = table.getByRole('button', { name: /payment actions/i });
    const lastRowTrigger = triggers.last();
    await lastRowTrigger.waitFor({ state: 'visible' });
    // Scroll the trigger to the BOTTOM of the viewport (not just into
    // view) so there's deliberately little room below it - the exact
    // condition the flip-above logic needs to actually fire, not just a
    // row that happens to be last in DOM order but still has headroom.
    await lastRowTrigger.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(200);
    await lastRowTrigger.click();
    await page.getByRole('button', { name: /^void$/i }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-history-layout-row-menu-last-row-flipped-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Payment row menu open with a single payment on file, fully visible (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await openHistoryModal(page, theme);

    const table = page.getByRole('table');
    const trigger = table.getByRole('button', { name: /payment actions/i }).first();
    await trigger.click();
    await page.getByRole('button', { name: /^refund$/i }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-history-layout-row-menu-single-payment-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
