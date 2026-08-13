import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { validateNumeric } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

function mockReq(body: Record<string, unknown>): Request {
  return { body } as Request;
}

const mockRes = {} as Response;

// Regression coverage: Postgres numeric columns (e.g. lessons.duration)
// come back through pg as strings ("60.00", not 60). A value read from one
// query and reused to build another request (e.g. "Book again" prefilling
// duration from a student's most recent lesson) carries that string all the
// way to this route, where it used to reach schedulingService's slot loop
// and silently string-concatenate instead of adding.
describe('validateNumeric', () => {
  it('passes and coerces a genuine number unchanged', () => {
    const middleware = validateNumeric(['duration']);
    const req = mockReq({ duration: 120 });
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.duration).toBe(120);
  });

  it('coerces a numeric string (Postgres numeric-column shape) to a real number', () => {
    const middleware = validateNumeric(['duration']);
    const req = mockReq({ duration: '60.00' });
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.duration).toBe(60);
    expect(typeof req.body.duration).toBe('number');
  });

  it('rejects a non-numeric string', () => {
    const middleware = validateNumeric(['duration']);
    const req = mockReq({ duration: 'abc' });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(AppError);
    expect(() => middleware(req, mockRes, next)).toThrow(/duration/);
    expect(next).not.toHaveBeenCalled();
  });

  it('passes when the field is absent (composes with validateRequired for presence)', () => {
    const middleware = validateNumeric(['duration']);
    const req = mockReq({});
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('passes when the field is null (composes with validateRequired for presence)', () => {
    const middleware = validateNumeric(['duration']);
    const req = mockReq({ duration: null });
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('checks multiple fields and reports all invalid ones together', () => {
    const middleware = validateNumeric(['duration', 'cost']);
    const req = mockReq({ duration: 'abc', cost: 'xyz' });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(/duration, cost/);
  });

  it('coerces the numeric string "0" to the number 0, not treated as falsy/missing', () => {
    const middleware = validateNumeric(['duration']);
    const req = mockReq({ duration: '0' });
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body.duration).toBe(0);
  });
});
