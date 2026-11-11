import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SqlClient } from '../services/tenantSignupService';

// Pure unit tests against a fake SqlClient (no real database) - these
// exercise the shared tenant-creation logic both bootstrap-first-tenant.js
// and the new signup endpoint call, confirming the function itself
// behaves correctly in isolation (end-to-end verification against a real
// throwaway Postgres instance was performed manually during development -
// see the session notes/commit message for that result).

function makeFakeClient(): { client: SqlClient; calls: { sql: string; params?: unknown[] }[] } {
  const calls: { sql: string; params?: unknown[] }[] = [];
  const client: SqlClient = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      if (/SELECT id FROM tenants WHERE slug/.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/INSERT INTO tenants/.test(sql)) {
        return { rows: [{ id: 'tenant-id-1' }], rowCount: 1 };
      }
      if (/INSERT INTO users/.test(sql)) {
        return { rows: [{ id: 'user-id-1' }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }),
  };
  return { client, calls };
}

describe('tenantSignupService.slugify', () => {
  it('lowercases, trims, and replaces non-alphanumerics with hyphens', async () => {
    const { slugify } = await import('../services/tenantSignupService');
    expect(slugify('  Acme Driving School!! ')).toBe('acme-driving-school');
  });

  it('strips leading/trailing hyphens', async () => {
    const { slugify } = await import('../services/tenantSignupService');
    expect(slugify('---Acme---')).toBe('acme');
  });
});

describe('tenantSignupService.resolveUniqueSlug', () => {
  it('returns the base slug unchanged when it is free', async () => {
    const { resolveUniqueSlug } = await import('../services/tenantSignupService');
    const { client } = makeFakeClient();
    const slug = await resolveUniqueSlug(client, 'acme-driving-school');
    expect(slug).toBe('acme-driving-school');
  });

  it('appends -2, -3, etc. until an unused slug is found', async () => {
    const { resolveUniqueSlug } = await import('../services/tenantSignupService');
    let callCount = 0;
    const client: SqlClient = {
      query: vi.fn(async () => {
        callCount++;
        // First two checks ("acme-driving-school", "acme-driving-school-2") taken, third free.
        return callCount <= 2 ? { rows: [{ id: 'x' }], rowCount: 1 } : { rows: [], rowCount: 0 };
      }),
    };
    const slug = await resolveUniqueSlug(client, 'acme-driving-school');
    expect(slug).toBe('acme-driving-school-3');
    expect(callCount).toBe(3);
  });

  it('throws after too many collisions rather than looping forever', async () => {
    const { resolveUniqueSlug } = await import('../services/tenantSignupService');
    const client: SqlClient = {
      query: vi.fn(async () => ({ rows: [{ id: 'x' }], rowCount: 1 })), // always "taken"
    };
    await expect(resolveUniqueSlug(client, 'acme')).rejects.toThrow(/Could not generate a unique slug/);
  });
});

