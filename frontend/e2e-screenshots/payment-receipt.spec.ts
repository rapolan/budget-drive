import { test, type Page } from '@playwright/test';

/**
 * Screenshots the printable payment receipt page (payments-phase1, item
 * 5), both light and dark. Requires both dev servers running and a real
 * payment id for this tenant - the spec looks one up live via the Payments
 * page's own History modal rather than hardcoding one, so it keeps
 * working if seed data changes.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 900, height: 900 };

for (const theme of ['light', 'dark'] as const) {
  test(`Payment receipt print page (${theme})`, async ({ browser, context: baseContext }) => {
    const context = await browser.newContext({ viewport: VIEWPORT, storageState: await baseContext.storageState() });
    const page = await context.newPage();

    // Find a real payment id via the Payments page's own History modal -
    // search for a student known to have a confirmed payment on this
    // tenant's seed data (Ava Mitchell), rather than just the first row
    // alphabetically, which may have zero payments and so no receipt icon.
    await page.goto('/payments');
    await page.waitForTimeout(500);
    await page.getByPlaceholder(/search by student name or email/i).fill('Ava Mitchell');
    await page.waitForTimeout(300);
    const historyButton = page.getByRole('button', { name: /view payment history/i }).first();
    await historyButton.waitFor({ state: 'visible' });
    await historyButton.click();
    await page.waitForTimeout(500);

    const receiptButton = page.getByRole('button', { name: /print receipt/i }).first();
    await receiptButton.waitFor({ state: 'visible', timeout: 10000 });

    // Capture the receipt page's own URL instead of clicking through (the
    // click opens a new tab via window.open, which Playwright can catch,
    // but reading the href directly is simpler and just as real).
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      receiptButton.click(),
    ]);
    await newPage.waitForLoadState('networkidle');
    await setTheme(newPage, theme);
    await newPage.waitForTimeout(500);

    await newPage.screenshot({
      path: `e2e-screenshots/__screenshots__/payment-receipt-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
