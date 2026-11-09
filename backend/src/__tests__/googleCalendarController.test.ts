import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

const mockBuildConsentUrl = vi.fn();
const mockHandleOAuthCallback = vi.fn();
const mockGetStatus = vi.fn();
const mockDisconnect = vi.fn();
vi.mock('../services/googleCalendarService', () => ({
  buildConsentUrl: (...args: unknown[]) => mockBuildConsentUrl(...args),
  handleOAuthCallback: (...args: unknown[]) => mockHandleOAuthCallback(...args),
  getStatus: (...args: unknown[]) => mockGetStatus(...args),
  disconnect: (...args: unknown[]) => mockDisconnect(...args),
}));

const mockSyncAllUpcomingLessonsForInstructor = vi.fn();
vi.mock('../services/googleCalendarSyncService', () => ({
  syncAllUpcomingLessonsForInstructor: (...args: unknown[]) => mockSyncAllUpcomingLessonsForInstructor(...args),
}));

const TENANT_ID = 'tenant-abc';
const INSTRUCTOR_ID = 'instructor-1';
const OTHER_INSTRUCTOR_ID = 'instructor-2';

type MockReqOverrides = {
  params?: Record<string, string>;
  query?: Record<string, string>;
  user?: { role: string; instructorId?: string };
  tenantId?: string;
};

function mockReq(overrides: MockReqOverrides = {}): Request {
  return {
    params: {},
    query: {},
    user: undefined,
    tenantId: TENANT_ID,
    ...overrides,
  } as unknown as Request;
}

interface MockRes {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
  _json?: unknown;
  _redirect?: string;
  _status?: number;
}

function mockRes(): MockRes {
  const res = {} as MockRes;
  res.status = vi.fn((code: number) => { res._status = code; return res; });
  res.json = vi.fn((body: unknown) => { res._json = body; return res; });
  res.redirect = vi.fn((url: string) => { res._redirect = url; return res; });
  return res;
}

function asRes(res: MockRes): Response {
  return res as unknown as Response;
}

function noopNext(): NextFunction {
  return (() => {}) as unknown as NextFunction;
}

// getTenantId reads req.tenantId - confirmed in middleware/tenantContext.ts.
vi.mock('../middleware/tenantContext', async () => {
  const actual = await vi.importActual('../middleware/tenantContext');
  return actual;
});

