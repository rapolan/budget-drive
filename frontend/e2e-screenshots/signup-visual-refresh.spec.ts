import { test, expect, Page } from '@playwright/test';
import { execSync } from 'child_process';

/**
 * Live, visual verification of the signup/login/onboarding glass refresh
 * (AuthPageShell, GlassInput, GlassSelect). Captures light+dark
 * screenshots of every surface the task asked for, and programmatically
 * checks body-text contrast on each new surface against WCAG AA's 4.5:1
 * minimum - not just a visual spot-check.
 *
 * Requires: backend on :4000, frontend on :5173 (see docs/TESTING.md §1).
 */

const DB_NAME = process.env.E2E_DB_NAME || 'polish_visual_test';

function generateInviteCode(): string {
  const output = execSync(
    `npm run signup:invite -- generate --label "Visual refresh spec run"`,
    { cwd: '../backend', env: { ...process.env, DB_NAME, FRONTEND_URL: 'http://localhost:5173' } }
  ).toString();
  const match = output.match(/code=([a-f0-9]+)/);
  if (!match) throw new Error(`Could not extract invite code from CLI output:\n${output}`);
  return match[1];
}

/**
 * Reads getComputedStyle(el).color (the text color the browser actually
 * renders) and walks up the DOM compositing every ancestor's background
 * color - including its opacity - onto a white canvas base, so a
 * translucent surface (bg-surface/80 etc.) is checked against what it
 * ACTUALLY renders over, not just its own nominal color in isolation.
 */
