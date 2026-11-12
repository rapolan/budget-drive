/**
 * Invite-code management CLI for self-service school signup.
 *
 * Usage: npm run signup:invite -- <command> [options]
 *   generate --label "School Name" [--days 14]
 *   list
 *   revoke --id <uuid>
 *
 * Does NOT run its own build (see bootstrap-first-tenant.js for the same
 * decision and rationale) - invoke via `node dist/scripts/signupInviteCli.js`
 * after `npm run build`, never self-building, so a stale/missing build
 * is never silently masked.
 *
 * The DB-touching logic for each command is split into small, exported,
 * independently-testable functions; main()'s own job is only argv
 * parsing and console output.
 */
import crypto from 'crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';

export interface SqlClientLike {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
}

const DEFAULT_EXPIRY_DAYS = 14;

/** Same fast-deterministic-hash reasoning as userService.ts's hashInviteToken - a high-entropy random value, not a user-chosen secret. */
export function hashSignupCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export function generateRawCode(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface GenerateCodeResult {
  id: string;
  rawCode: string;
  label: string | null;
  expiresAt: Date;
}

export async function generateCode(
  client: SqlClientLike,
  options: { label?: string; days?: number }
): Promise<GenerateCodeResult> {
  const rawCode = generateRawCode();
  const codeHash = hashSignupCode(rawCode);
  const days = options.days && options.days > 0 ? options.days : DEFAULT_EXPIRY_DAYS;

  const result = await client.query(
    `INSERT INTO signup_invite_codes (code_hash, label, expires_at)
     VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))
     RETURNING id, label, expires_at`,
    [codeHash, options.label || null, days]
  );

  return {
    id: result.rows[0].id,
    rawCode,
    label: result.rows[0].label,
    expiresAt: result.rows[0].expires_at,
  };
}

export interface InviteCodeListRow {
  id: string;
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  usedByTenantName: string | null;
  revokedAt: Date | null;
}

export async function listCodes(client: SqlClientLike): Promise<InviteCodeListRow[]> {
  const result = await client.query(
    `SELECT
       sic.id, sic.label, sic.created_at, sic.expires_at, sic.used_at, sic.revoked_at,
       t.name AS used_by_tenant_name
     FROM signup_invite_codes sic
     LEFT JOIN tenants t ON t.id = sic.used_by_tenant_id
     WHERE sic.revoked_at IS NULL
     ORDER BY sic.created_at DESC`
  );

  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    usedByTenantName: row.used_by_tenant_name,
    revokedAt: row.revoked_at,
  }));
}

export interface RevokeCodeResult {
  success: boolean;
  reason?: 'not_found' | 'already_used' | 'already_revoked';
}

export async function revokeCode(client: SqlClientLike, id: string): Promise<RevokeCodeResult> {
  const existing = await client.query(
    `SELECT used_at, revoked_at FROM signup_invite_codes WHERE id = $1`,
    [id]
  );

  if (existing.rows.length === 0) {
    return { success: false, reason: 'not_found' };
  }
  if (existing.rows[0].used_at !== null) {
    return { success: false, reason: 'already_used' };
  }
  if (existing.rows[0].revoked_at !== null) {
    return { success: false, reason: 'already_revoked' };
  }

  await client.query(`UPDATE signup_invite_codes SET revoked_at = NOW() WHERE id = $1`, [id]);
  return { success: true };
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string> } {
  const [command, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      const key = rest[i].slice(2);
      const value = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[i + 1] : 'true';
      flags[key] = value;
      if (value !== 'true') i++;
    }
  }
  return { command, flags };
}

function buildSignupLink(rawCode: string): string {
  // The invite link uses a URL FRAGMENT (#code=...), not a query param -
  // a fragment is never sent to the server and never appears in a
  // Referer header, unlike a query param, which is strictly worse for a
  // value that's effectively a bearer secret.
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/signup#code=${rawCode}`;
}

async function main() {
  dotenv.config();

  const { command, flags } = parseArgs(process.argv.slice(2));

  const frontendUrl = process.env.FRONTEND_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  if (command === 'generate' && isProduction && (!frontendUrl || frontendUrl.includes('localhost'))) {
    console.warn('⚠️  WARNING: FRONTEND_URL is unset or still points at localhost while NODE_ENV=production.');
    console.warn('   The signup link printed below will not work for a real prospective school.');
    console.warn('   Set FRONTEND_URL to this app\'s real public frontend URL before sending the link out.\n');
  }

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'driving_school',
  });

  try {
    await client.connect();

    if (command === 'generate') {
      const days = flags.days ? parseInt(flags.days, 10) : undefined;
      const result = await generateCode(client, { label: flags.label, days });
      console.log('============================================================');
      console.log('  New signup invite code generated');
      console.log('============================================================\n');
      console.log(`Label:      ${result.label || '(none)'}`);
      console.log(`Expires:    ${result.expiresAt.toISOString()}`);
      console.log(`Signup link (shown ONCE - not recoverable, send it to the school now):`);
      console.log(`  ${buildSignupLink(result.rawCode)}\n`);
    } else if (command === 'list') {
      const rows = await listCodes(client);
      if (rows.length === 0) {
        console.log('No active (non-revoked) invite codes.');
      } else {
        console.log('Label                          | Created              | Expires               | Used At               | Used By             | Status');
        console.log('-'.repeat(130));
        for (const row of rows) {
          const status = row.usedAt ? 'used' : new Date(row.expiresAt) < new Date() ? 'expired' : 'active';
          console.log(
            `${(row.label || '(none)').padEnd(30)} | ${row.createdAt.toISOString().slice(0, 19).padEnd(20)} | ` +
            `${row.expiresAt.toISOString().slice(0, 19).padEnd(21)} | ${(row.usedAt ? row.usedAt.toISOString().slice(0, 19) : '-').padEnd(21)} | ` +
            `${(row.usedByTenantName || '-').padEnd(19)} | ${status}`
          );
        }
      }
    } else if (command === 'revoke') {
      if (!flags.id) {
        console.error('❌ --id <uuid> is required for revoke.');
        process.exit(1);
      }
      const result = await revokeCode(client, flags.id);
      if (!result.success) {
        const messages: Record<string, string> = {
          not_found: `❌ No invite code found with id "${flags.id}".`,
          already_used: `❌ This invite code has already been used - revoking it now would have no effect.`,
          already_revoked: `❌ This invite code is already revoked.`,
        };
        console.error(messages[result.reason!]);
        process.exit(1);
      }
      console.log(`✅ Invite code ${flags.id} revoked.`);
    } else {
      console.error(`❌ Unknown command "${command || ''}". Usage: generate | list | revoke`);
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ signup:invite failed:', error.message);
    process.exit(1);
  });
}
