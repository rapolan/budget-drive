/**
 * Certificate Service
 *
 * Certificate issuance tracking (13 CCR §340.27). Certificates attach to an
 * ENROLLMENT, not a person - a student can hold a driver_education and a
 * driver_training certificate on two different DMV form types.
 *
 * Real workflow, not an idealized one: instructors hold physical
 * certificates and hand one to a student at their final lesson, writing
 * the serial on the student's paper record sheet. Sheets come back to the
 * admin, who enters the serial against the student afterward - this
 * service is a reconciliation system of record, not a live-issuance
 * system. Recording is gated by whether a certificate was ISSUED, never by
 * age; age only decides what surfaces on the awaiting-certificate worklist.
 */

import { query } from '../config/database';
import { Certificate, Enrollment, ProgramType } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone } from '../utils/tenantTime';
import { calculateAge } from './studentProgressService';
import crypto from 'crypto';

const logger = createLogger('CertificateService');

// DMV form type a certificate is recorded on, derived from the enrollment's
// program_type. driver_education splits into classroom (DL_400B) vs online
// (DL_400C), a distinction program_type alone can't resolve yet - left null
// until Phase 3 adds that signal, rather than guessing.
const FORM_TYPE_BY_PROGRAM_TYPE: Record<ProgramType, string | null> = {
  driver_training: 'DL_400D',
  driver_education: null,
};

function resolveFormType(programType: ProgramType): string {
  const formType = FORM_TYPE_BY_PROGRAM_TYPE[programType];
  if (!formType) {
    throw new AppError(`No DMV form type mapping for program type "${programType}" yet`, 400);
  }
  return formType;
}

// A void certificate was never issued to a student - it has no enrollment
// and no program type, so no real DMV form applies. This sentinel keeps
// form_type NOT NULL (no silent default) while being honest that a void
// carries no form-type opinion of its own.
const VOID_FORM_TYPE = 'NOT_APPLICABLE';

export interface AwaitingCertificateEntry {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  completedAt: Date;
  suggestedInstructorId: string | null;
  suggestedInstructorName: string | null;
}

/**
 * Completed driver_training enrollments with no certificate row yet,
 * filtered to students who were MINORS as of their enrollment's
 * completion date (not today's date - a student who has since turned 18
 * must still surface if they were a minor when they completed). This is a
 * pure surfacing rule, not a gate - recordCertificate below is callable on
 * any completed enrollment regardless of age (see Item 3).
 *
 * Sorted oldest-completed-first: the longest-waiting paper sheets surface
 * first, matching the admin's actual "work down the stack" workflow.
 */
