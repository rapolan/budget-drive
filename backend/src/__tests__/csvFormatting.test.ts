import { describe, it, expect } from 'vitest';
import { csvCell, neutralizeFormulaInjection } from '../utils/csvFormatting';

describe('neutralizeFormulaInjection', () => {
  it.each(['=cmd|\'/c calc\'!A1', '=1+1', '+1+1', '-1+1', '@SUM(A1:A2)', '\t=cmd', '\r=cmd'])(
    'prefixes a single quote when the value starts with a dangerous character (%s)',
    (value) => {
      expect(neutralizeFormulaInjection(value)).toBe(`'${value}`);
    }
  );

  it('does not alter a value that merely contains a dangerous character later on', () => {
    expect(neutralizeFormulaInjection('Smith=Jones')).toBe('Smith=Jones');
    expect(neutralizeFormulaInjection('Ref #1+2')).toBe('Ref #1+2');
  });

  it('leaves ordinary names and reference numbers untouched', () => {
    expect(neutralizeFormulaInjection('Jane Doe')).toBe('Jane Doe');
    expect(neutralizeFormulaInjection('SQ-1029384')).toBe('SQ-1029384'); // leading digit, not a dash
  });

  it('treats a leading hyphen as dangerous even though it reads as a plausible reference number', () => {
    // A hyphen-first reference number (e.g. a dash-prefixed invoice code)
    // is still a valid Excel formula lead character - correctness here
    // means always neutralizing it, even though it costs a slightly odd
    // display for that one case.
    expect(neutralizeFormulaInjection('-12345')).toBe("'-12345");
  });
});

describe('csvCell', () => {
  it('neutralizes formula injection before applying RFC 4180 quoting', () => {
    // A value that is BOTH formula-dangerous and contains a comma must
    // end up with the leading quote preserved inside the RFC 4180 quoted
    // form, not stripped or double-escaped.
    expect(csvCell('=SUM(A1), nice')).toBe('"\'=SUM(A1), nice"');
  });

  it('quotes a value containing a comma', () => {
    expect(csvCell('Smith, Jr.')).toBe('"Smith, Jr."');
  });

  it('doubles an embedded double quote and wraps in quotes', () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
  });

  it('quotes a value containing a newline or carriage return', () => {
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('returns an empty string for null', () => {
    expect(csvCell(null)).toBe('');
  });

  it('passes through a plain number unquoted', () => {
    expect(csvCell(42)).toBe('42');
  });

  it('passes through an ordinary string unquoted and unmodified', () => {
    expect(csvCell('Jane Doe')).toBe('Jane Doe');
  });
});
