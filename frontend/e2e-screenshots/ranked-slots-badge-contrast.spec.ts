import { test, expect, type Page } from '@playwright/test';

/**
 * Screenshots the SmartBookingForm's ranked-instructor rank badges (#1, #2,
 * #3, #4...) in both light and dark theme, after fixing a Tailwind color-
 * name collision that made them render invisible in both themes (see
 * tailwind.config.js's `appbg` comment and
 * src/__tests__/tailwindColorNameCollisions.test.ts for the root cause).
 * Not a general E2E suite: no visual-regression assertions beyond
 * confirming the badge text renders with the intended color, not the
 * broken one. Requires both dev servers already running (backend :4000,
 * frontend :5173 - see docs/TESTING.md §1) and the repo's seed data loaded
 * (student "Sami Corona" with a pickup address that resolves instructors).
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark'] as const) {
  test(`ranked-slot instructor cards show legible rank badges (${theme})`, async ({ page }) => {
    await page.goto('/lessons');
    await setTheme(page, theme);

    await page.getByRole('button', { name: /book new lesson/i }).click();

    const studentSearch = page.getByPlaceholder(/search by name or email/i);
    await studentSearch.click();
    await studentSearch.fill('Corona');
    const option = page.getByRole('button', { name: /Sami Corona/i });
    await option.waitFor({ state: 'visible' });
    await option.click({ force: true });

    const findBtn = page.getByRole('button', { name: /find available/i });
    await findBtn.waitFor({ state: 'visible' });
    await findBtn.click();

    const firstBadge = page.locator('div.rounded-full.flex.items-center.justify-center.font-bold').first();
    await firstBadge.waitFor({ state: 'visible', timeout: 15000 });

    // The regression this guards: color used to resolve to a value copied
    // from the wrong theme (indistinguishable from the badge's own
    // background), making the text invisible - assert it now resolves to
    // something that actually differs from the background.
    const { color, bg } = await firstBadge.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, bg: cs.backgroundColor };
    });
    expect(color).not.toBe(bg);

    await page.screenshot({
      path: `e2e-screenshots/__screenshots__/ranked-slots-badges-${theme}.png`,
    });
  });
}
