import { test, type Page } from '@playwright/test';

/**
 * Screenshots the payments-actions additions: the "Record payment"
 * button and summary strip in PaymentHistoryModal, the row-level
 * "Record payment" button in WhoOwesYouList, and the phone/email/
 * student-record links in the history modal - light and dark theme.
 *
 * Not a general E2E suite: no visual-regression assertions, just a
 * visible sanity check per screenshot. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1) and
 * this tenant's existing seed data (Benjamin Hayes has a real outstanding
 * balance and shows in "Who Owes You" - no throwaway fixtures needed).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1200, height: 1000 };

for (const theme of ['light', 'dark'] as const) {
  test(`History modal - Record payment button and summary strip (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByPlaceholder(/search by student name or email/i).fill('Benjamin Hayes');
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.getByText('Payment History').waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-actions-history-modal-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Who Owes You - row-level Record payment button (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByText('Who Owes You').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-actions-who-owes-you-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Who Owes You row's Record payment button opens PaymentModal directly (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    const whoOwesYouHeading = page.getByText('Who Owes You');
    await whoOwesYouHeading.waitFor({ state: 'visible' });
    // Scoped to the Who Owes You panel specifically - the page's own
    // toolbar also has a "Record Payment" button that would otherwise be
    // matched first by DOM order.
    const whoOwesYouPanel = page.locator('div').filter({ has: whoOwesYouHeading }).last();
    const recordPaymentButton = whoOwesYouPanel.getByRole('button', { name: /record payment/i }).first();
    await recordPaymentButton.waitFor({ state: 'visible' });
    await recordPaymentButton.click();
    await page.getByRole('heading', { name: 'Record Payment' }).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-actions-record-from-row-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
