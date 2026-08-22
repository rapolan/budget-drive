import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockQuery, resetMockQuery, queryResult } from './mocks/database';

vi.mock('../config/database', () => ({ query: mockQuery }));

const TENANT_ID = 'tenant-abc';
const ENROLLMENT_ID = 'enrollment-1';

describe('transcriptService.generateWithdrawalTranscript', () => {
  beforeEach(() => {
    resetMockQuery();
  });

  it('generates a transcript for a withdrawn enrollment, including the withdrawal date and reason', async () => {
    const { generateWithdrawalTranscript } = await import('../services/transcriptService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'withdrawn',
          completed: false,
          enrollment_date: '2026-01-01',
          withdrawn_at: '2026-06-15T10:00:00.000Z',
          withdrawn_reason: 'Moved out of state',
          student_name: 'Jane Doe',
          date_of_birth: '2010-01-01',
        }])
      ) // enrollment + student join
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }])) // getTenantSettings
      .mockResolvedValueOnce(
        queryResult([
          { date: '2026-02-01', start_time: '09:00:00', end_time: '11:00:00', duration: 120, status: 'completed', instructor_name: 'Coach Lee' },
          { date: '2026-02-08', start_time: '09:00:00', end_time: '11:00:00', duration: 120, status: 'cancelled', instructor_name: 'Coach Lee' },
        ])
      ); // lessons

    const transcript = await generateWithdrawalTranscript(ENROLLMENT_ID, TENANT_ID);

    expect(transcript.content).toContain('Jane Doe');
    expect(transcript.content).toContain('Withdrawn:');
    expect(transcript.content).toContain('Withdrawal reason: Moved out of state');
    expect(transcript.content).toContain('2026-02-01');
    expect(transcript.content).toContain('completed');
    expect(transcript.content).toContain('cancelled');
    expect(transcript.content).toContain('Total completed hours: 2.00');
    expect(transcript.filename).toMatch(/^transcript-Jane-Doe-/);
  });

  it('generates a transcript for a still-active (not withdrawn) enrollment', async () => {
    const { generateWithdrawalTranscript } = await import('../services/transcriptService');

    mockQuery
      .mockResolvedValueOnce(
        queryResult([{
          id: ENROLLMENT_ID,
          tenant_id: TENANT_ID,
          program_type: 'driver_training',
          status: 'active',
          completed: false,
          enrollment_date: '2026-01-01',
          withdrawn_at: null,
          withdrawn_reason: null,
          student_name: 'John Smith',
          date_of_birth: '2009-01-01',
        }])
      )
      .mockResolvedValueOnce(queryResult([{ timezone: 'America/Los_Angeles' }]))
      .mockResolvedValueOnce(queryResult([]));

    const transcript = await generateWithdrawalTranscript(ENROLLMENT_ID, TENANT_ID);

    expect(transcript.content).toContain('Status: active');
    expect(transcript.content).not.toContain('Withdrawal reason');
    expect(transcript.content).toContain('No lessons recorded');
  });

  it('rejects a completed enrollment (400) - see its certificate instead', async () => {
    const { generateWithdrawalTranscript } = await import('../services/transcriptService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_training',
        status: 'completed',
        completed: true,
        enrollment_date: '2026-01-01',
        student_name: 'Jane Doe',
        date_of_birth: '2010-01-01',
      }])
    );

    await expect(generateWithdrawalTranscript(ENROLLMENT_ID, TENANT_ID)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('rejects a driver_education enrollment (400) - no lesson tracking to transcript', async () => {
    const { generateWithdrawalTranscript } = await import('../services/transcriptService');

    mockQuery.mockResolvedValueOnce(
      queryResult([{
        id: ENROLLMENT_ID,
        tenant_id: TENANT_ID,
        program_type: 'driver_education',
        status: 'active',
        completed: false,
        enrollment_date: '2026-01-01',
        student_name: 'Jane Doe',
        date_of_birth: '2010-01-01',
      }])
    );

    await expect(generateWithdrawalTranscript(ENROLLMENT_ID, TENANT_ID)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('404s for an enrollment that does not exist in this tenant', async () => {
    const { generateWithdrawalTranscript } = await import('../services/transcriptService');

    mockQuery.mockResolvedValueOnce(queryResult([]));

    await expect(generateWithdrawalTranscript(ENROLLMENT_ID, TENANT_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
