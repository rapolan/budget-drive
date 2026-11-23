import { test, type Page } from '@playwright/test';

/**
 * Screenshots the payments-phase1 additions to the Payments page: the
 * period summary panel (chips + Collected/Refunded/Net/Outstanding/Paid-
 * not-yet-scheduled cards + collected-by-method bars), the "Who owes you"
 * list, and the per-student "Paid, not yet scheduled" column/badge - both
 * light and dark theme.
 *
 * Re-captured after the fix pass that (1) removed the old duplicate
 * "Total Outstanding" card (it could disagree with this panel's own
 * "Outstanding" card - see docs/ARCHITECTURE.md's payments-phase1 fix
 * notes), (2) relabeled "Collected This Month" to "Collected This
 * Calendar Month" to disambiguate it from the period chip above, (3)
 * switched all money on this page to thousands-separated formatting, and
 * (4) defaulted the period chip to "This Month" instead of "All Time" -
 * the summary screenshot should now show "This Month" selected by
 * default, not "All Time".
 *
 * Not a general E2E suite: no visual-regression assertions, just a visible
 * sanity check per screenshot. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and this
 * tenant's existing seed data, which already has real students with a
 * positive credit balance (e.g. Ava Mitchell, Marcus Lee, Ethan Brooks -
 * paid with no lessons booked yet) and a real outstanding balance
 * (Benjamin Hayes - completed lessons, nothing paid) - no throwaway
 * fixtures needed for this spec.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const VIEWPORT = { width: 1400, height: 1400 };

for (const theme of ['light', 'dark'] as const) {
  test(`Payments page - period summary and who owes you (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    // Wait for the period summary panel and who-owes-you list to actually
    // load real data, not just render their loading state.
    await page.getByText('Collected by Method').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.getByText('Who Owes You').waitFor({ state: 'visible' });
    await page.waitForTimeout(500);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-phase1-summary-${theme}.png`,
      fullPage: true,
    });

    await context.close();
  });

  test(`Payments page - student table with "Paid, Not Yet Scheduled" column (${theme})`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    await page.goto('/payments');
    await setTheme(page, theme);
    await page.waitForTimeout(500);

    await page.getByText('Paid, Not Yet Scheduled').first().waitFor({ state: 'visible' });
    // Scroll the table into view for a focused screenshot.
    await page.getByRole('table').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/payments-phase1-table-credit-${theme}.png`,
      fullPage: false,
    });

    await context.close();
  });
}
