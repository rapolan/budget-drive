/**
 * Formats a number as USD with thousands separators and exactly two
 * decimal places (e.g. 2490 -> "$2,490.00"), via Intl.NumberFormat rather
 * than a hand-rolled regex - handles negatives, rounding, and locale
 * grouping correctly. Does not prefix a "-" for negative amounts beyond
 * what Intl itself produces; callers displaying a signed delta (e.g. "vs
 * last month") still compute their own sign and pass Math.abs(n) in.
 */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