export const getAwaitingCertificateWorklist = async (
  tenantId: string
): Promise<AwaitingCertificateEntry[]> => {
  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);

  const result = await query(
    `SELECT
       e.id AS enrollment_id,
       e.student_id,
       e.completed_at,
       s.full_name AS student_name,
       s.date_of_birth,
       (SELECT l.instructor_id FROM lessons l
        WHERE l.enrollment_id = e.id AND l.status = 'completed'
        ORDER BY l.date DESC, l.start_time DESC
        LIMIT 1) AS last_lesson_instructor_id,
       e.assigned_instructor_id
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN certificates c ON c.enrollment_id = e.id
     WHERE e.tenant_id = $1
       AND e.program_type = 'driver_training'
       AND e.completed = true
       AND c.id IS NULL
     ORDER BY e.completed_at ASC`,
    [tenantId]
  );

  const minorRows = result.rows.filter((row: any) => {
    const age = calculateAge(row.date_of_birth, timezone, new Date(row.completed_at));
    return age === null || age < 18;
  });

  const instructorIds = Array.from(
    new Set(
      minorRows
        .map((row: any) => row.last_lesson_instructor_id || row.assigned_instructor_id)
        .filter((id: string | null) => id !== null)
    )
  ) as string[];

  const instructorNames = new Map<string, string>();
  if (instructorIds.length > 0) {
    const instructorResult = await query(
      `SELECT id, full_name FROM instructors WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [tenantId, instructorIds]
    );
    for (const row of instructorResult.rows) {
      instructorNames.set(row.id, row.full_name);
    }
  }

  return minorRows.map((row: any) => {
    const suggestedInstructorId = row.last_lesson_instructor_id || row.assigned_instructor_id || null;
    return {
      enrollmentId: row.enrollment_id,
      studentId: row.student_id,
      studentName: row.student_name,
      completedAt: row.completed_at,
      suggestedInstructorId,
      suggestedInstructorName: suggestedInstructorId ? instructorNames.get(suggestedInstructorId) ?? null : null,
    };
  });
};

export interface CertificateCounts {
  issued: number;
  void: number;
}

export const getIssuedVoidCounts = async (tenantId: string): Promise<CertificateCounts> => {
  const result = await query(
    `SELECT status, COUNT(*) AS count FROM certificates WHERE tenant_id = $1 GROUP BY status`,
    [tenantId]
  );
  const counts: CertificateCounts = { issued: 0, void: 0 };
  for (const row of result.rows) {
    if (row.status === 'issued') counts.issued = parseInt(row.count, 10);
    if (row.status === 'void') counts.void = parseInt(row.count, 10);
  }
  return counts;
};

export interface CertificateLogEntry {
  id: string;
  serialNumber: string;
  status: 'issued' | 'void';
  issueDate: Date;
  voidReason: string | null;
  studentId: string | null;
  studentName: string | null;
  instructorId: string | null;
  instructorName: string | null;
}

/**
 * Every certificate record (issued and void), newest-issue-date-first, for
 * the audit/browse log (item 2). A void record has no enrollment and no
 * issuing instructor by construction (recordVoid inserts both NULL) - it
 * always carries studentId/studentName/instructorId/instructorName as null,
 * which the frontend uses to decide void behavior under an instructor
 * filter (shown under "All", hidden once a specific instructor is picked -
 * a void isn't attributable to one).
 */
export const getIssuedLog = async (tenantId: string): Promise<CertificateLogEntry[]> => {
  const result = await query(
    `SELECT
       c.id, c.serial_number, c.status, c.issue_date, c.void_reason,
       s.id AS student_id, s.full_name AS student_name,
       i.id AS instructor_id, i.full_name AS instructor_name
     FROM certificates c
     LEFT JOIN enrollments e ON e.id = c.enrollment_id
     LEFT JOIN students s ON s.id = e.student_id
     LEFT JOIN instructors i ON i.id = c.issued_by_instructor_id
     WHERE c.tenant_id = $1
     ORDER BY c.issue_date DESC, c.created_at DESC`,
    [tenantId]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    serialNumber: row.serial_number,
    status: row.status,
    issueDate: row.issue_date,
    voidReason: row.void_reason,
    studentId: row.student_id,
    studentName: row.student_name,
    instructorId: row.instructor_id,
    instructorName: row.instructor_name,
  }));
};

export interface CertificateDetail {
  id: string;
  serialNumber: string;
  formType: string;
  status: 'issued' | 'void';
  issueDateLocal: string;
  school: {
    businessName: string;
    licenseNumber: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
  };
  student: {
    fullName: string;
    dateOfBirthLocal: string | null;
  };
  completionDateLocal: string | null;
  instructor: {
    fullName: string;
    licenseNumber: string | null;
  } | null;
}

/**
 * Formats a `date` or `timestamp without time zone` column value (already
 * the tenant's own wall-clock reading by construction - see tenantTime.ts's
 * "Storage is unchanged" note) as a human-readable date, e.g. "August 20,
 * 2026". Reads UTC getters directly (matching calculateAge's proven
 * pattern for date_of_birth) rather than formatInTenantZone, which is for
 * converting a genuine UTC instant into a target zone - applying it to a
 * value that's already the tenant's wall-clock time would double-convert
 * and shift the date by up to a day.
 */
function formatWallClockDate(value: Date | string): string {
  const d = new Date(value);
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * The full assembled content of a single ISSUED certificate, for the
 * digital certificate view (Phase 2 of the compliance-records arc). A void
 * certificate was never handed to a student - it has no enrollment, no
 * completion, no form_type worth rendering (see VOID_FORM_TYPE) - so it has
 * no document to assemble; callers must not offer a "view" action for one,
 * and this throws if asked to render one anyway rather than returning a
 * document with blank/nonsensical fields.
 *
 * All dates resolved server-side in the tenant's timezone - the frontend
 * only ever receives ready-to-render strings, per the tenant-timezone
 * authority rule (backend/src/utils/tenantTime.ts).
 */
export const getCertificateDetail = async (
  certificateId: string,
  tenantId: string
): Promise<CertificateDetail> => {
  const result = await query(
    `SELECT
       c.id, c.serial_number, c.form_type, c.status, c.issue_date,
       s.full_name AS student_name, s.date_of_birth,
       e.completed_at,
       i.full_name AS instructor_name, i.instructor_license_number
     FROM certificates c
     LEFT JOIN enrollments e ON e.id = c.enrollment_id
     LEFT JOIN students s ON s.id = e.student_id
     LEFT JOIN instructors i ON i.id = c.issued_by_instructor_id
     WHERE c.id = $1 AND c.tenant_id = $2`,
    [certificateId, tenantId]
  );

  if (result.rows.length === 0) {
    throw new AppError('Certificate not found', 404);
  }

  const row = result.rows[0];
  if (row.status !== 'issued') {
    throw new AppError('A void certificate has no document to view', 400);
  }

  const tenantSettings = await getTenantSettings(tenantId);

  return {
    id: row.id,
    serialNumber: row.serial_number,
    formType: row.form_type,
    status: row.status,
    issueDateLocal: formatWallClockDate(row.issue_date),
    school: {
      businessName: tenantSettings?.businessName ?? '',
      licenseNumber: tenantSettings?.licenseNumber ?? null,
      addressLine1: tenantSettings?.addressLine1 ?? null,
      addressLine2: tenantSettings?.addressLine2 ?? null,
      city: tenantSettings?.city ?? null,
      state: tenantSettings?.state ?? null,
      zipCode: tenantSettings?.zipCode ?? null,
      phone: tenantSettings?.supportPhone ?? null,
    },
    student: {
      fullName: row.student_name,
      dateOfBirthLocal: row.date_of_birth ? formatWallClockDate(row.date_of_birth) : null,
    },
    completionDateLocal: row.completed_at ? formatWallClockDate(row.completed_at) : null,
    instructor: row.instructor_name
      ? { fullName: row.instructor_name, licenseNumber: row.instructor_license_number ?? null }
      : null,
  };
};

/**
 * Resolve a sensible default issuing instructor for an enrollment being
 * recorded - the enrollment's own most recent COMPLETED lesson's
 * instructor (enrollment-scoped, not person-scoped: a person can have
 * multiple enrollments with different instructors), falling back to
 * assigned_instructor_id when no completed lesson exists (e.g.
 * driver_education, which has no lesson tracking). Never authoritative -
 * always just a pre-fill the admin can override from the paper sheet.
 */
async function resolveDefaultIssuingInstructor(
  enrollment: Enrollment,
  tenantId: string
): Promise<string | null> {
  const lessonResult = await query(
    `SELECT instructor_id FROM lessons
     WHERE enrollment_id = $1 AND tenant_id = $2 AND status = 'completed'
     ORDER BY date DESC, start_time DESC
     LIMIT 1`,
    [enrollment.id, tenantId]
  );
  if (lessonResult.rows.length > 0) {
    return lessonResult.rows[0].instructor_id;
  }
  return enrollment.assignedInstructorId ?? null;
}

export interface RecordCertificateInput {
  serialNumber: string;
  issueDate: string;
  issuedByInstructorId?: string | null;
}

/**
 * Records a certificate against a completed enrollment. No age check -
 * callable for ANY completed enrollment (an adult's certificate, or one
 * outside the worklist entirely) - the worklist's minors-only filter is
 * purely a surfacing rule, never a gate on this write path.
 */
export const recordCertificate = async (
  enrollmentId: string,
  tenantId: string,
  data: RecordCertificateInput,
  userId?: string
): Promise<Certificate> => {
  logger.info('Recording certificate', { tenantId, enrollmentId, serialNumber: data.serialNumber });

  const enrollmentResult = await query(
    `SELECT * FROM enrollments WHERE id = $1 AND tenant_id = $2`,
    [enrollmentId, tenantId]
  );
  if (enrollmentResult.rows.length === 0) {
    throw new AppError('Enrollment not found', 404);
  }
  const enrollment = keysToCamel(enrollmentResult.rows[0]) as Enrollment;

  if (!enrollment.completed) {
    throw new AppError('Cannot record a certificate for an enrollment that is not completed', 400);
  }

  const existing = await query(
    `SELECT id FROM certificates WHERE enrollment_id = $1 AND tenant_id = $2`,
    [enrollmentId, tenantId]
  );
  if (existing.rows.length > 0) {
    throw new AppError('A certificate has already been recorded for this enrollment', 409);
  }

  const serialInUse = await query(
    `SELECT id FROM certificates WHERE tenant_id = $1 AND serial_number = $2`,
    [tenantId, data.serialNumber]
  );
  if (serialInUse.rows.length > 0) {
    throw new AppError('This serial number has already been recorded', 400);
  }

  let issuedByInstructorId = data.issuedByInstructorId ?? null;
  if (issuedByInstructorId) {
    const instructorCheck = await query(
      `SELECT id FROM instructors WHERE id = $1 AND tenant_id = $2`,
      [issuedByInstructorId, tenantId]
    );
    if (instructorCheck.rows.length === 0) {
      throw new AppError('Instructor not found', 404);
    }
  } else {
    issuedByInstructorId = await resolveDefaultIssuingInstructor(enrollment, tenantId);
  }

  // The id is generated here, not left to the column's own DEFAULT
  // gen_random_uuid(), so completion_hash can be computed in the same
  // INSERT rather than a follow-up UPDATE.
  const certificateId = crypto.randomUUID();
  const completionHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      certificateId,
      serialNumber: data.serialNumber,
      enrollmentId,
      issueDate: data.issueDate,
    }))
    .digest('hex');

  const formType = resolveFormType(enrollment.programType);

  const result = await query(
    `INSERT INTO certificates (
       id, tenant_id, enrollment_id, serial_number, form_type, issue_date,
       issued_by_instructor_id, recorded_by, completion_hash
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      certificateId,
      tenantId,
      enrollmentId,
      data.serialNumber,
      formType,
      data.issueDate,
      issuedByInstructorId,
      userId || null,
      completionHash,
    ]
  );

  logger.info('Successfully recorded certificate', { tenantId, enrollmentId, certificateId });
  return keysToCamel(result.rows[0]) as Certificate;
};

