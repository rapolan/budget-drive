import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { validateDateRangePair } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

function mockReq(body: Record<string, unknown>): Request {
  return { body } as Request;
}

const mockRes = {} as Response;

describe('validateDateRangePair', () => {
  it('passes when both fields are absent (caller wants the endpoint default)', () => {
    const middleware = validateDateRangePair('startDate', 'endDate');
    const req = mockReq({});
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('passes when both fields are present, valid, and end >= start', () => {
    const middleware = validateDateRangePair('startDate', 'endDate');
    const req = mockReq({ startDate: '2026-08-10', endDate: '2026-08-24' });
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('passes when start equals end (a single-day range)', () => {
    const middleware = validateDateRangePair('startDate', 'endDate');
    const req = mockReq({ startDate: '2026-08-10', endDate: '2026-08-10' });
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects when only startDate is present', () => {
    const middleware = validateDateRangePair('startDate', 'endDate');
    const req = mockReq({ startDate: '2026-08-10' });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when only endDate is present', () => {
    const middleware = validateDateRangePair('startDate', 'endDate');
    const req = mockReq({ endDate: '2026-08-10' });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(AppError);
  });

  it('rejects when endDate is before startDate', () => {
    const middleware = validateDateRangePair('startDate', 'endDate');
    const req = mockReq({ startDate: '2026-08-24', endDate: '2026-08-10' });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(/must not be before/);
  });

  it('rejects a malformed startDate string', () => {
    const middleware = validateDateRangePair('startDate', 'endDate');
    const req = mockReq({ startDate: 'not-a-date', endDate: '2026-08-10' });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(/YYYY-MM-DD/);
  });

  it('rejects a malformed endDate string', () => {
    const middleware = validateDateRangePair('startDate', 'endDate');
    const req = mockReq({ startDate: '2026-08-10', endDate: '08/24/2026' });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(/YYYY-MM-DD/);
  });
});
