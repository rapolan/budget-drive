import { test as setup } from '@playwright/test';

const ADMIN_EMAIL = 'admin@budgetdrivingschool.com';
const ADMIN_PASSWORD = 'AdminPassword123!';
export const AUTH_FILE = 'e2e-screenshots/.auth/admin.json';

// Logs in ONCE and saves the resulting localStorage (auth_token/tenant_id)
// so the 4 screenshot tests reuse the same session instead of each hitting
// the login endpoint fresh - keeps the script well under the backend's
// authLimiter (10 attempts / 15 min) on repeat runs.
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#email').fill(ADMIN_EMAIL);
  await page.locator('#password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
  await page.context().storageState({ path: AUTH_FILE });
});