describe('googleCalendarController.ts - connect is instructor-self only', () => {
  beforeEach(() => {
    mockBuildConsentUrl.mockReset();
  });

  it('allows the instructor to connect their own calendar', async () => {
    const { connect } = await import('../controllers/googleCalendarController');
    mockBuildConsentUrl.mockReturnValue('https://accounts.google.com/consent-url');

    const req = mockReq({
      params: { instructorId: INSTRUCTOR_ID },
      user: { role: 'instructor', instructorId: INSTRUCTOR_ID },
    });
    const res = mockRes();

    await connect(req, asRes(res), noopNext());

    expect(mockBuildConsentUrl).toHaveBeenCalledWith(INSTRUCTOR_ID, TENANT_ID);
    expect(res._json).toMatchObject({ success: true, data: { consentUrl: expect.any(String) } });
  });

  it('rejects an admin trying to connect on another instructor\'s behalf with a 403, never starting the OAuth flow', async () => {
    const { connect } = await import('../controllers/googleCalendarController');

    const req = mockReq({
      params: { instructorId: INSTRUCTOR_ID },
      user: { role: 'admin', instructorId: undefined },
    });
    const res = mockRes();
    const next = vi.fn();

    // connect is wrapped in asyncHandler, which routes thrown AppErrors to
    // next(err) rather than throwing synchronously out of the handler.
    await connect(req, asRes(res), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(mockBuildConsentUrl).not.toHaveBeenCalled();
  });

  it('rejects an instructor trying to connect a DIFFERENT instructor\'s calendar with a 403', async () => {
    const { connect } = await import('../controllers/googleCalendarController');

    const req = mockReq({
      params: { instructorId: OTHER_INSTRUCTOR_ID },
      user: { role: 'instructor', instructorId: INSTRUCTOR_ID },
    });
    const res = mockRes();
    const next = vi.fn();

    await connect(req, asRes(res), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(mockBuildConsentUrl).not.toHaveBeenCalled();
  });
});

describe('googleCalendarController.ts - status/disconnect allow elevated roles', () => {
  beforeEach(() => {
    mockGetStatus.mockReset();
    mockDisconnect.mockReset();
  });

  it('getStatus allows an admin to view another instructor\'s connection status', async () => {
    const { getStatus } = await import('../controllers/googleCalendarController');
    mockGetStatus.mockResolvedValue({ connected: true, lastSyncAt: null, lastSyncError: null, reconnectRequired: false });

    const req = mockReq({
      params: { instructorId: INSTRUCTOR_ID },
      user: { role: 'admin', instructorId: undefined },
    });
    const res = mockRes();

    await getStatus(req, asRes(res), noopNext());

    expect(mockGetStatus).toHaveBeenCalledWith(INSTRUCTOR_ID, TENANT_ID);
    expect(res._json.success).toBe(true);
  });

  it('getStatus rejects an instructor viewing a DIFFERENT instructor\'s status', async () => {
    const { getStatus } = await import('../controllers/googleCalendarController');

    const req = mockReq({
      params: { instructorId: OTHER_INSTRUCTOR_ID },
      user: { role: 'instructor', instructorId: INSTRUCTOR_ID },
    });
    const res = mockRes();
    const next = vi.fn();

    await getStatus(req, asRes(res), next);

    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(mockGetStatus).not.toHaveBeenCalled();
  });

  it('disconnect allows an admin to disconnect on an instructor\'s behalf', async () => {
    const { disconnect } = await import('../controllers/googleCalendarController');
    mockDisconnect.mockResolvedValue(undefined);

    const req = mockReq({
      params: { instructorId: INSTRUCTOR_ID },
      user: { role: 'owner', instructorId: undefined },
    });
    const res = mockRes();

    await disconnect(req, asRes(res), noopNext());

    expect(mockDisconnect).toHaveBeenCalledWith(INSTRUCTOR_ID, TENANT_ID);
  });
});

describe('googleCalendarController.ts - oauthCallback triggers a non-blocking backfill', () => {
  beforeEach(() => {
    mockHandleOAuthCallback.mockReset();
    mockSyncAllUpcomingLessonsForInstructor.mockReset();
  });

  it('redirects to the connected state and fires backfill without awaiting it', async () => {
    const { oauthCallback } = await import('../controllers/googleCalendarController');
    mockHandleOAuthCallback.mockResolvedValue({ instructorId: INSTRUCTOR_ID, tenantId: TENANT_ID });

    let backfillResolved = false;
    let resolveBackfill: () => void = () => {};
    mockSyncAllUpcomingLessonsForInstructor.mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveBackfill = () => { backfillResolved = true; resolve(); };
      })
    );

    const req = mockReq({ query: { code: 'auth-code', state: 'signed-state' } });
    const res = mockRes();

    await oauthCallback(req, asRes(res), noopNext());

    expect(res._redirect).toContain('googleCalendar=connected');
    expect(mockSyncAllUpcomingLessonsForInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID, TENANT_ID);
    // The redirect already happened - backfill is still pending, proving
    // the callback did not await it.
    expect(backfillResolved).toBe(false);

    resolveBackfill();
  });

  it('redirects to the error state when the callback itself fails, without attempting a backfill', async () => {
    const { oauthCallback } = await import('../controllers/googleCalendarController');
    mockHandleOAuthCallback.mockRejectedValue(new Error('invalid state'));

    const req = mockReq({ query: { code: 'auth-code', state: 'bad-state' } });
    const res = mockRes();

    await oauthCallback(req, asRes(res), noopNext());

    expect(res._redirect).toContain('googleCalendar=error');
    expect(mockSyncAllUpcomingLessonsForInstructor).not.toHaveBeenCalled();
  });
});

describe('googleCalendarController.ts - resync', () => {
  beforeEach(() => {
    mockSyncAllUpcomingLessonsForInstructor.mockReset();
  });

  it('resyncs every upcoming lesson for the instructor on demand', async () => {
    const { resync } = await import('../controllers/googleCalendarController');
    mockSyncAllUpcomingLessonsForInstructor.mockResolvedValue(undefined);

    const req = mockReq({
      params: { instructorId: INSTRUCTOR_ID },
      user: { role: 'instructor', instructorId: INSTRUCTOR_ID },
    });
    const res = mockRes();

    await resync(req, asRes(res), noopNext());

    expect(mockSyncAllUpcomingLessonsForInstructor).toHaveBeenCalledWith(INSTRUCTOR_ID, TENANT_ID);
    expect(res._json.success).toBe(true);
  });

  it('rejects an instructor resyncing a different instructor\'s calendar', async () => {
    const { resync } = await import('../controllers/googleCalendarController');

    const req = mockReq({
      params: { instructorId: OTHER_INSTRUCTOR_ID },
      user: { role: 'instructor', instructorId: INSTRUCTOR_ID },
    });
    const res = mockRes();
    const next = vi.fn();

    await resync(req, asRes(res), next);

    expect(next.mock.calls[0][0].statusCode).toBe(403);
    expect(mockSyncAllUpcomingLessonsForInstructor).not.toHaveBeenCalled();
  });
});
