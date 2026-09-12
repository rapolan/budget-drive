import { test, expect } from '@playwright/test';

/**
 * End-to-end live reproduction of the interim admin-initiated password
 * reset (TeamSettings.tsx): no email delivery, an owner/admin resets
 * another team member's password directly and shares the generated
 * temporary password with them manually.
 *
 * Requires both dev servers already running (backend :4000, frontend
 * :5173 - see docs/TESTING.md §1).
 */

const TEAMMATE_EMAIL = `reset-flow-${Date.now()}@example.com`;
const ORIGINAL_PASSWORD = 'OriginalPassword123!';

test('an admin resets a teammate password through the UI, and the teammate can log in with the new one', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // Create the teammate to reset (via the real API, same as any other
  // "add a team member" call - not a raw DB insert).
  await page.goto('/settings');
  const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));
  const createRes = await request.post('/api/v1/users', {
    data: { email: TEAMMATE_EMAIL, password: ORIGINAL_PASSWORD, fullName: 'Reset Flow Teammate', role: 'staff' },
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(createRes.ok()).toBe(true);

  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();

  const row = page.locator('tr', { hasText: TEAMMATE_EMAIL });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: /reset password/i }).click();

  await expect(page.getByText(/password reset/i)).toBeVisible();
  const passwordField = page.getByLabel(/temporary password/i);
  await expect(passwordField).toBeVisible();
  const temporaryPassword = await passwordField.inputValue();
  expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);
  expect(temporaryPassword).not.toBe(ORIGINAL_PASSWORD);

  await page.screenshot({ path: 'e2e-screenshots/__screenshots__/reset-password-shown.png' });

  await page.getByRole('button', { name: /copy/i }).click();
  await expect(page.getByText(/copied!/i)).toBeVisible();

  await page.getByRole('button', { name: /^done$/i }).click();
  await expect(page.getByText(/password reset/i)).not.toBeVisible();

  // The OLD password no longer works.
  const oldLoginRes = await request.post('/api/v1/auth/login', {
    data: { email: TEAMMATE_EMAIL, password: ORIGINAL_PASSWORD },
  });
  expect(oldLoginRes.status()).toBe(401);

  // The teammate can log in with the NEW temporary password and reaches
  // their tenant's data.
  const newLoginRes = await request.post('/api/v1/auth/login', {
    data: { email: TEAMMATE_EMAIL, password: temporaryPassword },
  });
  expect(newLoginRes.ok()).toBe(true);
  const newLoginBody = await newLoginRes.json();
  expect(newLoginBody.success).toBe(true);
  expect(newLoginBody.data.tenantId).toBeTruthy();
});

test('a staff-role user never sees the Reset Password action, and the endpoint itself rejects them', async ({ page, request }) => {
  const staffEmail = `reset-flow-staffviewer-${Date.now()}@example.com`;
  const staffPassword = 'StaffViewerPass123!';

  await page.goto('/settings');
  const authToken = await page.evaluate(() => localStorage.getItem('auth_token'));
  const createRes = await request.post('/api/v1/users', {
    data: { email: staffEmail, password: staffPassword, fullName: 'Staff Viewer', role: 'staff' },
    headers: { Authorization: `Bearer ${authToken}` },
  });
  expect(createRes.ok()).toBe(true);
  const created = await createRes.json();
  const targetUserId: string = created.data.id;

  // Log in as the new staff user via the API (independent of the UI
  // navigation below) to confirm the endpoint itself rejects them - the
  // real authorization boundary, not just a hidden button.
  const staffLoginRes = await request.post('/api/v1/auth/login', {
    data: { email: staffEmail, password: staffPassword },
  });
  expect(staffLoginRes.ok()).toBe(true);
  const staffLoginBody = await staffLoginRes.json();
  const staffToken = staffLoginBody.data.token;

  const resetAttemptRes = await request.post(`/api/v1/users/${targetUserId}/reset-password`, {
    headers: { Authorization: `Bearer ${staffToken}` },
  });
  expect(resetAttemptRes.status()).toBe(403);

  // And in the UI: swap this page's stored auth to the staff account (the
  // shared `page` already carries the admin's storageState from
  // auth.setup.ts - AuthContext.tsx resolves the logged-in user purely
  // from localStorage's auth_token on load, so writing the staff token
  // there and reloading is a real, faithful re-login as staff) and
  // confirm no Reset Password button appears anywhere on the page.
  await page.evaluate((token) => localStorage.setItem('auth_token', token), staffToken);
  await page.goto('/settings');
  await page.getByRole('button', { name: /^team$/i }).click();
  await expect(page.getByText(/team management/i)).toBeVisible();

  await expect(page.getByRole('button', { name: /reset password/i })).toHaveCount(0);

  // Restore the admin session (re-login via the API) so this test doesn't
  // leave the shared page logged in as the throwaway staff account for
  // any later test.
  const adminLoginRes = await request.post('/api/v1/auth/login', {
    data: { email: 'admin@budgetdrivingschool.com', password: 'AdminPassword123!' },
  });
  const adminLoginBody = await adminLoginRes.json();
  await page.evaluate((token) => localStorage.setItem('auth_token', token), adminLoginBody.data.token);
});
