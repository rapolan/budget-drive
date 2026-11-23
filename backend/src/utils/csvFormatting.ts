/**
 * RFC 4180 CSV cell escaping, plus a spreadsheet formula-injection guard.
 * Extracted as its own pure, directly-testable module rather than kept
 * inline in paymentController.ts, matching receiptService.ts's own
 * "small pure helper gets its own file and its own tests" convention.
 */

// Excel/Google Sheets/LibreOffice treat a cell as a formula to evaluate
// when its first character is one of these - a free-text field a user
// controls (a student name, a payment reference number) could contain
// something like `=cmd|'/c calc'!A1`, which executes when the exported
// CSV is later opened in a spreadsheet app. A tab or carriage return as
// the first character is included because some parsers also treat those
// as formula-starting in older/alternate CSV dialects.
const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

/**
 * Neutralizes spreadsheet formula injection by prefixing a single quote
 * when the first character is =, +, -, @, a tab, or a carriage return.
 * Every major spreadsheet app treats a leading single quote as "force
 * this cell to plain text" and does not display the quote itself. Must
 * run BEFORE csvEscape's own comma/quote/newline escaping - the leading
 * quote this adds is plain text, not something that escaping needs to
 * (or should) react to.
 */
export function neutralizeFormulaInjection(value: string): string {
  return FORMULA_INJECTION_PREFIX.test(value) ? `'${value}` : value;
}

/**
 * Formats one CSV cell: formula-injection-neutralized first, then
 * RFC 4180-escaped (quoted, with embedded double quotes doubled, whenever
 * the value contains a comma, double quote, or newline - free text like a
 * student's name can legitimately contain a comma, e.g. "Smith, Jr.").
 */
export function csvCell(value: string | number | null): string {
  const str = neutralizeFormulaInjection(value === null ? '' : String(value));
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
