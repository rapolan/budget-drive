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
import { Certificate, Enrollment } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone } from '../utils/tenantTime';
import { calculateAge } from './studentProgressService';
import { getClassroomAttendanceSummaries } from './classroomAttendanceService';
import crypto from 'crypto';

const logger = createLogger('CertificateService');

// DMV form type a certificate is recorded on. driver_training always
// resolves to DL_400D. driver_education splits by delivery mode (Phase 3):
// classroom -> DL_400B, online -> DL_400C - a distinction program_type
// alone can't resolve, hence the second field. Exported for reuse by
// enrollmentService.completeAndIssueDeCertificate, which inlines its own
// certificate INSERT (see that function's doc comment for why it can't
// just call recordCertificate directly) but must resolve the same form
// type recordCertificate would, not a second calculation.
export function resolveFormType(enrollment: Pick<Enrollment, 'programType' | 'deDeliveryMode'>): string {
  if (enrollment.programType === 'driver_training') {
    return 'DL_400D';
  }
  if (enrollment.deDeliveryMode === 'classroom') {
    return 'DL_400B';
  }
  if (enrollment.deDeliveryMode === 'online') {
    return 'DL_400C';
  }
  throw new AppError(
    `No DMV form type mapping for program type "${enrollment.programType}" (delivery mode not set)`,
    400
  );
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
       (SELECT dc.teacher_instructor_id FROM de_cohort_enrollments dce
        JOIN de_cohorts dc ON dc.id = dce.cohort_id
        WHERE dce.enrollment_id = e.id
        LIMIT 1) AS cohort_teacher_instructor_id,
       e.assigned_instructor_id
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN certificates c ON c.enrollment_id = e.id
     WHERE e.tenant_id = $1
       AND (
         e.program_type = 'driver_training'
         OR (e.program_type = 'driver_education' AND e.de_delivery_mode IS NOT NULL)
       )
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
        .map(
          (row: any) =>
            row.last_lesson_instructor_id || row.cohort_teacher_instructor_id || row.assigned_instructor_id
        )
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
    const suggestedInstructorId =
      row.last_lesson_instructor_id || row.cohort_teacher_instructor_id || row.assigned_instructor_id || null;
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

export interface DeReadyForIssuanceEntry {
  enrollmentId: string;
  studentId: string;
  studentName: string;
  deDeliveryMode: 'classroom' | 'online';
  // 'attendance_complete': classroom, 4/4 curriculum days attended, NOT
  // yet marked complete - the "Complete & issue certificate" combined
  // action applies (enrollmentService.completeAndIssueDeCertificate).
  // 'completed': already completed (online's plain manual completion, or
  // a classroom student completed via the ordinary "Mark complete"
  // fallback) with no certificate yet - the plain recordCertificate path
  // applies, exactly like the BTW worklist.
  readyReason: 'attendance_complete' | 'completed';
  // The date to default the issue-date field to: completedAt for the
  // 'completed' case (mirrors the BTW worklist's own default-to-
  // completion-date behavior); the most recent attended session's date
  // for 'attendance_complete', since there is no completedAt yet.
  readyAt: Date;
  suggestedInstructorId: string | null;
  suggestedInstructorName: string | null;
  cohortName: string | null;
}

/**
 * Driver Education's "ready for issuance" worklist - DE is immediate
 * issuance (the school issues the certificate right when a cohort
 * finishes), not the paper-sheet reconciliation the BTW worklist models,
 * so this is a genuinely different query, not a filtered view of
 * getAwaitingCertificateWorklist. Two ways a DE enrollment lands here,
 * discriminated by `readyReason` (see above) - reuses the exact same
 * completion signals the rest of the app already computes, never a new
 * one: classroom completion is getClassroomAttendanceSummary's isComplete
 * (4/4 days, the Phase 3 attendance source of truth), and the plain
 * completed-with-no-cert case is the identical shape
 * getAwaitingCertificateWorklist already uses for BTW. Minors-as-of-
 * readiness only, same §340.27 surfacing convention as the BTW worklist -
 * recordCertificate/completeAndIssueDeCertificate are both callable
 * regardless of age; this is a pure surfacing rule.
 */
export const getDeReadyForIssuanceWorklist = async (
  tenantId: string
): Promise<DeReadyForIssuanceEntry[]> => {
  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);

  // Branch 1: completed DE enrollments (any delivery mode) with no
  // certificate yet - identical shape to the BTW worklist's own query,
  // scoped to driver_education.
  const completedResult = await query(
    `SELECT
       e.id AS enrollment_id,
       e.student_id,
       e.de_delivery_mode,
       e.completed_at AS ready_at,
       s.full_name AS student_name,
       s.date_of_birth,
       (SELECT dc.teacher_instructor_id FROM de_cohort_enrollments dce
        JOIN de_cohorts dc ON dc.id = dce.cohort_id
        WHERE dce.enrollment_id = e.id
        LIMIT 1) AS cohort_teacher_instructor_id,
       (SELECT dc.name FROM de_cohort_enrollments dce
        JOIN de_cohorts dc ON dc.id = dce.cohort_id
        WHERE dce.enrollment_id = e.id
        LIMIT 1) AS cohort_name,
       e.assigned_instructor_id
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     LEFT JOIN certificates c ON c.enrollment_id = e.id
     WHERE e.tenant_id = $1
       AND e.program_type = 'driver_education'
       AND e.de_delivery_mode IS NOT NULL
       AND e.completed = true
       AND c.id IS NULL`,
    [tenantId]
  );

  // Branch 2: classroom DE enrollments with 4/4 attendance, not yet
  // completed (so NOT already covered by branch 1) - the
  // attendance-complete case the combined action handles.
  const classroomCandidatesResult = await query(
    `SELECT
       e.id AS enrollment_id,
       e.student_id,
       s.full_name AS student_name,
       s.date_of_birth,
       (SELECT dc.teacher_instructor_id FROM de_cohort_enrollments dce
        JOIN de_cohorts dc ON dc.id = dce.cohort_id
        WHERE dce.enrollment_id = e.id
        LIMIT 1) AS cohort_teacher_instructor_id,
       (SELECT dc.name FROM de_cohort_enrollments dce
        JOIN de_cohorts dc ON dc.id = dce.cohort_id
        WHERE dce.enrollment_id = e.id
        LIMIT 1) AS cohort_name,
       e.assigned_instructor_id
     FROM enrollments e
     JOIN students s ON s.id = e.student_id
     WHERE e.tenant_id = $1
       AND e.program_type = 'driver_education'
       AND e.de_delivery_mode = 'classroom'
       AND e.completed = false`,
    [tenantId]
  );

  type RawRow = {
    enrollment_id: string;
    student_id: string;
    de_delivery_mode?: 'classroom' | 'online';
    ready_at?: Date;
    student_name: string;
    date_of_birth: Date | null;
    cohort_teacher_instructor_id: string | null;
    cohort_name: string | null;
    assigned_instructor_id: string | null;
  };

  const classroomEnrollmentIds = (classroomCandidatesResult.rows as RawRow[]).map((row) => row.enrollment_id);
  const attendanceByEnrollment = await getClassroomAttendanceSummaries(classroomEnrollmentIds, tenantId);

  // Most recent attended session's date, for the attendance-complete
  // case's readyAt default (no completedAt exists yet) - one small query,
  // only for the enrollments that actually reached 4/4.
  const readyClassroomIds = (classroomCandidatesResult.rows as RawRow[])
    .filter((row) => attendanceByEnrollment.get(row.enrollment_id)?.isComplete)
    .map((row) => row.enrollment_id);

  const lastSessionDateByEnrollment = new Map<string, Date>();
  if (readyClassroomIds.length > 0) {
    const lastSessionResult = await query(
      `SELECT a.enrollment_id, MAX(s.session_date) AS last_session_date
       FROM de_attendance a
       JOIN de_cohort_sessions s ON s.id = a.session_id
       WHERE a.enrollment_id = ANY($1::uuid[]) AND a.tenant_id = $2 AND a.present = true
       GROUP BY a.enrollment_id`,
      [readyClassroomIds, tenantId]
    );
    for (const row of lastSessionResult.rows as { enrollment_id: string; last_session_date: Date }[]) {
      lastSessionDateByEnrollment.set(row.enrollment_id, row.last_session_date);
    }
  }

  const completedEntries = (completedResult.rows as RawRow[]).map((row) => ({
    row,
    readyReason: 'completed' as const,
    deDeliveryMode: row.de_delivery_mode as 'classroom' | 'online',
    readyAt: row.ready_at as Date,
  }));

  const attendanceCompleteEntries = (classroomCandidatesResult.rows as RawRow[])
    .filter((row) => attendanceByEnrollment.get(row.enrollment_id)?.isComplete)
    .map((row) => ({
      row,
      readyReason: 'attendance_complete' as const,
      deDeliveryMode: 'classroom' as const,
      readyAt: lastSessionDateByEnrollment.get(row.enrollment_id) ?? new Date(),
    }));

  const allEntries = [...completedEntries, ...attendanceCompleteEntries];

  const minorEntries = allEntries.filter(({ row, readyAt }) => {
    const age = calculateAge(row.date_of_birth, timezone, new Date(readyAt));
    return age === null || age < 18;
  });

  const instructorIds = Array.from(
    new Set(
      minorEntries
        .map(({ row }) => row.cohort_teacher_instructor_id || row.assigned_instructor_id)
        .filter((id): id is string => id !== null)
    )
  );

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

  return minorEntries
    .map(({ row, readyReason, deDeliveryMode, readyAt }) => {
      const suggestedInstructorId = row.cohort_teacher_instructor_id || row.assigned_instructor_id || null;
      return {
        enrollmentId: row.enrollment_id,
        studentId: row.student_id,
        studentName: row.student_name,
        deDeliveryMode,
        readyReason,
        readyAt,
        suggestedInstructorId,
        suggestedInstructorName: suggestedInstructorId ? instructorNames.get(suggestedInstructorId) ?? null : null,
        cohortName: row.cohort_name,
      };
    })
    .sort((a, b) => new Date(a.readyAt).getTime() - new Date(b.readyAt).getTime());
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
  // Always present, even for a void (VOID_FORM_TYPE, 'NOT_APPLICABLE') -
  // the discriminator the frontend's program tab filters this ONE unified
  // log by (DE: DL_400B/DL_400C, BTW: DL_400D), never a split dataset.
  formType: string;
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
 * a void isn't attributable to one). ONE unified log across every form
 * type/program - formType is the filter discriminator, the dataset itself
 * is never split by program (see docs/ARCHITECTURE.md's Certificates-page
 * section: one certificates table, one register, filtered views only).
 */
export const getIssuedLog = async (tenantId: string): Promise<CertificateLogEntry[]> => {
  const result = await query(
    `SELECT
       c.id, c.serial_number, c.status, c.form_type, c.issue_date, c.void_reason,
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
    formType: row.form_type,
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
  // Classroom driver_education has no lessons - fall back to the
  // student's home cohort's teacher before the enrollment's generic
  // assigned_instructor_id, matching the worklist's own default order.
  const cohortResult = await query(
    `SELECT dc.teacher_instructor_id FROM de_cohort_enrollments dce
     JOIN de_cohorts dc ON dc.id = dce.cohort_id
     WHERE dce.enrollment_id = $1 AND dc.tenant_id = $2
     LIMIT 1`,
    [enrollment.id, tenantId]
  );
  if (cohortResult.rows.length > 0 && cohortResult.rows[0].teacher_instructor_id) {
    return cohortResult.rows[0].teacher_instructor_id;
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

  const formType = resolveFormType(enrollment);

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
