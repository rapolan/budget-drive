import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const ENROLLMENT_ID = 'enrollment-1';
const STUDENT_ID = 'student-1';
const INSTRUCTOR_ID = 'instructor-1';

describe('certificateService.getAwaitingCertificateWorklist', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('includes a completed enrollment whose student was a minor AS OF the completion date, even if they are an adult today', async () => {
    const { getAwaitingCertificateWorklist } = await import('../services/certificateService');

    // Completed 3 years ago, when the student was 17 (a minor) - today
    // they'd be 20, but eligibility must be evaluated at completion time.
    const completedAt = new Date();
    completedAt.setFullYear(completedAt.getFullYear() - 3);
    const dob = new Date(completedAt);
    dob.setFullYear(dob.getFullYear() - 17);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(
        queryResult([
          {
            enrollment_id: ENROLLMENT_ID,
            student_id: STUDENT_ID,
            completed_at: completedAt.toISOString(),
            student_name: 'Jane Minor',
            date_of_birth: dob.toISOString(),
            last_lesson_instructor_id: INSTRUCTOR_ID,
            assigned_instructor_id: null,
          },
        ])
      ) // the worklist query
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID, full_name: 'Coach Lee' }])); // instructor name lookup

    const worklist = await getAwaitingCertificateWorklist(TENANT_ID);

    expect(worklist).toHaveLength(1);
    expect(worklist[0].enrollmentId).toBe(ENROLLMENT_ID);
    expect(worklist[0].suggestedInstructorId).toBe(INSTRUCTOR_ID);
    expect(worklist[0].suggestedInstructorName).toBe('Coach Lee');
  });

  it('excludes a completed enrollment whose student was already an adult AS OF the completion date', async () => {
    const { getAwaitingCertificateWorklist } = await import('../services/certificateService');

    const completedAt = new Date();
    const dob = new Date(completedAt);
    dob.setFullYear(dob.getFullYear() - 25); // adult at completion

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            enrollment_id: ENROLLMENT_ID,
            student_id: STUDENT_ID,
            completed_at: completedAt.toISOString(),
            student_name: 'John Adult',
            date_of_birth: dob.toISOString(),
            last_lesson_instructor_id: null,
            assigned_instructor_id: null,
          },
        ])
      );

    const worklist = await getAwaitingCertificateWorklist(TENANT_ID);
    expect(worklist).toHaveLength(0);
  });

  it('falls back to assigned_instructor_id when the enrollment has no completed lesson', async () => {
    const { getAwaitingCertificateWorklist } = await import('../services/certificateService');

    const completedAt = new Date();
    const dob = new Date(completedAt);
    dob.setFullYear(dob.getFullYear() - 16);

    mockQuery
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }]))
      .mockResolvedValueOnce(
        queryResult([
          {
            enrollment_id: ENROLLMENT_ID,
            student_id: STUDENT_ID,
            completed_at: completedAt.toISOString(),
            student_name: 'Jane Minor',
            date_of_birth: dob.toISOString(),
            last_lesson_instructor_id: null,
            assigned_instructor_id: INSTRUCTOR_ID,
          },
        ])
      )
      .mockResolvedValueOnce(queryResult([{ id: INSTRUCTOR_ID, full_name: 'Coach Lee' }]));

    const worklist = await getAwaitingCertificateWorklist(TENANT_ID);
    expect(worklist[0].suggestedInstructorId).toBe(INSTRUCTOR_ID);
  });
});

