import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));
vi.mock('../services/Ledger', () => ({
  ledger: {
    enabled: false,
    anchorAction: vi.fn().mockResolvedValue({ txid: null, anchored: false, provider: 'noop', timestamp: '' }),
    recordPayment: vi.fn().mockResolvedValue({ txid: null, anchored: false, provider: 'noop', timestamp: '' }),
    issueCertificate: vi.fn().mockResolvedValue({ txid: null, anchored: false, provider: 'noop', timestamp: '' }),
    getStatus: vi.fn().mockResolvedValue({ enabled: false, provider: 'noop' }),
  },
}));

const TENANT_ID = 'tenant-abc-123';
const OTHER_ID = 'some-other-id-456';

/**
 * Asserts that among all calls made to the mocked `query()`, at least one
 * call's SQL text contains a `tenant_id = $N` filter and the tenant id is
 * present in that call's params array. This fails loudly if a query is
 * rewritten to drop the tenant filter.
 */
function expectSomeCallFiltersByTenant(tenantId: string) {
  const calls = mockQuery.mock.calls;
  expect(calls.length).toBeGreaterThan(0);

  const tenantFilteredCalls = calls.filter(([sql, params]) => {
    const hasTenantClause = /tenant_id\s*=\s*\$\d+/i.test(sql);
    const hasTenantParam = Array.isArray(params) && params.includes(tenantId);
    return hasTenantClause && hasTenantParam;
  });

  expect(tenantFilteredCalls.length).toBeGreaterThan(0);
}

describe('tenant isolation', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  describe('studentService', () => {
    it('getAllStudents filters by tenant_id', async () => {
      const studentService = await import('../services/studentService');
      mockQuery
        .mockResolvedValueOnce(queryResult([{ count: '0' }]))
        .mockResolvedValueOnce(queryResult([]));

      await studentService.getAllStudents(TENANT_ID, 1, 50);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getStudentById filters by tenant_id', async () => {
      const studentService = await import('../services/studentService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await studentService.getStudentById(OTHER_ID, TENANT_ID);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('updateStudent filters by tenant_id', async () => {
      const studentService = await import('../services/studentService');
      mockQuery.mockResolvedValueOnce(queryResult([{ id: OTHER_ID, full_name: 'Test' }]));

      await studentService.updateStudent(OTHER_ID, TENANT_ID, { fullName: 'Test' });
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getStudentsByStatus filters by tenant_id', async () => {
      const studentService = await import('../services/studentService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await studentService.getStudentsByStatus(TENANT_ID, 'active');
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getStudentsByInstructor filters by tenant_id', async () => {
      const studentService = await import('../services/studentService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await studentService.getStudentsByInstructor(TENANT_ID, OTHER_ID);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });
  });

  describe('lessonService', () => {
    it('getAllLessons filters by tenant_id', async () => {
      const lessonService = await import('../services/lessonService');
      mockQuery
        .mockResolvedValueOnce(queryResult([{ count: '0' }]))
        .mockResolvedValueOnce(queryResult([]));

      await lessonService.getAllLessons(TENANT_ID, 1, 50);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getLessonById filters by tenant_id', async () => {
      const lessonService = await import('../services/lessonService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await lessonService.getLessonById(OTHER_ID, TENANT_ID);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getLessonsByStudent filters by tenant_id', async () => {
      const lessonService = await import('../services/lessonService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await lessonService.getLessonsByStudent(TENANT_ID, OTHER_ID);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getLessonsByInstructor filters by tenant_id', async () => {
      const lessonService = await import('../services/lessonService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await lessonService.getLessonsByInstructor(TENANT_ID, OTHER_ID);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getLessonsByStatus filters by tenant_id', async () => {
      const lessonService = await import('../services/lessonService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await lessonService.getLessonsByStatus(TENANT_ID, 'scheduled');
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getLessonsByDateRange filters by tenant_id', async () => {
      const lessonService = await import('../services/lessonService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await lessonService.getLessonsByDateRange(TENANT_ID, new Date('2026-01-01'), new Date('2026-01-31'));
      expectSomeCallFiltersByTenant(TENANT_ID);
    });
  });

  describe('paymentService', () => {
    it('getAllPayments filters by tenant_id', async () => {
      const paymentService = await import('../services/paymentService');
      mockQuery
        .mockResolvedValueOnce(queryResult([{ count: '0' }]))
        .mockResolvedValueOnce(queryResult([]));

      await paymentService.getAllPayments(TENANT_ID, 1, 50);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getPaymentById filters by tenant_id', async () => {
      const paymentService = await import('../services/paymentService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await paymentService.getPaymentById(OTHER_ID, TENANT_ID);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('updatePayment filters by tenant_id', async () => {
      const paymentService = await import('../services/paymentService');
      mockQuery.mockResolvedValueOnce(queryResult([{ id: OTHER_ID, amount: 50 }]));

      await paymentService.updatePayment(OTHER_ID, TENANT_ID, { amount: 50 });
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getPaymentsByStudent filters by tenant_id', async () => {
      const paymentService = await import('../services/paymentService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await paymentService.getPaymentsByStudent(TENANT_ID, OTHER_ID);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getPaymentsByLesson filters by tenant_id', async () => {
      const paymentService = await import('../services/paymentService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await paymentService.getPaymentsByLesson(TENANT_ID, OTHER_ID);
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getPaymentsByStatus filters by tenant_id', async () => {
      const paymentService = await import('../services/paymentService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await paymentService.getPaymentsByStatus(TENANT_ID, 'pending');
      expectSomeCallFiltersByTenant(TENANT_ID);
    });

    it('getPaymentsByPaymentMethod filters by tenant_id', async () => {
      const paymentService = await import('../services/paymentService');
      mockQuery.mockResolvedValueOnce(queryResult([]));

      await paymentService.getPaymentsByPaymentMethod(TENANT_ID, 'cash');
      expectSomeCallFiltersByTenant(TENANT_ID);
    });
  });
});
