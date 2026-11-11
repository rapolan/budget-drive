import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Live, end-to-end reproduction of the invite-code signup + first-login
 * onboarding wizard + dashboard getting-started checklist feature, run
 * against a real backend/Postgres (not mocked). Generates its own invite
 * code via the real CLI (signup:invite), so this spec is self-contained
 * and can be re-run against any throwaway DB that has migration 006
 * applied.
 *
 * Requires: backend running on :4000 against the DB named by DB_NAME
 * below (must match the backend process's own DB_NAME), frontend on
 * :5173 (see docs/TESTING.md §1), and the backend already built
 * (dist/scripts/signupInviteCli.js present).
 *
 * This spec is NOT part of the auth.setup.ts chromium project (it has no
 * dependency on a pre-seeded admin account) - it creates its own tenant
 * via signup itself, then uses that session directly.
 */

const DB_NAME = process.env.E2E_DB_NAME || 'e2e_signup_test';
const SCHOOL_NAME = `E2E Driving School ${Date.now()}`;
const OWNER_EMAIL = `e2e-owner-${Date.now()}@example.com`;
const OWNER_PASSWORD = 'E2EOwnerPassword123!';

function generateInviteCode(): string {
  const output = execSync(
    `npm run signup:invite -- generate --label "E2E spec run"`,
    { cwd: '../backend', env: { ...process.env, DB_NAME, FRONTEND_URL: 'http://localhost:5173' } }
  ).toString();
  const match = output.match(/code=([a-f0-9]+)/);
  if (!match) throw new Error(`Could not extract invite code from CLI output:\n${output}`);
  return match[1];
}

/**
 * Runs a read-only query against the throwaway DB via the backend's own
 * already-installed `pg` dependency (the frontend package deliberately
 * has no DB driver of its own, per CLAUDE.md's "no new dependencies
 * without asking first") and returns the parsed JSON rows.
 */
function queryDb(sql: string, params: unknown[]): any[] {
  const script = `
    const { Client } = require('pg');
    (async () => {
      const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: ${JSON.stringify(DB_NAME)},
      });
      await client.connect();
      const result = await client.query(${JSON.stringify(sql)}, ${JSON.stringify(params)});
      console.log(JSON.stringify(result.rows));
      await client.end();
    })();
  `;
  // Written to a temp .js file rather than passed inline via `node -e` -
  // execSync on Windows routes through a shell that mangles backslash
  // escapes in a large inline string (observed directly: a `node -e`
  // invocation here failed with "Expected unicode escape" even though the
  // same script string was valid JS). Placed inside ../backend itself
  // (not the OS tmpdir) so `require('pg')` resolves against the backend's
  // own node_modules - Node resolves relative to the SCRIPT's directory,
  // not the process cwd.
  const tmpFile = path.join(process.cwd(), '..', 'backend', `.e2e-query-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(tmpFile, script);
  try {
    const output = execSync(`node "${tmpFile}"`, { cwd: '../backend', env: process.env }).toString();
    return JSON.parse(output.trim().split('\n').pop() as string);
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

test('dark mode: signup page renders correctly', async ({ browser }) => {
  // Isolated in its own fresh browser context, entirely separate from the
  // main flow below - interleaving theme toggles with the real signup/
  // wizard/dashboard navigation proved flaky (localStorage writes
  // sometimes didn't take effect before the following reload/goto raced
  // ahead), so dark-mode is captured here as its own clean page with
  // theme set via addInitScript before any app code runs.
  const darkScreenshotCode = generateInviteCode();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto(`/signup#code=${darkScreenshotCode}`);
  await expect(page).toHaveURL('/signup');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/signup-dark.png' });
  await context.close();
});

test('full signup -> onboarding wizard -> dashboard checklist flow, with real DB rows and single-use enforcement', async ({ page }) => {
  const code = generateInviteCode();

  // --- Step 1: open the signup link, exactly as a school would ---
  await page.goto(`/signup#code=${code}`);
  await expect(page).toHaveURL('/signup');

  await page.locator('#schoolName').fill(SCHOOL_NAME);
  await page.locator('#ownerFullName').fill('E2E Owner');
  await page.locator('#ownerEmail').fill(OWNER_EMAIL);
  await page.locator('#ownerPassword').fill(OWNER_PASSWORD);
  await page.locator('#confirmPassword').fill(OWNER_PASSWORD);
  await page.locator('#termsAccepted').check();

  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/signup-filled-light.png' });

  await page.getByRole('button', { name: /create account/i }).click();

  // --- Step 2: lands on the wizard ---
  await page.waitForURL('/onboarding');
  await expect(page.getByText(/set up your school/i)).toBeVisible();

  // Step 1 of the wizard: School Details (not skippable).
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/onboarding-step1-light.png' });
  const phoneInput = page.getByText('Phone', { exact: true }).locator('xpath=following-sibling::input');
  await phoneInput.fill('555-867-5309');
  const addr1Input = page.getByText('Address line 1', { exact: true }).locator('xpath=following-sibling::input');
  await addr1Input.fill('100 Driving Way');
  const cityInput = page.getByText('City', { exact: true }).locator('xpath=following-sibling::input');
  await cityInput.fill('Metropolis');
  await page.getByRole('button', { name: /save & continue/i }).click();

  // Step 2: Offerings - enable Driver Education, confirm it drives Classroom later.
  await expect(page.getByText(/what does your school offer/i)).toBeVisible();
  // DOM shape: <div class="flex ... row"><div><p>heading</p><p>desc</p></div><button role="switch">...
  // The switch is a following-sibling of the heading's immediate parent div.
  const deHeading = page.getByText('Driver Education classroom', { exact: true });
  const deSwitch = deHeading.locator('xpath=../following-sibling::button[@role="switch"]');
  await deSwitch.click();
  await expect(deSwitch).toHaveAttribute('aria-checked', 'true');
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/onboarding-step2-de-enabled-light.png' });
  await page.getByRole('button', { name: /save & continue/i }).click();

  // Step 3: Defaults (skippable) - classroom price field should now be visible.
  await expect(page.getByText(/pricing & scheduling defaults/i)).toBeVisible();
  await expect(page.getByText(/classroom course price/i)).toBeVisible();
  await page.getByRole('button', { name: /skip for now/i }).click();

  // Step 4: Team (skippable) - skip.
  await expect(page.getByText(/add your first instructor/i)).toBeVisible();
  await page.getByRole('button', { name: /skip for now/i }).click();

  // Step 5: Done - shows the checklist inline too.
  await expect(page.getByText(/you're all set/i)).toBeVisible();
  await expect(page.getByTestId('getting-started-checklist')).toBeVisible();
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/onboarding-done-light.png' });

  await page.getByRole('button', { name: /go to dashboard/i }).click();

  // --- Step 3: lands on the dashboard with the checklist ---
  await page.waitForURL('/');
  await expect(page.getByTestId('getting-started-checklist')).toBeVisible();
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/dashboard-with-checklist-light.png' });

  // Dark mode screenshot - this app's dark mode is an explicit toggle
  // (useTheme()/toggleTheme, Header.tsx's Sun/Moon button). Nothing
  // earlier in this test has touched the theme, so it starts light here.
  await expect(page.getByRole('button', { name: /switch to dark mode/i })).toBeVisible();
  await page.getByRole('button', { name: /switch to dark mode/i }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByTestId('getting-started-checklist')).toBeVisible();
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/dashboard-with-checklist-dark.png' });
  await page.getByRole('button', { name: /switch to light mode/i }).click();

  // --- Classroom appears in the nav WITHOUT a reload ---
  // Already true at this point, since enabling Driver Education in step 2
  // called refreshSettings() and Sidebar reads useTenant().settings
  // directly - but confirm explicitly rather than assume.
  await expect(page.getByRole('link', { name: 'Classroom' })).toBeVisible();

  // --- Confirm real DB rows ---
  const tenantRows = queryDb('SELECT id, name, plan_tier FROM tenants WHERE name = $1', [SCHOOL_NAME]);
  expect(tenantRows.length).toBe(1);
  const tenantId = tenantRows[0].id;
  expect(tenantRows[0].plan_tier).toBe('basic');

  const settingsRows = queryDb(
    'SELECT onboarding_completed_at, enable_driver_education, support_phone FROM tenant_settings WHERE tenant_id = $1',
    [tenantId]
  );
  expect(settingsRows.length).toBe(1);
  expect(settingsRows[0].onboarding_completed_at).not.toBeNull();
  expect(settingsRows[0].enable_driver_education).toBe(true);
  expect(settingsRows[0].support_phone).toBe('555-867-5309');

  const userRows = queryDb('SELECT id, email FROM users WHERE email = $1', [OWNER_EMAIL.toLowerCase()]);
  expect(userRows.length).toBe(1);
  const userId = userRows[0].id;

  const membershipRows = queryDb(
    'SELECT role, status FROM user_tenant_memberships WHERE user_id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );
  expect(membershipRows.length).toBe(1);
  expect(membershipRows[0].role).toBe('owner');
  expect(membershipRows[0].status).toBe('active');

  const codeRows = queryDb(
    'SELECT used_at, used_by_tenant_id FROM signup_invite_codes WHERE used_by_tenant_id = $1',
    [tenantId]
  );
  expect(codeRows.length).toBe(1);
  expect(codeRows[0].used_at).not.toBeNull();

  const termsRows = queryDb(
    'SELECT version FROM terms_acceptances WHERE user_id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );
  expect(termsRows.length).toBe(1);

  // --- Confirm the code cannot be reused ---
  const reuseRes = await page.request.post('/api/v1/signup', {
    data: {
      code,
      schoolName: 'Should Never Be Created',
      ownerFullName: 'Second Attempt',
      ownerEmail: `e2e-reuse-${Date.now()}@example.com`,
      ownerPassword: OWNER_PASSWORD,
      termsAccepted: true,
      termsVersion: '2026-11-09-draft',
    },
  });
  expect(reuseRes.status()).toBe(400);
  const reuseBody = await reuseRes.json();
  expect(reuseBody.success).toBe(false);

  const neverCreatedRows = queryDb('SELECT id FROM tenants WHERE name = $1', ['Should Never Be Created']);
  expect(neverCreatedRows.length).toBe(0);
});