async function textContrastRatio(page: Page, selector: string): Promise<number> {
  return page.locator(selector).first().evaluate((el) => {
    function relLum(r: number, g: number, b: number) {
      const [rs, gs, bs] = [r, g, b].map((c) => {
        const cs = c / 255;
        return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    }
    function parseColor(c: string): [number, number, number, number] {
      const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (!m) return [255, 255, 255, 0];
      return [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), m[4] !== undefined ? parseFloat(m[4]) : 1];
    }

    const textColorStr = getComputedStyle(el).color;
    const [tr, tg, tb] = parseColor(textColorStr);

    // Composite every ancestor background (back to front) onto white.
    let [br, bg, bb] = [255, 255, 255];
    const chain: Element[] = [];
    let cur: Element | null = el;
    while (cur) {
      chain.push(cur);
      cur = cur.parentElement;
    }
    chain.reverse();
    for (const node of chain) {
      const bgStr = getComputedStyle(node).backgroundColor;
      const [r, g, b, a] = parseColor(bgStr);
      if (a > 0) {
        br = r * a + br * (1 - a);
        bg = g * a + bg * (1 - a);
        bb = b * a + bb * (1 - a);
      }
    }

    const textLum = relLum(tr, tg, tb);
    const bgLum = relLum(br, bg, bb);
    const lighter = Math.max(textLum, bgLum);
    const darker = Math.min(textLum, bgLum);
    return (lighter + 0.05) / (darker + 0.05);
  });
}

test('visual refresh: light/dark screenshots + contrast checks for Signup, Login, and every wizard step', async ({ browser }) => {
  const code = generateInviteCode();

  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);

    // --- Signup: empty ---
    await page.goto(`/signup#code=${code}`);
    await expect(page).toHaveURL('/signup');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `e2e-screenshots/__screenshots__/refresh-signup-empty-${theme}.png` });

    const signupHeadingContrast = await textContrastRatio(page, 'h1');
    expect(signupHeadingContrast, `Signup h1 contrast in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
    const signupLabelContrast = await textContrastRatio(page, 'label');
    expect(signupLabelContrast, `Signup label contrast in ${theme} mode`).toBeGreaterThanOrEqual(4.5);

    // --- Signup: with a validation error ---
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(/please fill in every field/i)).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `e2e-screenshots/__screenshots__/refresh-signup-error-${theme}.png` });

    const errorTextContrast = await textContrastRatio(page, 'p.text-status-danger-text');
    expect(errorTextContrast, `Signup error text contrast in ${theme} mode`).toBeGreaterThanOrEqual(4.5);

    // --- Login ---
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `e2e-screenshots/__screenshots__/refresh-login-${theme}.png` });

    const loginHeadingContrast = await textContrastRatio(page, 'h1');
    expect(loginHeadingContrast, `Login h1 contrast in ${theme} mode`).toBeGreaterThanOrEqual(4.5);
    const loginLabelContrast = await textContrastRatio(page, 'label');
    expect(loginLabelContrast, `Login label contrast in ${theme} mode`).toBeGreaterThanOrEqual(4.5);

    await context.close();
  }
});

/**
 * Drives the wizard once per theme, start to finish, screenshotting and
 * contrast-checking each step along the way. Two full passes (one per
 * theme) rather than reloading mid-flow to flip themes - reloading
 * between steps re-resolves OnboardingWizardPage's resume-step heuristic
 * from whatever settings have been saved so far, which doesn't match
 * "I'm still looking at step N, just in the other theme" (confirmed
 * directly: it lands on a different step than expected).
 */
async function runWizardPass(page: import('@playwright/test').Page, theme: 'light' | 'dark', code: string) {
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);

  await page.goto(`/signup#code=${code}`);
  await page.locator('#schoolName').fill('Visual Refresh School');
  await page.locator('#ownerFullName').fill('Refresh Owner');
  await page.locator('#ownerEmail').fill(`refresh-owner-${theme}-${Date.now()}@example.com`);
  await page.locator('#ownerPassword').fill('RefreshPassword123!');
  await page.locator('#confirmPassword').fill('RefreshPassword123!');
  await page.locator('#termsAccepted').check();
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL('/onboarding');

  const captureStep = async (name: string) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `e2e-screenshots/__screenshots__/refresh-wizard-${name}-${theme}.png` });
    const h2Contrast = await textContrastRatio(page, 'h2');
    expect(h2Contrast, `Wizard ${name} h2 contrast (${theme})`).toBeGreaterThanOrEqual(4.5);
  };

  // Step 1: School Details
  await expect(page.getByRole('heading', { name: /school details/i })).toBeVisible();
  await captureStep('step1-school-details');

  await page.getByLabel(/^Phone$/i).fill('6195550142');
  await page.getByLabel(/^Address line 1$/i).fill('100 Driving Way');
  await page.getByLabel(/^City$/i).fill('Metropolis');
  await page.getByRole('button', { name: /save & continue/i }).click();

  // Step 2: Offerings
  await expect(page.getByText(/what does your school offer/i)).toBeVisible();
  await captureStep('step2-offerings');

  const deHeading = page.getByText('Driver Education classroom', { exact: true });
  const deSwitch = deHeading.locator('xpath=../following-sibling::button[@role="switch"]');
  await deSwitch.click();
  await page.getByRole('button', { name: /save & continue/i }).click();

  // Step 3: Defaults
  await expect(page.getByText(/pricing & scheduling defaults/i)).toBeVisible();
  await captureStep('step3-defaults');
  await page.getByRole('button', { name: /skip for now/i }).click();

  // Step 4: Team
  await expect(page.getByText(/add your first instructor/i)).toBeVisible();
  await captureStep('step4-team');
  await page.getByRole('button', { name: /skip for now/i }).click();

  // Step 5: Done
  await expect(page.getByText(/you're all set/i)).toBeVisible();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `e2e-screenshots/__screenshots__/refresh-wizard-step5-done-${theme}.png` });
}

test('visual refresh: wizard steps, light, via a real signup + real navigation', async ({ page }) => {
  const code = generateInviteCode();
  await runWizardPass(page, 'light', code);
});

test('visual refresh: wizard steps, dark, via a real signup + real navigation', async ({ page }) => {
  const code = generateInviteCode();
  await runWizardPass(page, 'dark', code);
});
