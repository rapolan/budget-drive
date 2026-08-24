import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
const TENANT_ID = 'tenant-abc-123';
const LESSON_ID = '88888888-8888-8888-8888-888888888888';
const STUDENT_ID = '44444444-4444-4444-4444-444444444444';
const ENROLLMENT_ID = '77777777-7777-7777-7777-777777777777';

function signToken(userId: string, role = 'staff') {
  return jwt.sign(
    { userId, tenantId: TENANT_ID, email: `${userId}@example.com`, role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

// Regression coverage: the Lessons page's History column (AuditColumn)
// reads lesson.createdByName/updatedByName, but getAllLessons/
// getLessonById never resolved those from created_by/updated_by (unlike
// studentService's identical fix - see studentProgressAttachment.test.ts's
// analogous tests) - the column always fell back to "Unknown", seeded or
// not, because the field was simply never present on the response.
describe('Lessons - History column audit fields', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('resolves createdByName/updatedByName from a users join in the list response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: LESSON_ID,
        tenant_id: TENANT_ID,
        enrollment_id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        status: 'completed',
        created_by_name: 'System Admin',
        updated_by_name: 'System Admin',
      }])
    ); // lesson rows

    const res = await request(app)
      .get('/api/v1/lessons')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].createdByName).toBe('System Admin');
    expect(res.body.data[0].updatedByName).toBe('System Admin');

    const lessonsCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM lessons') && sql.includes('LEFT JOIN users')
    );
    expect(lessonsCall).toBeDefined();
    const [lessonsSql] = lessonsCall!;
    expect(lessonsSql).toMatch(/LEFT JOIN users/i);
    expect(lessonsSql).toMatch(/created_by_name/i);
    expect(lessonsSql).toMatch(/updated_by_name/i);
  });

  it('resolves createdByName/updatedByName from a users join in the detail response', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: LESSON_ID,
        tenant_id: TENANT_ID,
        enrollment_id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        status: 'completed',
        created_by_name: 'System Admin',
        updated_by_name: 'System Admin',
      }])
    ); // lesson row

    const res = await request(app)
      .get(`/api/v1/lessons/${LESSON_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.createdByName).toBe('System Admin');
    expect(res.body.data.updatedByName).toBe('System Admin');

    const lessonCall = mockQuery.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('FROM lessons')
    );
    expect(lessonCall).toBeDefined();
    const [lessonSql] = lessonCall!;
    expect(lessonSql).toMatch(/LEFT JOIN users/i);
    expect(lessonSql).toMatch(/created_by_name/i);
    expect(lessonSql).toMatch(/updated_by_name/i);
  });

  it('createdByName/updatedByName are null (not "Unknown" server-side) when the audit user has no name to resolve', async () => {
    const { default: app } = await import('../app');
    const token = signToken('staff-1');

    mockQuery.mockResolvedValueOnce(queryResult([{ count: '1' }])); // count
    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: LESSON_ID,
        tenant_id: TENANT_ID,
        enrollment_id: ENROLLMENT_ID,
        student_id: STUDENT_ID,
        status: 'scheduled',
        created_by_name: null,
        updated_by_name: null,
      }])
    ); // lesson rows

    const res = await request(app)
      .get('/api/v1/lessons')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data[0].createdByName).toBeNull();
    expect(res.body.data[0].updatedByName).toBeNull();
  });
});