export interface RecordVoidInput {
  serialNumber: string;
  voidReason: string;
  issueDate: string;
}

/**
 * Records a spoiled/lost/stolen certificate that never reached a student -
 * the §340.27/DL 803 accounting. No enrollment, no issuing instructor.
 */
export const recordVoid = async (
  tenantId: string,
  data: RecordVoidInput,
  userId?: string
): Promise<Certificate> => {
  logger.info('Recording void certificate', { tenantId, serialNumber: data.serialNumber });

  const serialInUse = await query(
    `SELECT id FROM certificates WHERE tenant_id = $1 AND serial_number = $2`,
    [tenantId, data.serialNumber]
  );
  if (serialInUse.rows.length > 0) {
    throw new AppError('This serial number has already been recorded', 400);
  }

  const certificateId = crypto.randomUUID();
  const completionHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({
      certificateId,
      serialNumber: data.serialNumber,
      enrollmentId: null,
      issueDate: data.issueDate,
    }))
    .digest('hex');

  const result = await query(
    `INSERT INTO certificates (
       id, tenant_id, enrollment_id, serial_number, form_type, issue_date, status,
       void_reason, issued_by_instructor_id, recorded_by, completion_hash
     ) VALUES ($1, $2, NULL, $3, $4, $5, 'void', $6, NULL, $7, $8)
     RETURNING *`,
    [
      certificateId,
      tenantId,
      data.serialNumber,
      VOID_FORM_TYPE,
      data.issueDate,
      data.voidReason,
      userId || null,
      completionHash,
    ]
  );

  logger.info('Successfully recorded void certificate', { tenantId, certificateId });
  return keysToCamel(result.rows[0]) as Certificate;
};

export const getCertificateForEnrollment = async (
  enrollmentId: string,
  tenantId: string
): Promise<Certificate | null> => {
  const result = await query(
    `SELECT * FROM certificates WHERE enrollment_id = $1 AND tenant_id = $2`,
    [enrollmentId, tenantId]
  );
  if (result.rows.length === 0) return null;
  return keysToCamel(result.rows[0]) as Certificate;
};

/**
 * Batched form of getCertificateForEnrollment, for the student-record view
 * (Items 3/5) - one query for all of a student's enrollments, not N+1.
 */
export const getCertificatesForEnrollments = async (
  enrollmentIds: string[],
  tenantId: string
): Promise<Map<string, Certificate>> => {
  const map = new Map<string, Certificate>();
  if (enrollmentIds.length === 0) return map;

  const result = await query(
    `SELECT * FROM certificates WHERE tenant_id = $1 AND enrollment_id = ANY($2::uuid[])`,
    [tenantId, enrollmentIds]
  );
  for (const row of result.rows) {
    const certificate = keysToCamel(row) as Certificate;
    if (certificate.enrollmentId) {
      map.set(certificate.enrollmentId, certificate);
    }
  }
  return map;
};
