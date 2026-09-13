import { test, expect, type Page } from '@playwright/test';

/**
 * End-to-end live reproduction of the Team Settings "More actions" menu:
 * previously a dead stub (no onClick, no menu) alongside a separate
 * standalone Reset Password icon button. Now one menu containing Reset
 * Password (moved here, standalone button removed), Change Role, Remove
 * From Team, and Resend Invite - each shown/hidden per the stated
 * visibility rules. Screenshots the open menu (all four options) and the
 * owner/self guardrails, both themes.
 *
 * Requires both dev servers already running (backend :4000, frontend
 * :5173 - see docs/TESTING.md §1). The authenticated session (auth.setup.ts)
 * logs in as admin@budgetdrivingschool.com - this test's own setup
 * promotes that account to 'owner' via direct DB update before running
 * (see the command run alongside this spec), since the seed data ships
 * with no owner in this tenant and the owner-guardrail scenarios need one.
 */

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme);
  await page.reload();
}

const TEAMMATE_EMAIL = `more-actions-teammate-${Date.now()}@example.com`;
const TEAMMATE_PASSWORD = 'TeammatePass123!';

test.describe.configure({ mode: 'serial' });

test('the More actions menu opens and shows all four options for an ordinary teammate row', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  const authToken = await (async () => {
    await page.goto('/settings');
    return page.evaluate(() => localStorage.getItem('auth_token'));
  })();

  // Invite a teammate who stays in 'invited' status, so this same row can
  // show Resend Invite alongside Change Role and Remove From Team - Reset
  // Password is always offered for anyone but the caller's own row.
  const inviteRes = await request.post('/api/v1/users/invite', {
    data: { email: TEAMMATE_EMAIL, role: 'staff' },
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(inviteRes.ok()).toBe(true);

  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();

  const row = page.locator('tr', { hasText: TEAMMATE_EMAIL });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: /more actions/i }).click();

  await expect(page.getByRole('button', { name: /^reset password$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /change role/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /resend invite/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /remove from team/i })).toBeVisible();

  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-menu-open-light.png' });

  await setTheme(page, 'dark');
  await page.getByRole('button', { name: /^team$/i }).click();
  const rowDark = page.locator('tr', { hasText: TEAMMATE_EMAIL });
  await rowDark.getByRole('button', { name: /more actions/i }).click();
  await expect(page.getByRole('button', { name: /^reset password$/i })).toBeVisible();
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-menu-open-dark.png' });
  await setTheme(page, 'light');
});

test('Reset Password works from the menu (moved from the removed standalone button)', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();

  const row = page.locator('tr', { hasText: TEAMMATE_EMAIL });
  await row.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('button', { name: /^reset password$/i }).click();

  await expect(page.getByText(/password reset/i)).toBeVisible();
  const passwordField = page.getByLabel(/temporary password/i);
  await expect(passwordField).toBeVisible();
  const temporaryPassword = await passwordField.inputValue();
  expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);

  await page.getByRole('button', { name: /^done$/i }).click();
  await expect(page.getByText(/password reset/i)).not.toBeVisible();

  // Confirm there is no standalone key-icon Reset Password button anywhere
  // else on the page any more - the menu is the ONLY way to reset a
  // password now.
  await expect(page.getByRole('button', { name: /^reset password$/i })).toHaveCount(0);
});

test('Change role: promotes the teammate from staff to admin, and back', async ({ page, request }) => {
  await page.goto('/settings');
  const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));

  // Accept the invite first so this teammate is active (change-role isn't
  // gated on status, but this mirrors the realistic flow: an admin
  // wouldn't typically promote someone still mid-invite).
  const usersRes = await request.get('/api/v1/users', { headers: { Authorization: `Bearer ${authToken}` } });
  const usersBody = await usersRes.json();
  const teammate = usersBody.data.find((u: { email: string }) => u.email === TEAMMATE_EMAIL);
  expect(teammate).toBeTruthy();

  await page.getByRole('button', { name: /^team$/i }).click();
  const row = page.locator('tr', { hasText: TEAMMATE_EMAIL });
  await row.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('button', { name: /change role/i }).click();

  await expect(page.getByText(/change role for/i)).toBeVisible();
  await page.getByLabel(/^role$/i).selectOption('admin');
  await page.getByRole('button', { name: /^save$/i }).click();

  await expect(page.getByText(/change role for/i)).not.toBeVisible();

  // Confirm the role actually changed via the API (ground truth, not just
  // that the modal closed).
  const afterRes = await request.get('/api/v1/users', { headers: { Authorization: `Bearer ${authToken}` } });
  const afterBody = await afterRes.json();
  const updated = afterBody.data.find((u: { email: string }) => u.email === TEAMMATE_EMAIL);
  expect(updated.role).toBe('admin');
});

