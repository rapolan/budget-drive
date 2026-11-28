import { test, type Page, type APIRequestContext } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Screenshots the payments-dates-and-cards "Collected This Calendar
 * Month" card redesign: net-after-refunds as the big figure, the small
 * "$X collected, $Y refunded" breakdown line, before and after a real
 * refund - light and dark theme, plus one phone-width check.
 *
 * Not a general E2E suite: no visual-regression assertions, just a
 * visible sanity check per screenshot. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1).
 *
 * Creates its own self-contained fixture in beforeAll (direct API calls,
 * same pattern as payment-before-booking.spec.ts): a fresh student with a
 * $200 payment recorded today (shows up in this calendar month's
 * "collected" figure with no refund yet - the "before" screenshot), then
 * a $50 refund against that same payment (the "after" screenshot - net
 * drops to $150, with the breakdown line showing both the gross collected
 * and refunded amounts). Leaves the student/payment/adjustment behind in
 * the dev DB afterward, by design, matching this repo's other one-shot
 * fixture-creating specs.
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

let paymentId: string;

test.beforeAll(async ({ request }) => {
  const token = tokenFromStorageState();
  const uniqueSuffix = Date.now();

  const studentResp = await api(request, token, '/students', {
    method: 'POST',
    data: {
      fullName: `CardDemo Refund${uniqueSuffix}`,
      email: `carddemo-refund+${uniqueSuffix}@example.com`,
      phone: '(555) 000-0500',
      dateOfBirth: '1995-01-01',
      address: '1 Demo St',
      city: 'Demo City',
      state: 'CA',
      zipCode: '90001',
    },
  });
  if (studentResp.status !== 201) {
    throw new Error(`Failed to create demo student: ${studentResp.status} ${JSON.stringify(studentResp.json)}`);
  }
  const studentId = studentResp.json.data.id;

  const paymentResp = await api(request, token, '/payments', {
    method: 'POST',
    data: {
      studentId,
      amount: 200,
      paymentMethod: 'cash',
    },
  });
  if (paymentResp.status !== 201) {
    throw new Error(`Failed to create demo payment: ${paymentResp.status} ${JSON.stringify(paymentResp.json)}`);
  }
  paymentId = paymentResp.json.data.id;
});

async function openPaymentsPage(page: Page, theme: 'light' | 'dark') {
  await page.goto('/payments');
  await setTheme(page, theme);
  await page.waitForTimeout(500);
  await page.getByText(/Collected This Calendar Month/).waitFor({ state: 'visible', timeout: 10000 });
  // Let the two period-summary queries (this month, last month) resolve
  // past their own loading placeholder.
  await page.waitForTimeout(500);
}

for (const theme of ['light', 'dark'] as const) {
  test(`Collected This Calendar Month card - before the refund (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
    const page = await context.newPage();
    await openPaymentsPage(page, theme);

    const collectedCard = page.getByText(/Collected This Calendar Month/).locator('../..');
    await collectedCard.scrollIntoViewIfNeeded();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-dates-and-cards-before-refund-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}

test('Record the refund (direct API call, not a UI screenshot step)', async ({ request }) => {
  const token = tokenFromStorageState();
  const refundResp = await api(request, token, `/payments/${paymentId}/adjustments`, {
    method: 'POST',
    data: {
      adjustmentType: 'refund',
      amount: 50,
      reasonCode: 'overpaid',
    },
  });
  if (refundResp.status !== 201) {
    throw new Error(`Failed to record demo refund: ${refundResp.status} ${JSON.stringify(refundResp.json)}`);
  }
});

for (const theme of ['light', 'dark'] as const) {
  test(`Collected This Calendar Month card - after the refund, net and breakdown line (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
    const page = await context.newPage();
    await openPaymentsPage(page, theme);
    // The breakdown line only renders once the period summary has
    // resolved with a non-zero refunded amount - wait for it explicitly
    // rather than a fixed timeout.
    await page.getByText(/collected, .* refunded/).waitFor({ state: 'visible', timeout: 10000 });

    const collectedCard = page.getByText(/Collected This Calendar Month/).locator('../..');
    await collectedCard.scrollIntoViewIfNeeded();

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-dates-and-cards-after-refund-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}

test('Phone-width check - card stays fully readable with the breakdown line', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await openPaymentsPage(page, 'light');
  await page.getByText(/collected, .* refunded/).waitFor({ state: 'visible', timeout: 10000 });

  const collectedCard = page.getByText(/Collected This Calendar Month/).locator('../..');
  await collectedCard.scrollIntoViewIfNeeded();

  await page.screenshot({
    path: `e2e-screenshots/__screenshots__/payment-dates-and-cards-phone.png`,
    fullPage: false,
  });

  await context.close();
});