describe('certificateService.recordCertificate', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('records a certificate for a completed enrollment, no age check, defaulting the instructor from the most recent completed lesson', async () => {
    const { recordCertificate } = await import('../services/certificateService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID,
          program_type: 'driver_training', completed: true, assigned_instructor_id: null,
        }])
      ) // enrollment lookup
      .mockResolvedValueOnce(queryResult([])) // no existing certificate for this enrollment
      .mockResolvedValueOnce(queryResult([])) // serial not in use
      .mockResolvedValueOnce(queryResult([{ instructor_id: INSTRUCTOR_ID }])) // default instructor lookup
      .mockResolvedValueOnce(
        queryResult([{
          id: 'cert-1',
          tenant_id: TENANT_ID,
          enrollment_id: ENROLLMENT_ID,
          serial_number: 'CS7218767',
          form_type: 'DL_400D',
          issue_date: '2026-08-01',
          status: 'issued',
          issued_by_instructor_id: INSTRUCTOR_ID,
          recorded_by: 'user-1',
          completion_hash: 'abc123',
        }])
      ); // INSERT

    const certificate = await recordCertificate(
      ENROLLMENT_ID,
      TENANT_ID,
      { serialNumber: 'CS7218767', issueDate: '2026-08-01' },
      'user-1'
    );

    expect(certificate.serialNumber).toBe('CS7218767');
    expect(certificate.formType).toBe('DL_400D');
    expect(certificate.issuedByInstructorId).toBe(INSTRUCTOR_ID);
    expect(certificate.completionHash).toBe('abc123');

    const [insertSql, insertParams] = mockQuery.mock.calls[4];
    expect(insertSql).toMatch(/form_type/);
    expect(insertParams).toContain('DL_400D');
  });

  it('rejects recording a certificate for a driver_education enrollment (form-type mapping not resolvable yet)', async () => {
    const { recordCertificate } = await import('../services/certificateService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID,
          program_type: 'driver_education', completed: true, assigned_instructor_id: null,
        }])
      )
      .mockResolvedValueOnce(queryResult([])) // no existing certificate for this enrollment
      .mockResolvedValueOnce(queryResult([])) // serial not in use
      .mockResolvedValueOnce(queryResult([])); // default instructor lookup (no completed lesson)

    await expect(
      recordCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' }, 'user-1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects recording a certificate for a not-yet-completed enrollment', async () => {
    const { recordCertificate } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: ENROLLMENT_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, completed: false }])
    );

    await expect(
      recordCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' }, 'user-1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects recording a second certificate for the same enrollment (409)', async () => {
    const { recordCertificate } = await import('../services/certificateService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: ENROLLMENT_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, completed: true }])
      )
      .mockResolvedValueOnce(queryResult([{ id: 'existing-cert' }])); // already has one

    await expect(
      recordCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' }, 'user-1')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects a serial number already recorded for this tenant', async () => {
    const { recordCertificate } = await import('../services/certificateService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{ id: ENROLLMENT_ID, tenant_id: TENANT_ID, student_id: STUDENT_ID, completed: true }])
      )
      .mockResolvedValueOnce(queryResult([])) // no existing cert for this enrollment
      .mockResolvedValueOnce(queryResult([{ id: 'other-cert' }])); // serial already used

    await expect(
      recordCertificate(ENROLLMENT_ID, TENANT_ID, { serialNumber: 'CS1', issueDate: '2026-08-01' }, 'user-1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('certificateService.recordVoid', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('records a void certificate with no enrollment, using the NOT_APPLICABLE form-type sentinel', async () => {
    const { recordVoid } = await import('../services/certificateService');

    mockQuery
      .mockResolvedValueOnce(queryResult([])) // serial not in use
      .mockResolvedValueOnce(
        queryResult([{
          id: 'cert-void-1',
          tenant_id: TENANT_ID,
          enrollment_id: null,
          serial_number: 'CS9999999',
          form_type: 'NOT_APPLICABLE',
          issue_date: '2026-08-01',
          status: 'void',
          void_reason: 'Damaged in storage',
          issued_by_instructor_id: null,
          recorded_by: 'user-1',
        }])
      );

    const certificate = await recordVoid(
      TENANT_ID,
      { serialNumber: 'CS9999999', voidReason: 'Damaged in storage', issueDate: '2026-08-01' },
      'user-1'
    );

    expect(certificate.status).toBe('void');
    expect(certificate.enrollmentId).toBeNull();
    expect(certificate.voidReason).toBe('Damaged in storage');
    expect(certificate.formType).toBe('NOT_APPLICABLE');

    const [insertSql, insertParams] = mockQuery.mock.calls[1];
    expect(insertSql).toMatch(/form_type/);
    expect(insertParams).toContain('NOT_APPLICABLE');
  });

  it('rejects a duplicate serial number', async () => {
    const { recordVoid } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(queryResult([{ id: 'existing' }]));

    await expect(
      recordVoid(TENANT_ID, { serialNumber: 'CS1', voidReason: 'Lost', issueDate: '2026-08-01' }, 'user-1')
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('certificateService.getCertificateDetail', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('assembles school, student, instructor, and dates for an issued certificate, resolved in tenant time', async () => {
    const { getCertificateDetail } = await import('../services/certificateService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: 'cert-1',
          serial_number: 'CS1000001',
          form_type: 'DL_400D',
          status: 'issued',
          issue_date: '2026-08-20',
          student_name: 'Ruby Sandoval',
          date_of_birth: '2009-05-10',
          completed_at: '2026-08-19T00:00:00.000Z',
          instructor_name: 'Coach Lee',
          instructor_license_number: 'INS-555',
        }])
      ) // certificate detail join
      .mockResolvedValueOnce(
        queryResult([{
          tenant_id: TENANT_ID,
          timezone: 'America/Los_Angeles',
          business_name: 'Budget Driving School',
          license_number: 'E1234',
          address_line1: '123 Main St',
          address_line2: null,
          city: 'Sacramento',
          state: 'CA',
          zip_code: '95814',
          support_phone: '916-555-0100',
        }])
      ); // getTenantSettings

    const detail = await getCertificateDetail('cert-1', TENANT_ID);

    expect(detail.serialNumber).toBe('CS1000001');
    expect(detail.formType).toBe('DL_400D');
    expect(detail.school.businessName).toBe('Budget Driving School');
    expect(detail.school.licenseNumber).toBe('E1234');
    expect(detail.student.fullName).toBe('Ruby Sandoval');
    expect(detail.student.dateOfBirthLocal).toBe('May 10, 2009');
    expect(detail.completionDateLocal).toBe('August 19, 2026');
    expect(detail.issueDateLocal).toBe('August 20, 2026');
    expect(detail.instructor).toEqual({ fullName: 'Coach Lee', licenseNumber: 'INS-555' });
  });

  it('rejects viewing a void certificate - it was never issued to a student', async () => {
    const { getCertificateDetail } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: 'cert-void-1',
        serial_number: 'CS9999999',
        form_type: 'NOT_APPLICABLE',
        status: 'void',
        issue_date: '2026-08-20',
        student_name: null,
        date_of_birth: null,
        completed_at: null,
        instructor_name: null,
        instructor_license_number: null,
      }])
    );

    await expect(getCertificateDetail('cert-void-1', TENANT_ID)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects an unknown certificate id (404)', async () => {
    const { getCertificateDetail } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(getCertificateDetail('missing', TENANT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('certificateService.getIssuedVoidCounts', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns issued and void counts from grouped rows', async () => {
    const { getIssuedVoidCounts } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        { status: 'issued', count: '5' },
        { status: 'void', count: '2' },
      ])
    );

    const counts = await getIssuedVoidCounts(TENANT_ID);
    expect(counts).toEqual({ issued: 5, void: 2 });
  });

  it('defaults to zero for a status with no rows', async () => {
    const { getIssuedVoidCounts } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(queryResult([{ status: 'issued', count: '3' }]));

    const counts = await getIssuedVoidCounts(TENANT_ID);
    expect(counts).toEqual({ issued: 3, void: 0 });
  });
});

