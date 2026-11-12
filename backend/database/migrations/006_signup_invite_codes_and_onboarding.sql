-- Self-service invite-code signup, first-login wizard resumability, and
-- terms/privacy consent evidence - the three pieces of state this feature
-- needs that don't fit any existing table.
--
-- signup_invite_codes: one row per code the operator generates via
-- `npm run signup:invite -- generate`. The plaintext code is shown to the
-- operator ONCE, at generation time, in the CLI's own stdout - only
-- code_hash (sha256, same fast-deterministic-hash reasoning as
-- userService.ts's hashInviteToken: a high-entropy random value, not a
-- user-chosen secret, so bcrypt's per-hash cost buys nothing here) is
-- ever persisted. code_hash's own UNIQUE constraint already provides the
-- index Postgres needs for the claim lookup, so no separate index is
-- added on top of it. label is free text for the operator's own
-- reference (e.g. "Riverside Driving School - called 11/9"), never shown
-- to the signing-up school. Single-use is enforced by the signup
-- endpoint's one atomic claim UPDATE (`SET used_at = NOW() ... WHERE
-- used_at IS NULL`) - this table holds no application-level lock;
-- Postgres's own row-level atomicity on that UPDATE is the entire
-- mechanism. used_by_tenant_id is set in the SAME transaction as the
-- tenant it names, so a failed signup (anything throwing after the claim
-- but before COMMIT) rolls the claim back too via Postgres's own
-- ROLLBACK, never a manual compensating UPDATE - a failed attempt never
-- permanently burns a code. revoked_at lets the operator kill a code
-- that leaked or is no longer wanted, independent of expiry.
--
-- terms_acceptances: evidence a specific user accepted a specific version
-- of the Terms/Privacy content at signup. A dedicated append-only table
-- (never updated/deleted), not columns on users, because: (a) it's audit
-- evidence - a column would be silently overwritten by any future
-- re-acceptance flow after a version bump, destroying the original
-- record; (b) it costs one extra small table and one extra INSERT inside
-- the same signup transaction; (c) avoids ever choosing between adding a
-- second pair of columns later or migrating data into a new table once
-- that need arrives anyway. tenant_id is included alongside user_id so
-- "every acceptance for this tenant" is a direct indexed query, no join
-- through user_tenant_memberships required. version is any non-empty
-- string the frontend sends - no backend equality check against it.
--
-- tenant_settings.onboarding_completed_at: a nullable timestamp used
-- ONLY to drive the wizard's own resume logic and the post-login
-- /onboarding redirect decision - set once, when the wizard reaches its
-- final "Done" step or the user explicitly leaves via the global
-- "finish later" exit. This is a DIFFERENT concern from the Dashboard's
-- getting-started checklist, which stays 100% derived from live counts
-- (instructors/vehicles/students/lessons) and must NEVER read this
-- column. Backfilled to NOW() for every EXISTING tenant below, so this
-- feature never redirects an established school into the wizard - only
-- a tenant created after this migration (via the new signup path) starts
-- with NULL and is eligible for the redirect.

CREATE TABLE signup_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL UNIQUE,
  label text,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  expires_at timestamp without time zone NOT NULL,
  used_at timestamp without time zone,
  used_by_tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  revoked_at timestamp without time zone
);

CREATE TABLE terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  version text NOT NULL,
  accepted_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_terms_acceptances_user ON terms_acceptances(user_id);
CREATE INDEX idx_terms_acceptances_tenant ON terms_acceptances(tenant_id);

ALTER TABLE tenant_settings
  ADD COLUMN onboarding_completed_at timestamp without time zone;

-- Backfill: every tenant that exists BEFORE this migration runs is
-- considered already "onboarded" (they were created by the operator's
-- own bootstrap script or by hand, not through this new wizard) - this
-- must run before anything relies on the column, so an established
-- school is never redirected into a wizard meant for brand-new signups.
UPDATE tenant_settings SET onboarding_completed_at = NOW()
WHERE onboarding_completed_at IS NULL;
