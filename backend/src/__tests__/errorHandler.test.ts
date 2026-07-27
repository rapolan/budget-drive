import { describe, it, expect, vi } from 'vitest';
import { AppError, errorHandler } from '../middleware/errorHandler';

function mockReqRes() {
  const req: any = { path: '/api/v1/lessons', method: 'POST' };
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const res: any = { status };
  const next = vi.fn();
  return { req, res, next, status, json };
}

describe('errorHandler middleware - structured conflict codes', () => {
  it('includes conflictType and conflicts in the response when the AppError carries conflicts', () => {
    const { req, res, next, status, json } = mockReqRes();
    const conflicts = [
      { type: 'vehicle_busy' as const, message: 'Vehicle is already assigned to another lesson' },
    ];
    const err = new AppError('Scheduling conflict: Vehicle is already assigned to another lesson', 409, conflicts);

    errorHandler(err, req, res, next);

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: err.message,
        conflictType: 'vehicle_busy',
        conflicts,
      })
    );
  });

  it('uses the first conflict\'s type as conflictType when multiple conflicts are present', () => {
    const { req, res, json } = mockReqRes();
    const conflicts = [
      { type: 'instructor_busy' as const, message: 'Instructor busy' },
      { type: 'capacity_reached' as const, message: 'At capacity' },
    ];
    const err = new AppError('Scheduling conflict: Instructor busy; At capacity', 409, conflicts);

    errorHandler(err, req, res, vi.fn());

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ conflictType: 'instructor_busy' }));
  });

  it('omits conflictType/conflicts when the AppError has no conflicts', () => {
    const { req, res, json } = mockReqRes();
    const err = new AppError('Student not found or does not belong to this organization', 404);

    errorHandler(err, req, res, vi.fn());

    const responseBody = json.mock.calls[0][0];
    expect(responseBody).not.toHaveProperty('conflictType');
    expect(responseBody).not.toHaveProperty('conflicts');
    expect(responseBody).toEqual(
      expect.objectContaining({ success: false, error: err.message })
    );
  });

  it('omits conflictType/conflicts for a plain (non-AppError) Error', () => {
    const { req, res, json } = mockReqRes();
    const err = new Error('Unexpected failure');

    errorHandler(err, req, res, vi.fn());

    const responseBody = json.mock.calls[0][0];
    expect(responseBody).not.toHaveProperty('conflictType');
    expect(responseBody).not.toHaveProperty('conflicts');
  });
});
