import { test, type Page } from '@playwright/test';

/**
 * Screenshots item 1's fix: Mark Complete has no reason step at all -
 * only a plain confirm dialog - both light and dark theme.
 *
 * Supersedes the previous version of this spec (from the prior session's
 * item 11), which made the reason OPTIONAL but left the reason PROMPT
 * itself in place. This task explicitly removed the reason field
 * entirely from the complete path, keeping only a "Mark {student}
 * complete?" yes/no guard against a misclick (completion triggers
 * certificates and is audit-recorded). Reopen is unchanged and still
 * requires a reason.
 *
 * Reproduced live first: the Enrollments tab's per-enrollment "Mark
 * complete" button (EnrollmentSubPanel.tsx, gated only on
 * `enrollment.status === 'active'` + isDriverTraining - NOT on
 * isReadyToMarkComplete, so it's reachable regardless of the eligibility
 * gate elsewhere) still showed a "Completion reason (optional)" input
 * even after that field became optional. Fix: replaced all 4 complete-
 * path confirm panels (Students.tsx card + table views, StudentModal.tsx
 * Progress-tab and Enrollments-tab) with a plain confirm - no input at
 * all - and call enrollmentsApi.complete with no argument.
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
  test(`Mark Complete shows only a confirm dialog, no reason field (${theme})`, async ({ page }) => {
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

    const confirmPrompt = page.getByText(/mark jordan vance complete\?/i);
    await confirmPrompt.waitFor({ state: 'visible' });

    const reasonField = page.getByPlaceholder(/completion reason/i);
    if (await reasonField.isVisible().catch(() => false)) {
      throw new Error('A reason field is still present on the complete path - item 1 regression');
    }
    const reasonLabel = page.getByText(/reason \(optional\)/i);
    if (await reasonLabel.isVisible().catch(() => false)) {
      throw new Error('A "reason (optional)" label is still present on the complete path - item 1 regression');
    }

    const confirmBtn = page.getByRole('button', { name: /confirm complete/i });
    await confirmBtn.waitFor({ state: 'visible' });
    if (await confirmBtn.isDisabled()) {
      throw new Error('Confirm complete is disabled - it should be a plain, always-enabled confirm');
    }

    const modal = page.locator('.rounded-3xl').filter({ hasText: 'Jordan Vance' }).first();
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/mark-complete-no-reason-${theme}.png`,
      clip: (await modal.boundingBox()) ?? undefined,
    });
  });
}