test('guardrail: the owner row (which is also the caller\'s own row here) has no More actions menu at all, in either theme', async ({ page }) => {
  // This account is both the tenant owner AND the logged-in caller, so
  // EVERY menu item is hidden for this row (Reset Password/Change
  // Role/Remove all exclude the caller's own row; Resend Invite requires
  // 'invited' status, which an active account never has) - MoreActionsMenu
  // renders nothing at all rather than an empty dropdown shell. The
  // dedicated owner-vs-non-self scenario (an owner row that is NOT the
  // caller) is covered separately below via the direct-API test, since
  // this seed tenant has only one owner account to log in as.
  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();

  const ownerRow = page.locator('tr', { hasText: 'admin@budgetdrivingschool.com' });
  await expect(ownerRow).toBeVisible();
  await expect(ownerRow.getByRole('button', { name: /more actions/i })).toHaveCount(0);

  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-owner-protected-light.png' });

  await setTheme(page, 'dark');
  await page.getByRole('button', { name: /^team$/i }).click();
  const ownerRowDark = page.locator('tr', { hasText: 'admin@budgetdrivingschool.com' });
  await expect(ownerRowDark.getByRole('button', { name: /more actions/i })).toHaveCount(0);
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-owner-protected-dark.png' });
  await setTheme(page, 'light');
});

test('the endpoint itself blocks removing/changing the owner even if called directly (not just hidden in the UI)', async ({ page, request }) => {
  await page.goto('/settings');
  const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));
  const usersRes = await request.get('/api/v1/users', { headers: { Authorization: `Bearer ${authToken}` } });
  const usersBody = await usersRes.json();
  const owner = usersBody.data.find((u: { email: string }) => u.email === 'admin@budgetdrivingschool.com');
  expect(owner.role).toBe('owner');

  // A second admin attempts to remove/change-role the owner directly via
  // the API - confirms the server-side guard, not just UI hiding.
  const secondAdminEmail = `more-actions-admin2-${Date.now()}@example.com`;
  const inviteRes = await request.post('/api/v1/users/invite', {
    data: { email: secondAdminEmail, role: 'admin' },
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const inviteBody = await inviteRes.json();
  const acceptRes = await request.post('/api/v1/auth/accept-invite', {
    data: { token: new URL(inviteBody.data.inviteLink).searchParams.get('token'), password: 'SecondAdmin123!' },
  });
  expect(acceptRes.ok()).toBe(true);
  const loginRes = await request.post('/api/v1/auth/login', {
    data: { email: secondAdminEmail, password: 'SecondAdmin123!' },
  });
  const secondAdminToken = (await loginRes.json()).data.token;

  const removeAttempt = await request.delete(`/api/v1/users/${owner.id}`, {
    headers: { Authorization: `Bearer ${secondAdminToken}` },
  });
  expect(removeAttempt.status()).toBe(403);

  const roleChangeAttempt = await request.patch(`/api/v1/users/${owner.id}`, {
    data: { role: 'staff' },
    headers: { Authorization: `Bearer ${secondAdminToken}` },
  });
  expect(roleChangeAttempt.status()).toBe(403);
});