describe('certificateService.getIssuedLog', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('returns an issued record with student and instructor names joined in', async () => {
    const { getIssuedLog } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'cert-1',
          serial_number: 'CS0000001',
          status: 'issued',
          issue_date: '2026-08-01',
          void_reason: null,
          student_id: STUDENT_ID,
          student_name: 'Leo Whitfield',
          instructor_id: INSTRUCTOR_ID,
          instructor_name: 'Devon Ashby',
        },
      ])
    );

    const log = await getIssuedLog(TENANT_ID);

    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      id: 'cert-1',
      serialNumber: 'CS0000001',
      status: 'issued',
      studentName: 'Leo Whitfield',
      instructorName: 'Devon Ashby',
    });
  });

  // A void record has no enrollment_id and no issued_by_instructor_id by
  // construction (recordVoid inserts both NULL) - the LEFT JOINs correctly
  // resolve to null student/instructor fields, never a join failure that
  // drops the row.
  it('returns a void record with null student and instructor fields', async () => {
    const { getIssuedLog } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(
      queryResult([
        {
          id: 'cert-2',
          serial_number: 'CS0000099',
          status: 'void',
          issue_date: '2026-08-29',
          void_reason: 'Damaged during printing',
          student_id: null,
          student_name: null,
          instructor_id: null,
          instructor_name: null,
        },
      ])
    );

    const log = await getIssuedLog(TENANT_ID);

    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      id: 'cert-2',
      status: 'void',
      voidReason: 'Damaged during printing',
      studentId: null,
      studentName: null,
      instructorId: null,
      instructorName: null,
    });
  });

  it('returns an empty array when nothing has been recorded', async () => {
    const { getIssuedLog } = await import('../services/certificateService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    const log = await getIssuedLog(TENANT_ID);
    expect(log).toEqual([]);
  });
});
