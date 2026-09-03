import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const STUDENT_ID = 'student-1';

/**
 * Phase 3 of the compliance-records arc: deDeliveryMode is required at
 * creation time for a driver_education enrollment - it's the missing
 * signal the certificate form-type mapper needs (classroom -> DL_400B,
 * online -> DL_400C, see certificateService.test.ts). driver_training is
 * unaffected - the field is meaningless for it.
 */
describe('enrollmentService.createEnrollment - deDeliveryMode', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('rejects a driver_education enrollment with no deDeliveryMode', async () => {
    const { createEnrollment } = await import('../services/enrollmentService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])); // student exists check

    await expect(
      createEnrollment(STUDENT_ID, TENANT_ID, { programType: 'driver_education' })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an invalid deDeliveryMode value', async () => {
    const { createEnrollment } = await import('../services/enrollmentService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]));

    await expect(
      createEnrollment(STUDENT_ID, TENANT_ID, {
        programType: 'driver_education',
        // @ts-expect-error - deliberately invalid for the test
        deDeliveryMode: 'in-person',
      })
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('creates a classroom driver_education enrollment and persists de_delivery_mode', async () => {
    const { createEnrollment } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([{ default_hours_required: 6 }])) // tenant settings (via getTenantSettings)
      .mockResolvedValueOnce(
        queryResult([{
          id: 'enrollment-1', tenant_id: TENANT_ID, student_id: STUDENT_ID,
          program_type: 'driver_education', de_delivery_mode: 'classroom',
        }])
      ); // INSERT

    const enrollment = await createEnrollment(STUDENT_ID, TENANT_ID, {
      programType: 'driver_education',
      deDeliveryMode: 'classroom',
    });

    expect(enrollment.deDeliveryMode).toBe('classroom');
    const [sql, params] = mockQuery.mock.calls[2];
    expect(sql).toMatch(/de_delivery_mode/);
    expect(params).toContain('classroom');
  });

  it('creates an online driver_education enrollment and persists de_delivery_mode', async () => {
    const { createEnrollment } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]))
      .mockResolvedValueOnce(queryResult([{ default_hours_required: 6 }]))
      .mockResolvedValueOnce(
        queryResult([{
          id: 'enrollment-2', tenant_id: TENANT_ID, student_id: STUDENT_ID,
          program_type: 'driver_education', de_delivery_mode: 'online',
        }])
      );

    const enrollment = await createEnrollment(STUDENT_ID, TENANT_ID, {
      programType: 'driver_education',
      deDeliveryMode: 'online',
      manualCompletedHours: 30,
    });

    expect(enrollment.deDeliveryMode).toBe('online');
  });

  it('uses the DE-specific hours default (30), never the BTW default_hours_required, when hoursRequired is omitted', async () => {
    const { createEnrollment } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      // No default_de_hours_required column in this row - the ?? 30
      // fallback applies. default_hours_required (6, the BTW figure) must
      // never leak into a DE enrollment's hours_required.
      .mockResolvedValueOnce(queryResult([{ default_hours_required: 6 }])) // tenant settings
      .mockResolvedValueOnce(
        queryResult([{
          id: 'enrollment-4', tenant_id: TENANT_ID, student_id: STUDENT_ID,
          program_type: 'driver_education', de_delivery_mode: 'classroom', hours_required: 30,
        }])
      );

    await createEnrollment(STUDENT_ID, TENANT_ID, { programType: 'driver_education', deDeliveryMode: 'classroom' });

    const [, params] = mockQuery.mock.calls[2];
    expect(params).toContain(30);
    expect(params).not.toContain(6);
  });

  it('uses the tenant-configured default_de_hours_required over the hardcoded 30 when set', async () => {
    const { createEnrollment } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]))
      .mockResolvedValueOnce(queryResult([{ default_hours_required: 6, default_de_hours_required: 20 }]))
      .mockResolvedValueOnce(
        queryResult([{
          id: 'enrollment-5', tenant_id: TENANT_ID, student_id: STUDENT_ID,
          program_type: 'driver_education', de_delivery_mode: 'online', hours_required: 20,
        }])
      );

    await createEnrollment(STUDENT_ID, TENANT_ID, { programType: 'driver_education', deDeliveryMode: 'online' });

    const [, params] = mockQuery.mock.calls[2];
    expect(params).toContain(20);
  });

  it('does not require deDeliveryMode for driver_training', async () => {
    const { createEnrollment } = await import('../services/enrollmentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // student exists
      .mockResolvedValueOnce(queryResult([])) // getActiveDriverTrainingEnrollment - none active
      .mockResolvedValueOnce(queryResult([{ default_hours_required: 6 }])) // tenant settings
      .mockResolvedValueOnce(
        queryResult([{
          id: 'enrollment-3', tenant_id: TENANT_ID, student_id: STUDENT_ID,
          program_type: 'driver_training', de_delivery_mode: null,
        }])
      );

    const enrollment = await createEnrollment(STUDENT_ID, TENANT_ID, { programType: 'driver_training' });

    expect(enrollment.deDeliveryMode).toBeNull();
  });
});