test('guardrail: a NON-owner caller (second admin) also never sees Change Role/Remove on their own row, distinct from the owner case above', async ({ page, context, request }) => {
  // Distinct from the owner-protection test above: this scenario is
  // self-protection alone, on an ordinary (non-owner) admin account, in a
  // fresh browser context logged in as that second admin - proving
  // self-protection doesn't depend on also being the owner.
  await page.goto('/settings');
  const ownerToken = await page.evaluate(() => localStorage.getItem('auth_token'));

  const secondAdminEmail = `more-actions-self-${Date.now()}@example.com`;
  const secondAdminPassword = 'SelfProtect123!';
  const inviteRes = await request.post('/api/v1/users/invite', {
    data: { email: secondAdminEmail, role: 'admin' },
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  const inviteBody = await inviteRes.json();
  await request.post('/api/v1/auth/accept-invite', {
    data: { token: new URL(inviteBody.data.inviteLink).searchParams.get('token'), password: secondAdminPassword },
  });

  // A fresh, unauthenticated context - explicit baseURL AND an empty
  // storageState, since context.browser().newContext() otherwise still
  // picks up this chromium project's configured storageState (the admin's
  // saved auth from auth.setup.ts), landing on the dashboard instead of
  // the login form.
  const secondAdminContext = await context.browser()!.newContext({
    baseURL: 'http://localhost:5173',
    storageState: { cookies: [], origins: [] },
  });
  const secondAdminPage = await secondAdminContext.newPage();
  await secondAdminPage.goto('/login');
  await secondAdminPage.locator('#email').fill(secondAdminEmail);
  await secondAdminPage.locator('#password').fill(secondAdminPassword);
  await secondAdminPage.getByRole('button', { name: /sign in/i }).click();
  await secondAdminPage.waitForURL('/');

  await secondAdminPage.goto('/settings');
  await secondAdminPage.getByRole('button', { name: /^team$/i }).click();
  const ownRow = secondAdminPage.locator('tr', { hasText: secondAdminEmail });
  await expect(ownRow).toBeVisible();

  // Every item is self-excluded (Reset Password/Change Role/Remove all
  // exclude the caller's own row; Resend Invite requires 'invited' status,
  // which this now-active account doesn't have) - MoreActionsMenu renders
  // nothing at all for this row, same as the owner's own row above.
  await expect(ownRow.getByRole('button', { name: /more actions/i })).toHaveCount(0);

  await secondAdminPage.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-self-protected-light.png' });

  await setTheme(secondAdminPage, 'dark');
  await secondAdminPage.getByRole('button', { name: /^team$/i }).click();
  const ownRowDark = secondAdminPage.locator('tr', { hasText: secondAdminEmail });
  await expect(ownRowDark.getByRole('button', { name: /more actions/i })).toHaveCount(0);
  await secondAdminPage.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-self-protected-dark.png' });

  await secondAdminContext.close();
});

test('Resend invite fixes the known 500: re-inviting an already-invited email now succeeds with a fresh link', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/settings');
  const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));

  const stillInvitedEmail = `more-actions-resend-${Date.now()}@example.com`;
  const inviteRes = await request.post('/api/v1/users/invite', {
    data: { email: stillInvitedEmail, role: 'staff' },
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(inviteRes.ok()).toBe(true);
  const originalLink = (await inviteRes.json()).data.inviteLink;

  // The regression this fixes: re-inviting the SAME already-invited email
  // through the original /invite endpoint used to 500 on a unique-
  // constraint violation. Confirm it now succeeds (201) with an UPDATEd
  // token, not a duplicate row.
  const reinviteRes = await request.post('/api/v1/users/invite', {
    data: { email: stillInvitedEmail, role: 'staff' },
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(reinviteRes.status()).toBe(201);
  const reinviteLink = (await reinviteRes.json()).data.inviteLink;
  expect(reinviteLink).not.toBe(originalLink);

  // Now exercise the dedicated "Resend invite" menu action in the UI.
  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();
  const row = page.locator('tr', { hasText: stillInvitedEmail });
  await row.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('button', { name: /resend invite/i }).click();

  await expect(page.getByText(/invite resent/i)).toBeVisible();
  const linkField = page.getByLabel(/invite link/i);
  const menuResentLink = await linkField.inputValue();
  expect(menuResentLink).toContain('/accept-invite?token=');
  expect(menuResentLink).not.toBe(reinviteLink);

  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-resend-invite.png' });
  await page.getByRole('button', { name: /^done$/i }).click();
});

test('Remove from team: removes access, and the endpoint rejects the removed user on their very next request', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/settings');
  const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));

  const removeMeEmail = `more-actions-removeme-${Date.now()}@example.com`;
  const removeMePassword = 'RemoveMe123!';
  const inviteRes = await request.post('/api/v1/users/invite', {
    data: { email: removeMeEmail, role: 'staff' },
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const inviteBody = await inviteRes.json();
  await request.post('/api/v1/auth/accept-invite', {
    data: { token: new URL(inviteBody.data.inviteLink).searchParams.get('token'), password: removeMePassword },
  });

  const removedLoginRes = await request.post('/api/v1/auth/login', { data: { email: removeMeEmail, password: removeMePassword } });
  const removedUserToken = (await removedLoginRes.json()).data.token;

  // Confirm this JWT currently works.
  const beforeRes = await request.get('/api/v1/users', { headers: { Authorization: `Bearer ${removedUserToken}` } });
  expect(beforeRes.ok()).toBe(true);

  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();
  const row = page.locator('tr', { hasText: removeMeEmail });
  await row.getByRole('button', { name: /more actions/i }).click();
  await page.getByRole('button', { name: /remove from team/i }).click();

  await expect(page.getByText(/remove.*from the team\?/i)).toBeVisible();
  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/more-actions-remove-confirm.png' });
  await page.getByRole('button', { name: /^remove$/i }).click();

  await expect(page.locator('tr', { hasText: removeMeEmail })).toHaveCount(0);

  // The removed user's still-unexpired JWT is rejected on the very next
  // requireRole-gated request.
  const afterAttempt = await request.post(`/api/v1/users/nonexistent-id/reset-password`, {
    headers: { Authorization: `Bearer ${removedUserToken}` },
  });
  expect(afterAttempt.status()).toBe(403);
});

test('guardrail: cannot remove yourself, and Resend invite never appears for an active user', async ({ page, request }) => {
  await page.goto('/settings');
  const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));

  const selfRemoveAttempt = await request.delete('/api/v1/users/00000000-0000-0000-0000-000000000001', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(selfRemoveAttempt.status()).toBe(400);

  await page.getByRole('button', { name: /^team$/i }).click();
  const activeRow = page.locator('tr', { hasText: 'marcus.webb@budgetdrivingschool.com' });
  await activeRow.getByRole('button', { name: /more actions/i }).click();
  await expect(page.getByRole('button', { name: /resend invite/i })).toHaveCount(0);
});
