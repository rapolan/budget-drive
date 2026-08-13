-- Drops tenant_settings.timezone's DB-level default so a NEWLY CREATED
-- tenant's timezone starts genuinely NULL/unset, instead of silently
-- populated as 'America/Los_Angeles' the moment the row is created (the
-- INSERT in tenantService.createDefaultTenantSettings has always omitted
-- timezone, relying on this column default). "Unset" needs to be a real,
-- distinguishable state so the Settings page can offer the browser-detected
-- timezone as a one-time suggestion only when the tenant has never actually
-- configured one - conflating "never configured" with "explicitly chose the
-- Pacific default" would wrongly suggest a browser zone to a school that
-- deliberately picked Pacific.
--
-- backend/src/utils/tenantTime.ts's resolveTenantTimezone() already treats
-- null/undefined/empty the same as before this migration (falls back to the
-- same DEFAULT_TENANT_TIMEZONE = 'America/Los_Angeles' constant), so no
-- date-math behavior changes for any tenant, existing or new.
--
-- Existing tenant rows already stored as 'America/Los_Angeles' from before
-- this migration are NOT backfilled to NULL - there is no way to tell
-- whether that value was ever an explicit admin choice, so they simply keep
-- their current (non-suggestion-eligible) state rather than guessing.

ALTER TABLE public.tenant_settings
    ALTER COLUMN timezone DROP DEFAULT;
