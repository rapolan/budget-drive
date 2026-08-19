/**
 * Instructor Service-Area Service
 * The only write path to instructor_service_areas. An instructor with no
 * rows in this table serves ALL zips (Constraint B, see schedulingService's
 * findRankedAvailableSlots) - an empty result from getServiceAreas is the
 * normal "unconfigured" state, not an error.
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query, getClient } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { createLogger } from '../utils/logger';

const logger = createLogger('InstructorServiceAreaService');

const ZIP_FORMAT = /^\d{5}$/;

export const getServiceAreas = async (
  instructorId: string,
  tenantId: string
): Promise<string[]> => {
  const result = await query(
    `SELECT zip_code FROM instructor_service_areas
     WHERE instructor_id = $1 AND tenant_id = $2
     ORDER BY zip_code`,
    [instructorId, tenantId]
  );
  return result.rows.map((row) => row.zip_code);
};

/**
 * Batched read for findRankedAvailableSlots: one query for every candidate
 * instructor's configured zips. An instructor absent from the returned Map
 * has zero rows configured - the caller's own signal for "serves everywhere."
 */
export const getServiceAreasForInstructorsBatch = async (
  instructorIds: string[],
  tenantId: string
): Promise<Map<string, string[]>> => {
  const byInstructor = new Map<string, string[]>();
  if (instructorIds.length === 0) return byInstructor;

  const result = await query(
    `SELECT instructor_id, zip_code FROM instructor_service_areas
     WHERE tenant_id = $1 AND instructor_id = ANY($2::uuid[])`,
    [tenantId, instructorIds]
  );

  for (const row of result.rows) {
    const existing = byInstructor.get(row.instructor_id) || [];
    existing.push(row.zip_code);
    byInstructor.set(row.instructor_id, existing);
  }
  return byInstructor;
};

/**
 * Bulk replace-list: validates the whole incoming array before opening a
 * transaction (no partial save - one bad entry rejects the whole request),
 * then deletes every existing row for the instructor and inserts the
 * validated list in its place. Modeled on availabilityService.
 * setWeekAvailability's validate-then-transact shape.
 */
export const setServiceAreas = async (
  instructorId: string,
  tenantId: string,
  zipCodes: string[]
): Promise<string[]> => {
  logger.info('Setting instructor service areas', {
    tenantId,
    instructorId,
    count: zipCodes.length,
  });

  const instructorCheck = await query(
    'SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2',
    [instructorId, tenantId]
  );
  if (instructorCheck.rows.length === 0) {
    throw new AppError('Instructor not found or does not belong to this organization', 404);
  }

  if (!Array.isArray(zipCodes)) {
    throw new AppError('zipCodes must be an array', 400);
  }

  const seen = new Set<string>();
  for (const zip of zipCodes) {
    if (typeof zip !== 'string' || !ZIP_FORMAT.test(zip)) {
      throw new AppError(`"${zip}" is not a valid 5-digit ZIP code`, 400);
    }
    if (seen.has(zip)) {
      throw new AppError(`Duplicate ZIP code: ${zip}`, 400);
    }
    seen.add(zip);
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM instructor_service_areas WHERE instructor_id = $1 AND tenant_id = $2',
      [instructorId, tenantId]
    );

    if (zipCodes.length > 0) {
      const valuePlaceholders = zipCodes
        .map((_, i) => `($1, $2, $${i + 3})`)
        .join(', ');
      await client.query(
        `INSERT INTO instructor_service_areas (instructor_id, tenant_id, zip_code)
         VALUES ${valuePlaceholders}`,
        [instructorId, tenantId, ...zipCodes]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  logger.info('Successfully set instructor service areas', { tenantId, instructorId });

  return [...zipCodes].sort();
};
