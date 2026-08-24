import { test, type Page } from '@playwright/test';

/**
 * Screenshots the student progress view's Achievement Badges (Mile One /
 * Cali Cruiser / The Golden Ticket), replacing the old percentage-based
 * milestones section - shown on a student with a mix of earned and locked
 * badges (Priya Anand, seeded with 1 of 3 driver_training lessons
 * completed), both light and dark theme. Not a general E2E suite: no
 * visual-regression assertions. Requires both dev servers already running
 * (backend :4000, frontend :5173 - see docs/TESTING.md §1) and the repo's
 * seed data loaded.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`Student progress view shows earned and locked achievement badges (${theme})`, async ({ page }) => {
    await page.goto('/students');
    await setTheme(page, theme);
    await page.waitForTimeout(800);

    await page.getByText('Priya Anand').first().click();
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: /^progress$/i }).click();
    await page.waitForTimeout(400);

    const badgesHeading = page.getByText('Achievement Badges');
    await badgesHeading.waitFor({ state: 'visible' });

    // No percentage anywhere in this section - only the progress bar above
    // it (outside the badges block) is allowed to show one.
    const badgesSection = badgesHeading.locator('..');
    const badgesText = await badgesSection.textContent();
    if (badgesText?.includes('%')) {
      throw new Error('Achievement Badges section must not show a percentage');
    }

    await badgesSection.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/students-achievement-badges-${theme}.png`,
      clip: await badgesSection.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12), width: r.width + 24, height: r.height + 24 };
      }),
    });
  });
}
