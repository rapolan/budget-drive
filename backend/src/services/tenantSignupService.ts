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

import { AppError } from '../middleware/errorHandler';

export interface SqlClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

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

export default { slugify, resolveUniqueSlug, createTenantWithOwner };
