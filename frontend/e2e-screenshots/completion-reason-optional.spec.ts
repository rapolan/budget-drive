import { test, type Page } from '@playwright/test';

/**
 * Screenshots item 11's fix: completion reason is optional on the
 * complete path, both light and dark theme.
 *
 * Reproduced live first: the Enrollments tab's per-enrollment "Mark
 * complete" button (EnrollmentSubPanel.tsx, gated only on
 * `enrollment.status === 'active'` + isDriverTraining - NOT on
 * isReadyToMarkComplete, so it's reachable regardless of item 10's
 * eligibility gate) opened a confirm panel whose "Confirm complete"
 * button was disabled until a non-empty reason was typed, even though
 * the backend's /complete route has no validateRequired on reason
 * (unlike /reopen and /withdraw, which both still require one).
 *
 * Fix: dropped the `!reason.trim() ||` clause from all 4 confirm-button
 * disabled expressions (Students.tsx card + table views, StudentModal.tsx
 * Progress-tab and Enrollments-tab confirm panels). Reopen is untouched
 * and still requires a reason.
 *
 * Not a general E2E suite. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the
 * repo's seed data loaded (Jordan Vance: active Driver Training
 * enrollment).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Confirm complete is enabled with an empty reason (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    const row = page.locator('table tbody tr').filter({ hasText: 'Jordan Vance' }).first();
    await row.click();
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: /^enrollments$/i }).click();
    await page.waitForTimeout(400);

    await page.getByRole('button', { name: /^mark complete$/i }).first().click();
    await page.waitForTimeout(400);

    const reasonLabel = page.getByText(/completion reason \(optional\)/i);
    await reasonLabel.waitFor({ state: 'visible' });

    const confirmBtn = page.getByRole('button', { name: /confirm complete/i });
    await confirmBtn.waitFor({ state: 'visible' });
    const isDisabled = await confirmBtn.isDisabled();
    if (isDisabled) {
      throw new Error('Confirm complete is disabled with an empty reason - item 11 regression');
    }

    const modal = page.locator('.rounded-3xl').filter({ hasText: 'Jordan Vance' }).first();
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/completion-reason-optional-${theme}.png`,
      clip: (await modal.boundingBox()) ?? undefined,
    });
  });
}
