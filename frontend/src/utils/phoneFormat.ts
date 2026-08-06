/**
 * Phone Formatting Utilities
 */

/**
 * Format a phone number as (XXX) XXX-XXXX progressively while typing.
 * Strips non-digit characters and caps at 10 digits.
 * @param value - Raw input value (may include partial formatting already)
 * @returns Formatted phone string, or '' if no digits present
 */
export function formatPhoneNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  const limited = digits.slice(0, 10);

  if (limited.length === 0) return '';
  if (limited.length <= 3) return `(${limited}`;
  if (limited.length <= 6) return `(${limited.slice(0, 3)}) ${limited.slice(3)}`;
  return `(${limited.slice(0, 3)}) ${limited.slice(3, 6)}-${limited.slice(6)}`;
}
