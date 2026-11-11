/**
 * Shared tenant-creation-with-owner logic, used by BOTH
 * backend/database/bootstrap-first-tenant.js (the one-time operator CLI
 * that creates the very first tenant) and the new self-service
 * invite-code signup endpoint (POST /signup). Having one implementation
 * is the whole point - the two paths cannot drift apart if there is only
 * ever one path.
 *
 * createTenantWithOwner deliberately takes a caller-supplied client,
 * already inside a BEGIN, and never opens or commits its own
 * transaction - both callers need this logic as one participant inside
 * a transaction THEY control (the bootstrap script already runs its own
 * BEGIN/COMMIT; the signup endpoint must also atomically claim an invite
 * code and insert a terms_acceptances row in the SAME transaction as the
 * tenant creation, so a failure anywhere rolls everything back together,
 * including un-claiming the code).
 */

import crypto from 'crypto';
import { AppError } from '../middleware/errorHandler';
import { query, getClient } from '../config/database';
import { hashPassword } from './authService';
import { generateToken } from '../utils/jwt';
import { createLogger } from '../utils/logger';

const logger = createLogger('TenantSignupService');

export interface SqlClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

/** Same fast-deterministic-hash reasoning as userService.ts's hashInviteToken and the signup:invite CLI's own hashSignupCode - a high-entropy random value, not a user-chosen secret. */
export const hashSignupCode = (code: string): string =>
  crypto.createHash('sha256').update(code).digest('hex');

export interface CreateTenantWithOwnerInput {
  tenantName: string;
  tenantSlugBase: string; // raw, pre-slugify input
  tenantEmail: string;
  tenantPhone?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  licenseNumber?: string | null;
  ownerEmail: string;
  ownerFullName: string;
  ownerPasswordHash: string; // caller hashes BEFORE calling (bcrypt, SALT_ROUNDS=10)
  planTier?: 'basic' | 'professional' | 'enterprise'; // self-signup passes 'basic'; bootstrap keeps passing 'enterprise'
}

export interface CreateTenantWithOwnerResult {
  tenantId: string;
  tenantSlug: string; // final slug actually used, after collision suffixing
  userId: string;
}

const MAX_SLUG_ATTEMPTS = 50;

/**
 * Identical normalization to bootstrap-first-tenant.js's existing
 * slugify (kept byte-for-byte the same so a slug generated today looks
 * the same whether it came from the CLI or the new signup endpoint).
 */
export const slugify = (input: string): string => {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Tries baseSlug, then `${baseSlug}-2`, `${baseSlug}-3`, ... on the SAME
 * client/transaction, until an unused slug is found. Capped at
 * MAX_SLUG_ATTEMPTS - astronomically unlikely to ever hit, but no
 * while(true).
 */
export const resolveUniqueSlug = async (client: SqlClient, baseSlug: string): Promise<string> => {
  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
    const existing = await client.query('SELECT id FROM tenants WHERE slug = $1', [candidate]);
    if (existing.rows.length === 0) {
      return candidate;
    }
  }
  throw new AppError('Could not generate a unique slug', 500);
};

/**
 * Creates a tenant, its tenant_settings row, the owner user, and the
 * owner membership - all via the passed-in client, in this exact order.
 * Mirrors bootstrap-first-tenant.js's existing transaction body
 * (lines 164-200 as of this writing) with the new slug-collision
 * handling added on top (neither existing path - the bootstrap script
 * nor the now-removed tenantService.createTenant - handled a slug
 * collision; both just checked-and-threw).
 *
 * Does NOT check for an existing user by email, and does nothing beyond
 * the collision-suffix loop for slugs - both are each caller's own
 * responsibility, before BEGIN, since each produces different
 * user-facing behavior per caller.
 */
export const createTenantWithOwner = async (
  input: CreateTenantWithOwnerInput,
  client: SqlClient
): Promise<CreateTenantWithOwnerResult> => {
  const baseSlug = slugify(input.tenantSlugBase);
  if (!baseSlug) {
    throw new AppError('Could not derive a valid slug from the provided name', 400);
  }
  const tenantSlug = await resolveUniqueSlug(client, baseSlug);

  const tenantResult = await client.query(
    `INSERT INTO tenants (name, slug, email, phone, status, plan_tier)
     VALUES ($1, $2, $3, $4, 'active', $5)
     RETURNING id`,
    [input.tenantName, tenantSlug, input.tenantEmail, input.tenantPhone || null, input.planTier || 'enterprise']
  );
  const tenantId = tenantResult.rows[0].id;

  await client.query(
    `INSERT INTO tenant_settings (
       tenant_id, business_name, address_line1, address_line2, city, state, zip_code,
       support_phone, license_number
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tenantId,
      input.tenantName,
      input.addressLine1 || null,
      input.addressLine2 || null,
      input.city || null,
      input.state || null,
      input.zipCode || null,
      input.tenantPhone || null,
      input.licenseNumber || null,
    ]
  );

  const userResult = await client.query(
    `INSERT INTO users (email, password_hash, full_name)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [input.ownerEmail, input.ownerPasswordHash, input.ownerFullName]
  );
  const userId = userResult.rows[0].id;

  await client.query(
    `INSERT INTO user_tenant_memberships (user_id, tenant_id, role, status, accepted_at)
     VALUES ($1, $2, 'owner', 'active', NOW())`,
    [userId, tenantId]
  );

  return { tenantId, tenantSlug, userId };
};

