/**
 * ============================================================================
 * ONE-TIME PRODUCTION BOOTSTRAP - NOT A SEED FILE
 * ============================================================================
 *
 * Creates the very first tenant, its tenant_settings row, and its owner
 * user + membership - the one thing nothing else in this app can do. The
 * public POST /register endpoint can only link a new user to an EXISTING
 * tenant (or leave them ownerless if none is given - see authService.ts);
 * nothing else ever creates a tenant row for a real customer. This script
 * exists to create the FIRST one, once, by hand, against production.
 *
 * This is explicitly NOT part of `npm run seed` (backend/database/run-seed.js
 * only ever globs backend/database/seeds/*.sql - this file lives outside
 * that directory and is never picked up by it), is NEVER referenced by
 * .github/workflows/ci.yml, and must never be run against a dev/test
 * database that already has seed data in it (it's harmless in the sense
 * that it doesn't touch students/lessons/anything else, but it has no
 * reason to run anywhere except once, against a fresh production database,
 * before the first real school signs up).
 *
 * Run with: npm run bootstrap:tenant   (from backend/)
 *
 * Inputs:
 *   - School identity (name/address/phone/license number) and the owner's
 *     email/full name come from environment variables (see the REQUIRED_ENV
 *     list below) - not secrets, fine as plain env vars.
 *   - The owner's PASSWORD is NEVER accepted as an env var (shell history,
 *     process listing, and deploy-log exposure) - it is always collected
 *     via a real interactive masked prompt (the `prompts` package, a
 *     devDependency added specifically for this script - never shipped in
 *     the running app, never a runtime dependency).
 *
 * Idempotent: refuses to run if a tenant with the same slug, or a user
 * with the same email, already exists - safe to re-run by accident.
 *
 * Touches exactly four tables, all in one transaction: tenants,
 * tenant_settings, users, user_tenant_memberships. Never students,
 * lessons, or anything operational.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const prompts = require('prompts');

const SALT_ROUNDS = 10; // matches backend/src/services/authService.ts's hashPassword exactly

// This script requires the COMPILED tenantSignupService (dist/, built via
// `npm run build`) rather than hand-maintaining a second copy of the
// tenant-creation transaction - two copies of the same transactional SQL
// is exactly the drift risk the shared-logic requirement exists to
// prevent. Neither this script nor `npm run signup:invite` runs the
// build itself (a silent build-on-run could mask a stale build or hide a
// compile error behind an unrelated script's output) - instead, check
// for the compiled file up front and fail with an actionable message if
// it's missing. In a deployed environment `npm run build` already runs
// as part of the normal deploy, so this check never fires there; it only
// ever fires for a local developer who hasn't built yet.
const COMPILED_TENANT_SIGNUP_SERVICE = path.join(__dirname, '..', 'dist', 'services', 'tenantSignupService.js');
if (!fs.existsSync(COMPILED_TENANT_SIGNUP_SERVICE)) {
  console.error('❌ dist/services/tenantSignupService.js not found. Run `npm run build` first, then re-run this script.');
  process.exit(1);
}
const { createTenantWithOwner } = require(COMPILED_TENANT_SIGNUP_SERVICE);

const REQUIRED_ENV = [
  'TENANT_NAME',
  'TENANT_SLUG',
  'TENANT_EMAIL',
  'OWNER_EMAIL',
  'OWNER_FULL_NAME',
];

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  console.log('============================================================');
  console.log('  ONE-TIME PRODUCTION BOOTSTRAP - first tenant + owner user');
  console.log('============================================================\n');

  const missing = REQUIRED_ENV.filter((key) => !process.env[key] || !process.env[key].trim());
  if (missing.length > 0) {
    console.error('❌ Missing required environment variable(s):');
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error('\nRequired: ' + REQUIRED_ENV.join(', '));
    console.error('Optional: TENANT_ADDRESS_LINE1, TENANT_ADDRESS_LINE2, TENANT_CITY, TENANT_STATE, TENANT_ZIP_CODE, TENANT_PHONE, TENANT_LICENSE_NUMBER');
    process.exit(1);
  }

  const tenantName = process.env.TENANT_NAME.trim();
  const tenantSlug = slugify(process.env.TENANT_SLUG);
  const tenantEmail = process.env.TENANT_EMAIL.trim().toLowerCase();
  const tenantPhone = process.env.TENANT_PHONE ? process.env.TENANT_PHONE.trim() : null;
  const addressLine1 = process.env.TENANT_ADDRESS_LINE1 ? process.env.TENANT_ADDRESS_LINE1.trim() : null;
  const addressLine2 = process.env.TENANT_ADDRESS_LINE2 ? process.env.TENANT_ADDRESS_LINE2.trim() : null;
  const city = process.env.TENANT_CITY ? process.env.TENANT_CITY.trim() : null;
  const state = process.env.TENANT_STATE ? process.env.TENANT_STATE.trim() : null;
  const zipCode = process.env.TENANT_ZIP_CODE ? process.env.TENANT_ZIP_CODE.trim() : null;
  const licenseNumber = process.env.TENANT_LICENSE_NUMBER ? process.env.TENANT_LICENSE_NUMBER.trim() : null;

  const ownerEmail = process.env.OWNER_EMAIL.trim().toLowerCase();
  const ownerFullName = process.env.OWNER_FULL_NAME.trim();

  if (!tenantSlug) {
    console.error('❌ TENANT_SLUG resolved to an empty slug after normalization - provide a slug with at least one letter/number.');
    process.exit(1);
  }

  console.log('School:', tenantName, `(slug: ${tenantSlug})`);
  console.log('Owner: ', ownerFullName, `<${ownerEmail}>`);
  console.log('');

  // Password is NEVER an env var - collected interactively, masked, never
  // echoed, never logged. Ctrl+C at this prompt aborts before any DB write.
  const { ownerPassword } = await prompts({
    type: 'password',
    name: 'ownerPassword',
    message: `Enter a password for the new owner account (${ownerEmail}):`,
    validate: (value) => (value && value.length >= 8 ? true : 'Password must be at least 8 characters'),
  });

  if (!ownerPassword) {
    console.error('\n❌ No password entered - aborting. Nothing was written.');
    process.exit(1);
  }

  const { confirmPassword } = await prompts({
    type: 'password',
    name: 'confirmPassword',
    message: 'Confirm the password:',
  });

  if (ownerPassword !== confirmPassword) {
    console.error('\n❌ Passwords did not match - aborting. Nothing was written.');
    process.exit(1);
  }

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school',
  });

  try {
    await client.connect();
    console.log('\n✅ Connected to database\n');

    // --- Idempotency guard (item 4): refuse if either already exists ---
    const existingTenant = await client.query(
      'SELECT id FROM tenants WHERE slug = $1',
      [tenantSlug]
    );
    if (existingTenant.rows.length > 0) {
      console.error(`❌ A tenant with slug "${tenantSlug}" already exists (id: ${existingTenant.rows[0].id}). Refusing to run - nothing was written.`);
      console.error('   If this is a genuine re-run after a partial failure, investigate the existing row by hand rather than re-running blindly.');
      process.exit(1);
    }

    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [ownerEmail]
    );
    if (existingUser.rows.length > 0) {
      console.error(`❌ A user with email "${ownerEmail}" already exists (id: ${existingUser.rows[0].id}). Refusing to run - nothing was written.`);
      process.exit(1);
    }

    // --- Hash the password using the SAME utility/parameters as the real
    // app (backend/src/services/authService.ts's hashPassword) - not
    // reimplemented, just the identical bcrypt call so the resulting hash
    // is indistinguishable from one the app itself would have produced. ---
    const passwordHash = await bcrypt.hash(ownerPassword, SALT_ROUNDS);

    await client.query('BEGIN');

    // Delegates to the SAME function the new self-service signup
    // endpoint calls (backend/src/services/tenantSignupService.ts), so
    // this script and that endpoint can never drift apart - there is
    // only one implementation of "create a tenant + settings + owner
    // user + owner membership."
    const result = await createTenantWithOwner(
      {
        tenantName,
        tenantSlugBase: tenantSlug, // already slugified above; createTenantWithOwner re-slugifies harmlessly (idempotent on an already-valid slug)
        tenantEmail,
        tenantPhone,
        addressLine1,
        addressLine2,
        city,
        state,
        zipCode,
        licenseNumber,
        ownerEmail,
        ownerFullName,
        ownerPasswordHash: passwordHash,
        planTier: 'enterprise', // bootstrap's existing, unchanged behavior
        // This is the operator-run first-tenant/rebuild tool, not the
        // self-service signup path the first-login wizard exists for -
        // the operator has already configured this tenant by hand, so
        // it's marked already-onboarded at creation and the new owner
        // is never redirected into the wizard.
        onboardingCompleted: true,
      },
      client
    );
    console.log(`📦 Created tenant "${tenantName}" (${result.tenantId})`);
    console.log('📦 Created tenant_settings row');
    console.log(`📦 Created user "${ownerFullName}" (${result.userId})`);
    console.log('📦 Created owner membership\n');

    await client.query('COMMIT');

    console.log('✅ Bootstrap complete!');
    console.log(`   Tenant:  ${tenantName} (${result.tenantId})`);
    console.log(`   Owner:   ${ownerFullName} <${ownerEmail}> (${result.userId})`);
    console.log('   The owner can now log in at POST /api/v1/auth/login with the password just entered.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Bootstrap failed, rolled back - nothing was written:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
