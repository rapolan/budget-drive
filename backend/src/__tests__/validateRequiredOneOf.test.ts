import { describe, it, expect, vi } from 'vitest';
import { validateRequiredOneOf } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

function mockReq(body: Record<string, unknown>) {
  return { body } as any;
}

describe('validateRequiredOneOf', () => {
  it('passes when the first field group is fully present', () => {
    const middleware = validateRequiredOneOf([
      ['scheduledStart', 'scheduledEnd'],
      ['date', 'startTime', 'endTime'],
    ]);
    const req = mockReq({ scheduledStart: '2026-08-03T10:00:00', scheduledEnd: '2026-08-03T12:00:00' });
    const next = vi.fn();

    middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledWith(); // called with no error
  });

  it('passes when the second field group is fully present', () => {
    const middleware = validateRequiredOneOf([
      ['scheduledStart', 'scheduledEnd'],
      ['date', 'startTime', 'endTime'],
    ]);
    const req = mockReq({ date: '2026-08-03', startTime: '10:00:00', endTime: '12:00:00' });
    const next = vi.fn();

    middleware(req, {} as any, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects when neither group is fully present', () => {
    const middleware = validateRequiredOneOf([
      ['scheduledStart', 'scheduledEnd'],
      ['date', 'startTime', 'endTime'],
    ]);
    const req = mockReq({ date: '2026-08-03' }); // missing startTime/endTime, no scheduledStart/End either
    const next = vi.fn();

    expect(() => middleware(req, {} as any, next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects when a group is only partially present', () => {
    const middleware = validateRequiredOneOf([
      ['scheduledStart', 'scheduledEnd'],
      ['date', 'startTime', 'endTime'],
    ]);
    const req = mockReq({ scheduledStart: '2026-08-03T10:00:00' }); // missing scheduledEnd
    const next = vi.fn();

    expect(() => middleware(req, {} as any, next)).toThrow(/Missing required fields/);
  });
});
