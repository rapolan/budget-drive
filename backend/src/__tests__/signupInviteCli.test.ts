import { describe, it, expect, vi } from 'vitest';
import {
  generateCode,
  listCodes,
  revokeCode,
  hashSignupCode,
  generateRawCode,
  type SqlClientLike,
} from '../scripts/signupInviteCli';

// Live end-to-end verification (generate/list/revoke against a real,
// throwaway, migrated Postgres database) was performed manually during
// development - see the session notes/commit message for that result.
// These tests cover the pure DB-touching logic in isolation, extracted
// specifically so they're testable without driving the CLI's own
// argv-parsing/process.exit shell.

describe('hashSignupCode / generateRawCode', () => {
  it('generateRawCode produces a 64-char hex string (32 bytes)', () => {
    const code = generateRawCode();
    expect(code).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashSignupCode is deterministic for the same input', () => {
    const code = 'some-raw-code-value';
    expect(hashSignupCode(code)).toBe(hashSignupCode(code));
  });

  it('hashSignupCode never returns the plaintext input', () => {
    const code = 'a-very-distinctive-raw-code-value-xyz';
    expect(hashSignupCode(code)).not.toContain(code);
  });
});

describe('generateCode', () => {
  it('inserts a hashed code with the default 14-day expiry when no --days given', async () => {
    const queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
      expect(sql).toMatch(/INSERT INTO signup_invite_codes/);
      expect(params![2]).toBe(14); // days
      return { rows: [{ id: 'code-id-1', label: 'Riverside', expires_at: new Date('2026-11-23T00:00:00Z') }], rowCount: 1 };
    });
    const client: SqlClientLike = { query: queryMock };

    const result = await generateCode(client, { label: 'Riverside' });

    expect(result.id).toBe('code-id-1');
    expect(result.rawCode).toMatch(/^[0-9a-f]{64}$/);
    expect(result.label).toBe('Riverside');
  });

  it('uses a custom --days value when provided', async () => {
    const queryMock = vi.fn(async (_sql: string, params?: unknown[]) => {
      expect(params![2]).toBe(7);
      return { rows: [{ id: 'code-id-2', label: null, expires_at: new Date() }], rowCount: 1 };
    });
    const client: SqlClientLike = { query: queryMock };

    await generateCode(client, { days: 7 });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('never passes the plaintext code to the database - only its hash', async () => {
    let capturedHash = '';
    let capturedRawCode = '';
    const client: SqlClientLike = {
      query: vi.fn(async (_sql: string, params?: unknown[]) => {
        capturedHash = params![0] as string;
        return { rows: [{ id: 'x', label: null, expires_at: new Date() }], rowCount: 1 };
      }),
    };

    const result = await generateCode(client, {});
    capturedRawCode = result.rawCode;

    expect(capturedHash).not.toBe(capturedRawCode);
    expect(capturedHash).toBe(hashSignupCode(capturedRawCode));
  });
});

describe('listCodes', () => {
  it('queries only non-revoked codes, newest first, with the tenant name joined in', async () => {
    const client: SqlClientLike = {
      query: vi.fn(async (sql: string) => {
        expect(sql).toMatch(/revoked_at IS NULL/);
        expect(sql).toMatch(/ORDER BY sic\.created_at DESC/);
        return {
          rows: [
            {
              id: '1', label: 'School A', created_at: new Date(), expires_at: new Date(),
              used_at: null, revoked_at: null, used_by_tenant_name: null,
            },
          ],
          rowCount: 1,
        };
      }),
    };

    const rows = await listCodes(client);
    expect(rows).toHaveLength(1);
    expect(rows[0].label).toBe('School A');
    expect(rows[0].usedByTenantName).toBeNull();
  });
});

describe('revokeCode', () => {
  it('returns not_found when the id does not exist', async () => {
    const client: SqlClientLike = { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) };
    const result = await revokeCode(client, 'nonexistent-id');
    expect(result).toEqual({ success: false, reason: 'not_found' });
  });

  it('returns already_used when the code has been claimed', async () => {
    const client: SqlClientLike = {
      query: vi.fn(async () => ({ rows: [{ used_at: new Date(), revoked_at: null }], rowCount: 1 })),
    };
    const result = await revokeCode(client, 'used-id');
    expect(result).toEqual({ success: false, reason: 'already_used' });
  });

  it('returns already_revoked when the code is already revoked', async () => {
    const client: SqlClientLike = {
      query: vi.fn(async () => ({ rows: [{ used_at: null, revoked_at: new Date() }], rowCount: 1 })),
    };
    const result = await revokeCode(client, 'revoked-id');
    expect(result).toEqual({ success: false, reason: 'already_revoked' });
  });

  it('revokes successfully and issues the UPDATE when unused and not already revoked', async () => {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const client: SqlClientLike = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        if (/SELECT used_at/.test(sql)) return { rows: [{ used_at: null, revoked_at: null }], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      }),
    };

    const result = await revokeCode(client, 'valid-id');
    expect(result).toEqual({ success: true });
    expect(calls.some((c) => /UPDATE signup_invite_codes SET revoked_at/.test(c.sql))).toBe(true);
  });
});
