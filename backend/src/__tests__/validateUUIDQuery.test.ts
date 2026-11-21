import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import { validateUUIDQuery } from '../middleware/validate';
import { AppError } from '../middleware/errorHandler';

function mockReq(query: Record<string, unknown>): Request {
  return { query } as unknown as Request;
}

const mockRes = {} as Response;

// Regression coverage: GET /lessons/student/:studentId/last-completed-note
// took excludeLessonId straight off req.query with no shape check - a
// malformed value (not a UUID at all) would reach lessonService's query
// as-is and surface as a 500 from Postgres rejecting the parameter, rather
// than a clean 400 at the route boundary. validateUUID itself can't catch
// this: it only ever reads req.params, never req.query.
describe('validateUUIDQuery', () => {
  it('calls next() for a well-formed UUID', () => {
    const middleware = validateUUIDQuery('excludeLessonId');
    const req = mockReq({ excludeLessonId: '550e8400-e29b-41d4-a716-446655440000' });
    const next = vi.fn();

    middleware(req, mockRes, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a malformed value with a 400 AppError, not letting it reach the service layer', () => {
    const middleware = validateUUIDQuery('excludeLessonId');
    const req = mockReq({ excludeLessonId: 'not-a-uuid' });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(AppError);
    expect(() => middleware(req, mockRes, next)).toThrow(/excludeLessonId/);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a missing query parameter with a 400, not undefined reaching the service layer', () => {
    const middleware = validateUUIDQuery('excludeLessonId');
    const req = mockReq({});
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a SQL-injection-shaped value the same as any other malformed string', () => {
    const middleware = validateUUIDQuery('excludeLessonId');
    const req = mockReq({ excludeLessonId: "'; DROP TABLE lessons; --" });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects an array value (e.g. ?excludeLessonId=a&excludeLessonId=b`), which Express would parse as a non-string', () => {
    const middleware = validateUUIDQuery('excludeLessonId');
    const req = mockReq({ excludeLessonId: ['550e8400-e29b-41d4-a716-446655440000', 'another-one'] });
    const next = vi.fn();

    expect(() => middleware(req, mockRes, next)).toThrow(AppError);
    expect(next).not.toHaveBeenCalled();
  });
});
