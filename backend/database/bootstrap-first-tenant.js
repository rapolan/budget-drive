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
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const prompts = require('prompts');

const SALT_ROUNDS = 10; // matches backend/src/services/authService.ts's hashPassword exactly

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

    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, email, phone, status, plan_tier)
       VALUES ($1, $2, $3, $4, 'active', 'enterprise')
       RETURNING id`,
      [tenantName, tenantSlug, tenantEmail, tenantPhone]
    );
    const tenantId = tenantResult.rows[0].id;
    console.log(`📦 Created tenant "${tenantName}" (${tenantId})`);

    await client.query(
      `INSERT INTO tenant_settings (
         tenant_id, business_name, address_line1, address_line2, city, state, zip_code,
         support_phone, license_number
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [tenantId, tenantName, addressLine1, addressLine2, city, state, zipCode, tenantPhone, licenseNumber]
    );
    console.log('📦 Created tenant_settings row');

    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [ownerEmail, passwordHash, ownerFullName]
    );
    const userId = userResult.rows[0].id;
    console.log(`📦 Created user "${ownerFullName}" (${userId})`);

    await client.query(
      `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status, accepted_at)
       VALUES ($1, $2, 'owner', 'active', NOW())`,
      [userId, tenantId]
    );
    console.log('📦 Created owner membership\n');

    await client.query('COMMIT');

    console.log('✅ Bootstrap complete!');
    console.log(`   Tenant:  ${tenantName} (${tenantId})`);
    console.log(`   Owner:   ${ownerFullName} <${ownerEmail}> (${userId})`);
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