/**
 * Read-only, NON-CLAIMING check - exists purely so the signup page can
 * show "this looks valid" before the user fills out the whole form.
 * Must never mark a code used itself (only the atomic claim inside
 * signupNewTenant does that), or a user who checks then abandons the
 * page would burn it for nothing.
 */
export const validateInviteCode = async (rawCode: string): Promise<boolean> => {
  if (!rawCode || typeof rawCode !== 'string') return false;
  const hash = hashSignupCode(rawCode);
  const result = await query(
    `SELECT 1 FROM signup_invite_codes
     WHERE code_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()`,
    [hash]
  );
  return result.rows.length > 0;
};

export interface SignupNewTenantInput {
  code: string;
  schoolName: string;
  ownerFullName: string;
  ownerEmail: string;
  ownerPassword: string;
  termsVersion: string;
}

export interface SignupNewTenantResult {
  user: { id: string; email: string; fullName: string; role: 'owner' };
  token: string;
  tenantId: string;
}

/**
 * The full atomic signup flow: claim the invite code, create the tenant
 * (via createTenantWithOwner, on the SAME client/transaction), record
 * terms acceptance, and issue a login token - all inside one
 * transaction, so a failure anywhere rolls everything back together,
 * including un-claiming the code.
 *
 * Ordering is deliberate: the atomic claim runs FIRST (before any other
 * check), so a request with no valid code is rejected before touching
 * the users table at all. The email-exists check runs AFTER the claim
 * but BEFORE password hashing - hashing is deliberately expensive
 * (that's the point of bcrypt), so an attempt that never held a valid
 * code, or that collides on email, never pays that cost. See
 * docs/ARCHITECTURE.md's new section for the full concurrency/threat
 * argument, including the corrected reasoning on what the claim-before-
 * email-check ordering actually bounds (a rolled-back claim un-burns the
 * code - this is NOT a one-probe-per-code limit, it's bounded only by
 * the rate limiter).
 */
export const signupNewTenant = async (input: SignupNewTenantInput): Promise<SignupNewTenantResult> => {
  const normalizedEmail = input.ownerEmail.toLowerCase().trim();
  const codeHash = hashSignupCode(input.code);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const claim = await client.query(
      `UPDATE signup_invite_codes
       SET used_at = NOW()
       WHERE code_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()
       RETURNING id`,
      [codeHash]
    );
    if (claim.rowCount === 0) {
      await client.query('ROLLBACK');
      throw new AppError('This invite code is invalid or has expired.', 400);
    }
    const inviteCodeId = claim.rows[0].id;

    const existing = await client.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK'); // un-claims the code too - a mistyped-email retry isn't penalized
      throw new AppError('An account with this email already exists. Try logging in instead.', 409);
    }

    // Hashed only now - after the code is confirmed valid/unclaimed and
    // the email is confirmed free - so neither a garbage code nor an
    // email collision ever pays bcrypt's deliberate cost.
    const passwordHash = await hashPassword(input.ownerPassword);

    const { tenantId, userId } = await createTenantWithOwner(
      {
        tenantName: input.schoolName,
        tenantSlugBase: input.schoolName,
        tenantEmail: normalizedEmail,
        ownerEmail: normalizedEmail,
        ownerFullName: input.ownerFullName,
        ownerPasswordHash: passwordHash,
        planTier: 'basic',
      },
      client
    );

    await client.query(
      `UPDATE signup_invite_codes SET used_by_tenant_id = $1 WHERE id = $2`,
      [tenantId, inviteCodeId]
    );
    await client.query(
      `INSERT INTO terms_acceptances (user_id, tenant_id, version, accepted_at) VALUES ($1, $2, $3, NOW())`,
      [userId, tenantId, input.termsVersion]
    );

    await client.query('COMMIT');

    logger.info('New tenant created via self-service signup', { tenantId, userId });

    const token = generateToken({ userId, tenantId, email: normalizedEmail, role: 'owner' });

    return {
      user: { id: userId, email: normalizedEmail, fullName: input.ownerFullName, role: 'owner' },
      token,
      tenantId,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

export default { slugify, resolveUniqueSlug, createTenantWithOwner, hashSignupCode, validateInviteCode, signupNewTenant };