describe('tenantSignupService.createTenantWithOwner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts tenant, tenant_settings, user, and membership in order, on the passed-in client', async () => {
    const { createTenantWithOwner } = await import('../services/tenantSignupService');
    const { client, calls } = makeFakeClient();

    const result = await createTenantWithOwner(
      {
        tenantName: 'Acme Driving School',
        tenantSlugBase: 'Acme Driving School',
        tenantEmail: 'acme@example.com',
        ownerEmail: 'owner@example.com',
        ownerFullName: 'Owner Name',
        ownerPasswordHash: 'already-hashed-value',
      },
      client
    );

    expect(result).toEqual({ tenantId: 'tenant-id-1', tenantSlug: 'acme-driving-school', userId: 'user-id-1' });

    const sqlSequence = calls.map((c) => c.sql);
    const tenantsIdx = sqlSequence.findIndex((s) => /INSERT INTO tenants/.test(s));
    const settingsIdx = sqlSequence.findIndex((s) => /INSERT INTO tenant_settings/.test(s));
    const usersIdx = sqlSequence.findIndex((s) => /INSERT INTO users/.test(s));
    const membershipIdx = sqlSequence.findIndex((s) => /INSERT INTO user_tenant_memberships/.test(s));

    expect(tenantsIdx).toBeGreaterThanOrEqual(0);
    expect(settingsIdx).toBeGreaterThan(tenantsIdx);
    expect(usersIdx).toBeGreaterThan(settingsIdx);
    expect(membershipIdx).toBeGreaterThan(usersIdx);

    // Never passes a plaintext password anywhere - only the pre-hashed value.
    const usersCall = calls[usersIdx];
    expect(usersCall.params).toContain('already-hashed-value');
  });

  it('defaults planTier to enterprise when not provided (matches bootstrap script behavior)', async () => {
    const { createTenantWithOwner } = await import('../services/tenantSignupService');
    const { client, calls } = makeFakeClient();

    await createTenantWithOwner(
      {
        tenantName: 'Acme',
        tenantSlugBase: 'Acme',
        tenantEmail: 'acme@example.com',
        ownerEmail: 'owner@example.com',
        ownerFullName: 'Owner',
        ownerPasswordHash: 'hash',
      },
      client
    );

    const tenantInsert = calls.find((c) => /INSERT INTO tenants/.test(c.sql));
    expect(tenantInsert?.params).toContain('enterprise');
  });

  it('passes planTier through when explicitly provided (e.g. "basic" for self-signup)', async () => {
    const { createTenantWithOwner } = await import('../services/tenantSignupService');
    const { client, calls } = makeFakeClient();

    await createTenantWithOwner(
      {
        tenantName: 'Acme',
        tenantSlugBase: 'Acme',
        tenantEmail: 'acme@example.com',
        ownerEmail: 'owner@example.com',
        ownerFullName: 'Owner',
        ownerPasswordHash: 'hash',
        planTier: 'basic',
      },
      client
    );

    const tenantInsert = calls.find((c) => /INSERT INTO tenants/.test(c.sql));
    expect(tenantInsert?.params).toContain('basic');
  });

  it('onboardingCompleted: true sets tenant_settings.onboarding_completed_at to NOW() at creation (bootstrap path)', async () => {
    const { createTenantWithOwner } = await import('../services/tenantSignupService');
    const { client, calls } = makeFakeClient();

    await createTenantWithOwner(
      {
        tenantName: 'Acme',
        tenantSlugBase: 'Acme',
        tenantEmail: 'acme@example.com',
        ownerEmail: 'owner@example.com',
        ownerFullName: 'Owner',
        ownerPasswordHash: 'hash',
        onboardingCompleted: true,
      },
      client
    );

    const settingsInsert = calls.find((c) => /INSERT INTO tenant_settings/.test(c.sql));
    expect(settingsInsert?.sql).toMatch(/onboarding_completed_at\s*\)\s*VALUES.*NOW\(\)/s);
  });

  it('omitting onboardingCompleted leaves tenant_settings.onboarding_completed_at NULL at creation (self-signup path)', async () => {
    const { createTenantWithOwner } = await import('../services/tenantSignupService');
    const { client, calls } = makeFakeClient();

    await createTenantWithOwner(
      {
        tenantName: 'Acme',
        tenantSlugBase: 'Acme',
        tenantEmail: 'acme@example.com',
        ownerEmail: 'owner@example.com',
        ownerFullName: 'Owner',
        ownerPasswordHash: 'hash',
      },
      client
    );

    const settingsInsert = calls.find((c) => /INSERT INTO tenant_settings/.test(c.sql));
    expect(settingsInsert?.sql).toMatch(/onboarding_completed_at\s*\)\s*VALUES.*NULL\)/s);
  });

  it('propagates an error from any insert rather than swallowing it', async () => {
    const { createTenantWithOwner } = await import('../services/tenantSignupService');
    const client: SqlClient = {
      query: vi.fn(async (sql: string) => {
        if (/SELECT id FROM tenants WHERE slug/.test(sql)) return { rows: [], rowCount: 0 };
        if (/INSERT INTO tenants/.test(sql)) return { rows: [{ id: 't1' }], rowCount: 1 };
        if (/INSERT INTO tenant_settings/.test(sql)) throw new Error('simulated insert failure');
        return { rows: [], rowCount: 0 };
      }),
    };

    await expect(
      createTenantWithOwner(
        {
          tenantName: 'Acme',
          tenantSlugBase: 'Acme',
          tenantEmail: 'acme@example.com',
          ownerEmail: 'owner@example.com',
          ownerFullName: 'Owner',
          ownerPasswordHash: 'hash',
        },
        client
      )
    ).rejects.toThrow('simulated insert failure');
  });

  it('throws a clear error when the slug base normalizes to empty', async () => {
    const { createTenantWithOwner } = await import('../services/tenantSignupService');
    const { client } = makeFakeClient();

    await expect(
      createTenantWithOwner(
        {
          tenantName: 'Acme',
          tenantSlugBase: '!!!',
          tenantEmail: 'acme@example.com',
          ownerEmail: 'owner@example.com',
          ownerFullName: 'Owner',
          ownerPasswordHash: 'hash',
        },
        client
      )
    ).rejects.toThrow(/Could not derive a valid slug/);
  });
});
