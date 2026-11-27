import { test, type Page } from '@playwright/test';

/**
 * Screenshots the payment-form-v2 redesign of PaymentModal: quick-amount
 * chips built from real student data, no default payment method (with its
 * validation error), the duplicate-payment warning, the overpay credit
 * note, and the post-save confirmation step - light and dark theme, plus
 * one phone-width check.
 *
 * Not a general E2E suite: no visual-regression assertions, just a
 * visible sanity check per screenshot. Requires both dev servers already
 * running (backend :4000, frontend :5173 - see docs/TESTING.md §1) and
 * this tenant's existing seed data (Benjamin Hayes has a real outstanding
 * balance with scheduled/completed lessons, so quick-amount chips render
 * from his real numbers - no throwaway fixtures needed).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1200, height: 1000 };

// Scoped to the modal's own form - the Payments page has two other
// "Record Payment"/"Record payment" buttons outside the modal (the
// toolbar button and WhoOwesYouList's row-level button) that would
// otherwise collide with a bare getByRole lookup.
function submitButton(page: Page) {
  return page.locator('form').getByRole('button', { name: /^record payment$/i });
}

async function openModalForBenjamin(page: Page) {
  await page.goto('/payments');
  await page.getByPlaceholder(/search by student name or email/i).fill('Benjamin Hayes');
  await page.waitForTimeout(300);
  const addPaymentButton = page.getByRole('button', { name: /add payment/i }).first();
  await addPaymentButton.waitFor({ state: 'visible' });
  await addPaymentButton.click();
  await page.getByRole('heading', { name: 'Record Payment' }).waitFor({ state: 'visible' });
  await page.waitForTimeout(500); // let the quick-amounts query resolve
}

for (const theme of ['light', 'dark'] as const) {
  test(`Record Payment form - quick-amount chips from real student data (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await openModalForBenjamin(page);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-form-v2-chips-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Record Payment form - validation error when method is missing (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await openModalForBenjamin(page);

    await page.locator('input[name="amount"]').fill('25');
    await submitButton(page).click();
    await page.getByText(/choose a payment method/i).waitFor({ state: 'visible' });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-form-v2-validation-error-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Record Payment form - duplicate payment warning (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await openModalForBenjamin(page);

    // A fixed, slightly unusual amount/method combo is more likely to
    // already have a same-day match from this tenant's seed data, but if
    // not, record it once ourselves first so the second attempt is a
    // guaranteed duplicate.
    await page.locator('input[name="amount"]').fill('37');
    await page.getByRole('button', { name: 'Check' }).click();
    await page.waitForTimeout(600);

    const alreadyWarned = await page.getByText(/already recorded today/i).isVisible().catch(() => false);
    if (!alreadyWarned) {
      await submitButton(page).click();
      await page.getByText('Payment recorded').waitFor({ state: 'visible', timeout: 10000 });
      await page.getByRole('button', { name: /record another/i }).click();
      await page.locator('input[name="amount"]').fill('37');
      await page.getByRole('button', { name: 'Check' }).click();
      await page.waitForTimeout(600);
    }

    await page.getByText(/already recorded today/i).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-form-v2-duplicate-warning-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Record Payment form - overpay credit note (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await openModalForBenjamin(page);

    await page.locator('input[name="amount"]').fill('999999');
    await page.getByRole('button', { name: 'Venmo' }).click();
    await page.getByText(/leave \$.* credit on account/i).waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-form-v2-overpay-note-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });

  test(`Record Payment - confirmation step after saving (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await openModalForBenjamin(page);

    await page.locator('input[name="amount"]').fill('5');
    await page.getByRole('button', { name: 'Zelle' }).click();
    await submitButton(page).click();
    await page.getByText('Payment recorded').waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-form-v2-confirmation-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}

test('Phone-width check - form with chips and the confirmation step stay fully readable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await openModalForBenjamin(page);

  await page.screenshot({
    path: `e2e-screenshots/__screenshots__/payment-form-v2-phone-chips.png`,
    fullPage: false,
  });

  await page.locator('input[name="amount"]').fill('5');
  await page.getByRole('button', { name: 'Cash' }).click();
  await submitButton(page).click();
  await page.getByText('Payment recorded').waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(300);

  await page.screenshot({
    path: `e2e-screenshots/__screenshots__/payment-form-v2-phone-confirmation.png`,
    fullPage: false,
  });

  await context.close();
});
