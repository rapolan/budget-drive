import { test, type Page } from '@playwright/test';

/**
 * Screenshots the payments-adjustments additions: payment history with
 * refund and void lines, the Refund dialog, the Void dialog, the Payment
 * Arrangement dialog, and a receipt with a refund line - light and dark
 * theme.
 *
 * Not a general E2E suite: no visual-regression assertions, just a
 * visible sanity check per screenshot. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1) and
 * live-created adjustment data for this tenant (created once via direct
 * API calls before this spec was written, NOT seeded by this spec itself -
 * see docs/TESTING.md's payments-adjustments section for the exact
 * payments/enrollment used):
 *   - Ava Mitchell: a $50 payment with a $20 partial refund already
 *     recorded against it ($30 remaining).
 *   - Marcus Lee: a $100 payment fully voided.
 *   - Benjamin Hayes: his active driver_training enrollment has a payment
 *     arrangement note set ("Paying $50/month until balance clears"),
 *     so his Who Owes You row shows the amber badge instead of the red
 *     age-bucket badge.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1200, height: 1000 };

for (const theme of ['light', 'dark'] as const) {
  test(`Payment history with refund and void lines (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByPlaceholder(/search by student name or email/i).fill('Ava Mitchell');
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.getByText('Payment History').waitFor({ state: 'visible' });
    // Wait for the refund line (indented sub-row) to actually render.
    await page.getByText(/Refunded -/).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-adjustments-history-refund-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Payment history with a voided payment (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByPlaceholder(/search by student name or email/i).fill('Marcus Lee');
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.getByText('Payment History').waitFor({ state: 'visible' });
    await page.getByText('Voided', { exact: true }).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-adjustments-history-void-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Refund dialog (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByPlaceholder(/search by student name or email/i).fill('Ava Mitchell');
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.getByText('Payment History').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    const menuTrigger = page.getByRole('button', { name: /payment actions/i }).first();
    await menuTrigger.waitFor({ state: 'visible' });
    await menuTrigger.click();
    const refundButton = page.getByRole('button', { name: /^refund$/i });
    await refundButton.waitFor({ state: 'visible' });
    await refundButton.click();
    await page.getByRole('heading', { name: 'Refund' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-adjustments-refund-dialog-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Void dialog (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByPlaceholder(/search by student name or email/i).fill('Ava Mitchell');
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.getByText('Payment History').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    const menuTrigger = page.getByRole('button', { name: /payment actions/i }).first();
    await menuTrigger.waitFor({ state: 'visible' });
    await menuTrigger.click();
    const voidButton = page.getByRole('button', { name: /^void$/i });
    await voidButton.waitFor({ state: 'visible' });
    await voidButton.click();
    await page.getByRole('heading', { name: 'Void' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-adjustments-void-dialog-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Payment arrangement dialog (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByPlaceholder(/search by student name or email/i).fill('Benjamin Hayes');
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.getByText('Payment History').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    // Benjamin Hayes already has an arrangement set, so the header shows
    // the amber badge itself (clickable for an admin) rather than a
    // separate "Set arrangement" button.
    const badge = page.getByRole('button', { name: /payment arrangement/i });
    await badge.waitFor({ state: 'visible' });
    await badge.click();
    await page.getByRole('heading', { name: 'Payment Arrangement' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-adjustments-arrangement-dialog-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Who Owes You shows the arrangement badge instead of the age-bucket badge (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByText('Who Owes You').waitFor({ state: 'visible' });
    await page.getByText('Payment arrangement').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-adjustments-who-owes-you-arrangement-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Receipt with a refund line (${theme})`, async ({ browser, context: baseContext }) => {
    const context = await browser.newContext({ viewport: { width: 900, height: 900 }, storageState: await baseContext.storageState() });
    const page = await context.newPage();

    await page.goto('/payments');
    await page.waitForTimeout(500);
    await page.getByPlaceholder(/search by student name or email/i).fill('Ava Mitchell');
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('table').getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.waitForTimeout(500);

    const menuTrigger = page.getByRole('button', { name: /payment actions/i }).first();
    await menuTrigger.waitFor({ state: 'visible' });
    await menuTrigger.click();
    const receiptButton = page.getByRole('button', { name: /print receipt/i });
    await receiptButton.waitFor({ state: 'visible' });

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      receiptButton.click(),
    ]);
    await newPage.waitForLoadState('networkidle');
    await setTheme(newPage, theme);
    await newPage.getByText('Net paid').waitFor({ state: 'visible', timeout: 10000 });
    await newPage.waitForTimeout(500);

    await newPage.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-adjustments-receipt-refund-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
