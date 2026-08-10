/**
 * Student-Guardian Link Service
 * The ONLY write path to student_guardians. Constraint B: guardians are
 * linked to students only by explicit choice - every write here requires
 * both a studentId and a guardianId supplied by the caller. Nothing in
 * this file (or guardianService's matching functions) ever infers a link
 * from a name/email/phone match.
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query, getClient } from '../config/database';
import { Guardian, Student } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import { calculateAge } from './studentProgressService';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone } from '../utils/tenantTime';

const logger = createLogger('StudentGuardianService');

export interface StudentGuardianLink {
  id: string;
  tenantId: string;
  studentId: string;
  guardianId: string;
  relationship: 'mother' | 'father' | 'grandparent' | 'legal_guardian' | 'other' | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Promote a guardian to primary for a student, demoting whichever guardian
 * (if any) currently holds that spot, in a single transaction - the only
 * real BEGIN/COMMIT in this codebase, needed because the partial unique
 * index on (student_id) WHERE is_primary requires the old primary to be
 * cleared before the new one can be set.
 */
export const setPrimaryGuardian = async (
  studentId: string,
  guardianId: string,
  tenantId: string
): Promise<void> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE student_guardians
       SET is_primary = false, updated_at = NOW()
       WHERE student_id = $1 AND tenant_id = $2 AND is_primary = true`,
      [studentId, tenantId]
    );
    const result = await client.query(
      `UPDATE student_guardians
       SET is_primary = true, updated_at = NOW()
       WHERE student_id = $1 AND guardian_id = $2 AND tenant_id = $3
       RETURNING id`,
      [studentId, guardianId, tenantId]
    );
    if (result.rows.length === 0) {
      throw new AppError('Guardian link not found for this student', 404);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Link a guardian to a student. Requires both IDs explicitly - this is
 * the only entry point that creates a link (Constraint B).
 */
export const linkGuardianToStudent = async (
  studentId: string,
  guardianId: string,
  tenantId: string,
  data: { relationship?: string; isPrimary?: boolean },
  _userId?: string
): Promise<StudentGuardianLink> => {
  logger.info('Linking guardian to student', { tenantId, studentId, guardianId });

  const studentCheck = await query(
    'SELECT id FROM students WHERE id = $1 AND tenant_id = $2',
    [studentId, tenantId]
  );
  if (studentCheck.rows.length === 0) {
    throw new AppError('Student not found', 404);
  }

  const guardianCheck = await query(
    'SELECT id FROM guardians WHERE id = $1 AND tenant_id = $2',
    [guardianId, tenantId]
  );
  if (guardianCheck.rows.length === 0) {
    throw new AppError('Guardian not found', 404);
  }

  const result = await query(
    `INSERT INTO student_guardians (tenant_id, student_id, guardian_id, relationship, is_primary)
     VALUES ($1, $2, $3, $4, false)
     RETURNING *`,
    [tenantId, studentId, guardianId, data.relationship || null]
  );

  let link = keysToCamel(result.rows[0]) as StudentGuardianLink;

  if (data.isPrimary) {
    await setPrimaryGuardian(studentId, guardianId, tenantId);
    const refreshed = await query(
      'SELECT * FROM student_guardians WHERE id = $1',
      [link.id]
    );
    link = keysToCamel(refreshed.rows[0]) as StudentGuardianLink;
  }

  logger.info('Successfully linked guardian to student', { tenantId, studentId, guardianId });
  return link;
};

/**
 * Unlink a guardian from a student. Does not delete the guardian record
 * itself.
 *
 * Guarded: a minor (age < 18, or date_of_birth unknown - treated as a minor
 * for safety, same convention as needsGuardian) may not have their only
 * linked guardian removed. This mirrors the frontend's disabled-unlink-
 * button UX so the rule is enforced here too, not just implied by the UI -
 * a direct API call gets a clean rejection instead of silently leaving a
 * minor guardian-less.
 */
export const unlinkGuardianFromStudent = async (
  studentId: string,
  guardianId: string,
  tenantId: string
): Promise<void> => {
  const studentResult = await query(
    'SELECT date_of_birth FROM students WHERE id = $1 AND tenant_id = $2',
    [studentId, tenantId]
  );
  if (studentResult.rows.length === 0) {
    throw new AppError('Student not found', 404);
  }

  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);
  const age = calculateAge(studentResult.rows[0].date_of_birth, timezone);
  const isMinor = age === null || age < 18;

  if (isMinor) {
    const guardianCount = await countGuardiansForStudent(studentId, tenantId);
    if (guardianCount <= 1) {
      throw new AppError(
        'Cannot unlink this student\'s only guardian while they are a minor - link another guardian first',
        400
      );
    }
  }

  const result = await query(
    `DELETE FROM student_guardians
     WHERE student_id = $1 AND guardian_id = $2 AND tenant_id = $3
     RETURNING id`,
    [studentId, guardianId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Guardian link not found for this student', 404);
  }
};

/**
 * Update the relationship on an existing student-guardian link. Relationship
 * is a property of the LINK, not the guardian - this is the only place it
 * changes after link creation.
 */
export const updateGuardianRelationship = async (
  studentId: string,
  guardianId: string,
  tenantId: string,
  relationship: string | null
): Promise<StudentGuardianLink> => {
  const result = await query(
    `UPDATE student_guardians
     SET relationship = $1, updated_at = NOW()
     WHERE student_id = $2 AND guardian_id = $3 AND tenant_id = $4
     RETURNING *`,
    [relationship, studentId, guardianId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Guardian link not found for this student', 404);
  }

  return keysToCamel(result.rows[0]) as StudentGuardianLink;
};

/**
 * Get all guardians linked to a student, with relationship/primary flag.
 */
export const getGuardiansForStudent = async (
  studentId: string,
  tenantId: string
): Promise<(Guardian & { relationship: string | null; isPrimary: boolean })[]> => {
  const result = await query(
    `SELECT g.*, sg.relationship, sg.is_primary
     FROM student_guardians sg
     JOIN guardians g ON g.id = sg.guardian_id
     WHERE sg.student_id = $1 AND sg.tenant_id = $2
     ORDER BY sg.is_primary DESC, g.last_name, g.first_name`,
    [studentId, tenantId]
  );

  return result.rows.map(keysToCamel);
};

/**
 * Get all students linked to a guardian, with relationship/primary flag.
 * Used by the guardian matching service's candidate disambiguation.
 */
export const getStudentsForGuardian = async (
  guardianId: string,
  tenantId: string
): Promise<(Student & { relationship: string | null; isPrimary: boolean })[]> => {
  const result = await query(
    `SELECT s.*, sg.relationship, sg.is_primary
     FROM student_guardians sg
     JOIN students s ON s.id = sg.student_id
     WHERE sg.guardian_id = $1 AND sg.tenant_id = $2
     ORDER BY s.full_name`,
    [guardianId, tenantId]
  );

  return result.rows.map(keysToCamel);
};

/**
 * Count guardians linked to a student. Used by the minor-requires-guardian
 * check.
 */
export const countGuardiansForStudent = async (
  studentId: string,
  tenantId: string
): Promise<number> => {
  const result = await query(
    'SELECT COUNT(*) FROM student_guardians WHERE student_id = $1 AND tenant_id = $2',
    [studentId, tenantId]
  );
  return parseInt(result.rows[0].count, 10);
};

/**
 * Batched guardian-count lookup for a set of students in one query (not
 * N+1) - used by studentService's read paths to attach needsGuardian
 * without a per-student round trip. Returns a Map of studentId -> count;
 * students with zero links simply aren't present as keys.
 */
export const countGuardiansForStudentsBatch = async (
  studentIds: string[],
  tenantId: string
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  if (studentIds.length === 0) return counts;

  const result = await query(
    `SELECT student_id, COUNT(*) AS count
     FROM student_guardians
     WHERE tenant_id = $1 AND student_id = ANY($2::uuid[])
     GROUP BY student_id`,
    [tenantId, studentIds]
  );

  for (const row of result.rows) {
    counts.set(row.student_id, parseInt(row.count, 10));
  }
  return counts;
};
