import { test, expect } from '@playwright/test';

/**
 * End-to-end live reproduction of the invite flow fix:
 * 1. An admin sends an invite via the Team Settings UI.
 * 2. The UI now shows a real, copyable invite link (not just a silent
 *    success + closed modal - the bug this fixes).
 * 3. That link's own token is used (via the API, mirroring exactly what
 *    AcceptInvite.tsx's form submission sends) to accept the invite.
 * 4. The new teammate can log in with their own chosen password.
 *
 * Also exercises the companion backend fix: inviting a genuinely new
 * email (one with no prior users row) used to 500 on a NOT NULL
 * constraint violation - this test's email is never seeded, so a
 * regression here would fail step 1 outright.
 *
 * Requires both dev servers already running (backend :4000, frontend
 * :5173 - see docs/TESTING.md §1) and the migration adding nullable
 * full_name/password_hash (002_nullable_invite_user_fields.sql) applied.
 */

const INVITEE_EMAIL = `playwright-invite-${Date.now()}@example.com`;
const INVITEE_PASSWORD = 'BrandNewTeammate123!';

test('admin sends an invite, sees a real copyable link, and the teammate can accept it and log in', async ({ page, context, request, baseURL }) => {
  // Headless Chromium blocks navigator.clipboard access without explicit
  // permission grants - needed for the real Copy button click below.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // The chromium project (playwright.config.ts) already carries an
  // authenticated admin session via auth.setup.ts's storageState - no
  // manual login needed here.
  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();
  await page.getByRole('button', { name: /invite user/i }).click();

  await page.getByLabel(/email address/i).fill(INVITEE_EMAIL);
  await page.getByRole('button', { name: /send invite/i }).click();

  // The fix: the modal stays open and shows a real link, instead of
  // silently closing with no way to get the link to the invitee.
  await expect(page.getByText(/invite created/i)).toBeVisible();
  const linkField = page.getByLabel(/invite link/i);
  await expect(linkField).toBeVisible();
  const inviteLink = await linkField.inputValue();

  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/invite-link-shown.png' });

  expect(inviteLink).toContain('/accept-invite?token=');
  // Confirms the link is genuinely usable, not a placeholder/localhost-
  // typo - it must point at whatever origin this test's own frontend is
  // actually running on (FRONTEND_URL, defaulting to localhost:5173 in
  // dev - see userController.ts).
  if (baseURL) {
    expect(inviteLink.startsWith(new URL(baseURL).origin)).toBe(true);
  }

  const token = new URL(inviteLink).searchParams.get('token');
  expect(token).toBeTruthy();

  await page.getByRole('button', { name: /copy/i }).click();
  await expect(page.getByText(/copied!/i)).toBeVisible();
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/invite-link-copied.png' });

  await page.getByRole('button', { name: /^done$/i }).click();
  await expect(page.getByText(/invite created/i)).not.toBeVisible();

  // Accept the invite - the exact request AcceptInvite.tsx's form submits.
  const acceptRes = await request.post('/api/v1/auth/accept-invite', {
    data: { token, password: INVITEE_PASSWORD },
  });
  expect(acceptRes.ok()).toBe(true);
  const acceptBody = await acceptRes.json();
  expect(acceptBody.success).toBe(true);
  expect(acceptBody.data.membershipStatus).toBe('active');

  // The new teammate can now log in with the password they chose.
  const loginRes = await request.post('/api/v1/auth/login', {
    data: { email: INVITEE_EMAIL, password: INVITEE_PASSWORD },
  });
  expect(loginRes.ok()).toBe(true);
  const loginBody = await loginRes.json();
  expect(loginBody.success).toBe(true);
  expect(loginBody.data.tenantId).toBeTruthy();

  // Before accepting, the same account must NOT be able to log in with
  // ANY password (the security fix - a null password_hash must never be
  // treated as "no password required"). Verified against a SEPARATE,
  // never-invited email so this doesn't depend on the accepted account
  // above having already changed state.
  const neverAcceptedEmail = `playwright-neveraccepted-${Date.now()}@example.com`;
  const loginToken = await page.evaluate(() => localStorage.getItem('auth_token'));
  await request.post('/api/v1/users/invite', {
    data: { email: neverAcceptedEmail, role: 'staff' },
    headers: { Authorization: `Bearer ${loginToken}` },
  });
  const rejectedLoginRes = await request.post('/api/v1/auth/login', {
    data: { email: neverAcceptedEmail, password: 'any-password-at-all' },
  });
  expect(rejectedLoginRes.status()).toBe(401);
});
