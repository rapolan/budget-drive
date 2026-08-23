import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc-123';
const STUDENT_ID = 'student-1';

describe('students.pickup_address_* columns', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('createStudent inserts the pickup address columns when the toggle is on', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' }])) // getTenantSettings (age check)
      // no email in this payload - createStudent's duplicate-email check
      // (`if (data.email)`) is skipped entirely, no mock consumed for it
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, full_name: 'Test Student', date_of_birth: '2010-01-01' }])
      ) // INSERT INTO students
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }])) // createEnrollment's student-existence check
      .mockResolvedValueOnce(queryResult([])) // createEnrollment's active-enrollment pre-check
      .mockResolvedValueOnce(queryResult([])) // createEnrollment's getTenantSettings
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', license_type: 'car', status: 'active' }])
      ) // INSERT INTO enrollments
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: '2010-01-01' }])) // getStudentById re-fetch: student row
      .mockResolvedValueOnce(queryResult([])) // tenant settings
      .mockResolvedValueOnce(queryResult([])) // guardian counts
      .mockResolvedValueOnce(queryResult([])) // guardians for student
      .mockResolvedValueOnce(queryResult([])) // outstanding fees
      .mockResolvedValueOnce(queryResult([])); // enrollments for student

    await studentService.createStudent(
      TENANT_ID,
      {
        fullName: 'Test Student',
        dateOfBirth: new Date('2010-01-01'),
        phone: '555-0100',
        addressLine1: '2 Home St',
        pickupAddressDifferentFromHome: true,
        pickupAddressLine1: '1 Pickup St',
        pickupAddressLine2: 'Suite 2',
        pickupCity: 'Pickup City',
        pickupState: 'CA',
        pickupZipCode: '90001',
      },
      'user-1'
    );

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO students')
    );
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall!;
    expect(sql).toContain('pickup_address_different_from_home');
    expect(sql).toContain('pickup_address_line1');
    expect(sql).toContain('pickup_zip_code');
    expect(params).toContain(true);
    expect(params).toContain('1 Pickup St');
    expect(params).toContain('Pickup City');
    expect(params).toContain('90001');
  });

  it('createStudent defaults pickup_address_different_from_home to false when omitted', async () => {
    const studentService = await import('../services/studentService');

    mockQuery
      .mockResolvedValueOnce(queryResult([{ tenant_id: TENANT_ID, timezone: 'America/Los_Angeles' }]))
      // no email in this payload - duplicate-email check skipped
      .mockResolvedValueOnce(
        queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, full_name: 'Test Student', date_of_birth: '2010-01-01' }])
      )
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(
        queryResult([{ id: 'enrollment-1', student_id: STUDENT_ID, tenant_id: TENANT_ID, program_type: 'driver_training', license_type: 'car', status: 'active' }])
      )
      .mockResolvedValueOnce(queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, date_of_birth: '2010-01-01' }]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]))
      .mockResolvedValueOnce(queryResult([]));

    await studentService.createStudent(
      TENANT_ID,
      { fullName: 'Test Student', dateOfBirth: new Date('2010-01-01'), phone: '555-0100' },
      'user-1'
    );

    const insertCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('INSERT INTO students')
    );
    const [, params] = insertCall!;
    expect(params).toContain(false);
  });

  it('updateStudent includes pickup_address_line1 in the SET clause only when provided', async () => {
    const studentService = await import('../services/studentService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{ id: STUDENT_ID, tenant_id: TENANT_ID, pickup_address_line1: '1 Pickup St' }])
    ); // the UPDATE ... RETURNING *

    await studentService.updateStudent(STUDENT_ID, TENANT_ID, {
      pickupAddressDifferentFromHome: true,
      pickupAddressLine1: '1 Pickup St',
    });

    const updateCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('UPDATE students')
    );
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall!;
    expect(sql).toContain('pickup_address_different_from_home');
    expect(sql).toContain('pickup_address_line1');
    expect(params).toContain('1 Pickup St');
  });
});
