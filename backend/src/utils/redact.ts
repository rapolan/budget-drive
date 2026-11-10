/**
 * Redacts likely-sensitive values out of an arbitrary object before it's
 * logged. Built for errorLoggingMiddleware, which previously passed
 * req.body/req.query/req.params straight into Winston on every error - a
 * failed login or failed signup logged the submitted plaintext password
 * verbatim, which (per the existing BSV wallet-key safety precedent,
 * docs/ARCHITECTURE.md §23) persists indefinitely on this app's hosting
 * platform.
 *
 * A key is redacted if it exactly matches one of the known sensitive
 * field names this codebase actually uses, or matches /pass|token|secret|code/i
 * generically (to catch a future field this list doesn't yet know about).
 * zipCode/zip_code/postalCode are explicitly exempted from the generic
 * pattern - "code" in a key name is a false positive for a ZIP code, an
 * ordinary address field with no secrecy value.
 */

const EXPLICIT_SENSITIVE_KEYS = new Set([
  'password', 'ownerPassword', 'currentPassword', 'newPassword',
  'code', 'token', 'authorization', 'secret',
]);

const SENSITIVE_KEY_PATTERN = /pass|token|secret|code/i;

const ZIP_KEY_ALLOWLIST = new Set(['zipcode', 'zip_code', 'postalcode', 'postal_code']);

function isSensitiveKey(key: string): boolean {
  if (ZIP_KEY_ALLOWLIST.has(key.toLowerCase())) return false;
  return EXPLICIT_SENSITIVE_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key);
}

export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? '[REDACTED]' : redactSensitive(val);
    }
    return result;
  }
  return value;
}
