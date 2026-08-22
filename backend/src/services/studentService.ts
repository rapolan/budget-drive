/**
 * Student Service
 * Business logic for student management
 * CRITICAL: All queries filtered by tenant_id for multi-tenant security
 */

import { query, getClient } from '../config/database';
import { Student, Lesson, Guardian } from '../types';
import { AppError } from '../middleware/errorHandler';
import { keysToCamel } from '../utils/caseConversion';
import { createLogger } from '../utils/logger';
import { getTenantSettings } from './tenantService';
import { resolveTenantTimezone } from '../utils/tenantTime';
import { computeStudentProgress, calculateAge } from './studentProgressService';
import { countGuardiansForStudentsBatch, StudentGuardianLink } from './studentGuardianService';
import { findExactGuardianMatch } from './guardianService';
import {
  getDisplayDriverTrainingEnrollmentsBatch,
  getEnrollmentsForStudent,
  createEnrollment as createEnrollmentRecord,
  computePaymentSummary,
} from './enrollmentService';

const logger = createLogger('StudentService');

/**
 * Helper to convert empty strings to null (for date fields)
 */
const emptyToNull = (value: any): any => {
  return value === '' ? null : value;
};

/**
 * Attach computed progress to a batch of students in a single extra query
 * (not N+1) - the single source of truth for progress, per computeStudentProgress,
 * now derived from each student's driver_training enrollment rather than
 * columns on the student row (Constraint B: the calculation itself is
 * unchanged, only its source moved).
 *
 * The enrollment resolved here is the DISPLAY enrollment
 * (getDisplayDriverTrainingEnrollmentsBatch), not just the active one: an
 * active enrollment always wins if one exists (a returning student's new
 * program never shows a stale "Completed" from an old one), but a
 * completed enrollment is now surfaced too when there is no active one -
 * previously a finished program fell all the way through to
 * `activeEnrollment: null`/"No Active Enrollment", which made "Completed"
 * unreachable for the exact case it exists to describe. A student with
 * NEITHER an active nor a completed driver_training enrollment (never
 * enrolled at all) still gets progress: undefined / activeEnrollment: null
 * - a real, legitimate "No Active Enrollment" state; StudentProgressBar
 * renders that case correctly.
 *
 * Also attaches needsGuardian (true only for minors with zero linked
 * guardians) via a second batched query, skipped entirely if no student in
 * the batch is a minor - adults never pay for the guardian-count query.
 */
async function attachProgress(students: Student[], tenantId: string): Promise<Student[]> {
  if (students.length === 0) return students;

  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);
  const standardLessonLengthMinutes = tenantSettings?.standardLessonLengthMinutes ?? 120;

  const studentIds = students.map(s => s.id);
  const activeEnrollments = await getDisplayDriverTrainingEnrollmentsBatch(studentIds, tenantId);
  const enrollmentIds = Array.from(activeEnrollments.values()).map(e => e.id);

  const lessonsResult = enrollmentIds.length > 0
    ? await query(
        `SELECT enrollment_id, status, duration, cost FROM lessons WHERE tenant_id = $1 AND enrollment_id = ANY($2::uuid[])`,
        [tenantId, enrollmentIds]
      )
    : { rows: [] as any[] };

  const lessonsByEnrollment = new Map<string, { status: Lesson['status']; duration: number; cost: number }[]>();
  for (const row of lessonsResult.rows) {
    const list = lessonsByEnrollment.get(row.enrollment_id) ?? [];
    list.push({ status: row.status as Lesson['status'], duration: parseFloat(row.duration), cost: parseFloat(row.cost) });
    lessonsByEnrollment.set(row.enrollment_id, list);
  }

  // Batched payment totals per enrollment, for the derived paymentSummary
  // attached below (mirrors enrollmentService's own derive-don't-cache
  // computation, reused here so Payments.tsx's list view doesn't need a
  // per-student detail fetch).
  const paymentsResult = enrollmentIds.length > 0
    ? await query(
        `SELECT enrollment_id, COALESCE(SUM(amount), 0) AS total_paid
         FROM payments
         WHERE tenant_id = $1 AND enrollment_id = ANY($2::uuid[]) AND status = 'confirmed'
         GROUP BY enrollment_id`,
        [tenantId, enrollmentIds]
      )
    : { rows: [] as any[] };
  const paidByEnrollment = new Map<string, number>();
  for (const row of paymentsResult.rows) {
    paidByEnrollment.set(row.enrollment_id, parseFloat(row.total_paid));
  }

  const minorIds = students
    .filter(s => {
      const age = calculateAge(s.dateOfBirth, timezone);
      return age === null || age < 18;
    })
    .map(s => s.id);

  const guardianCounts = await countGuardiansForStudentsBatch(minorIds, tenantId);

  return students.map(student => {
    const age = calculateAge(student.dateOfBirth, timezone);
    const isMinor = age === null || age < 18;
    const needsGuardian = isMinor && (guardianCounts.get(student.id) ?? 0) === 0;

    const enrollment = activeEnrollments.get(student.id);
    const progress = enrollment
      ? computeStudentProgress(
          {
            dateOfBirth: student.dateOfBirth,
            hoursRequired: enrollment.hoursRequired,
            completed: enrollment.completed,
            completedAt: enrollment.completedAt,
            completionReason: enrollment.completionReason,
            trackOverride: enrollment.trackOverride,
          },
          lessonsByEnrollment.get(enrollment.id) ?? [],
          standardLessonLengthMinutes,
          timezone
        )
      : undefined;

    const activeEnrollment = enrollment
      ? {
          id: enrollment.id,
          programType: enrollment.programType,
          status: enrollment.status,
          enrollmentDate: enrollment.enrollmentDate,
          completed: enrollment.completed,
          completionReason: enrollment.completionReason,
          withdrawnReason: enrollment.withdrawnReason,
        }
      : null;

    // Derived, not stored (Payments.tsx's list view) - mirrors `progress`:
    // a top-level field sourced from the active driver_training enrollment,
    // computed fresh from payments.amount each read rather than cached.
    const paymentSummary = enrollment
      ? computePaymentSummary(
          enrollment,
          lessonsByEnrollment.get(enrollment.id) ?? [],
          paidByEnrollment.get(enrollment.id) ?? 0
        )
      : undefined;

    return {
      ...student,
      progress,
      needsGuardian,
      activeEnrollment,
      paymentSummary,
    };
  });
}

/**
 * Get all students for a tenant (with pagination)
 */
export const getAllStudents = async (
  tenantId: string,
  page: number = 1,
  limit: number = 50
): Promise<{ students: Student[]; total: number; page: number; totalPages: number }> => {
  const startTime = Date.now();
  logger.info('Fetching all students', { tenantId, page, limit });

  try {
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM students WHERE tenant_id = $1',
      [tenantId]
    );
    const total = parseInt(countResult.rows[0].count);

    // Get students
    const result = await query(
      `SELECT s.*
       FROM students s
       WHERE s.tenant_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );

    const duration = Date.now() - startTime;
    logger.info('Successfully fetched students', {
      tenantId,
      count: result.rows.length,
      total,
      page,
      duration: `${duration}ms`,
    });

    const students = await attachProgress(result.rows.map(keysToCamel) as Student[], tenantId);

    return {
      students,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  } catch (error) {
    logger.error('Failed to fetch students', error as Error, { tenantId, page, limit });
    throw error;
  }
};

/**
 * Get student by ID
 */
export const getStudentById = async (
  id: string,
  tenantId: string
): Promise<Student | null> => {
  logger.debug('Fetching student by ID', { tenantId, studentId: id });

  const result = await query(
    `SELECT s.*
     FROM students s
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [id, tenantId]
  );

  if (result.rows.length === 0) {
    logger.debug('Student not found', { tenantId, studentId: id });
    return null;
  }

  // Single-student read: compute needsGuardian directly (attachProgress's
  // batched form would issue its own separate enrollment/lesson queries,
  // duplicating what getEnrollmentsForStudent below already fetches) and
  // derive student.progress from the DISPLAY driver_training enrollment
  // (see getDisplayDriverTrainingEnrollmentsBatch's doc comment) inside
  // that same enrollments list, rather than querying it twice.
  const student = keysToCamel(result.rows[0]) as Student;
  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);
  const age = calculateAge(student.dateOfBirth, timezone);
  const isMinor = age === null || age < 18;
  const guardianCounts = isMinor ? await countGuardiansForStudentsBatch([student.id], tenantId) : new Map<string, number>();
  const needsGuardian = isMinor && (guardianCounts.get(student.id) ?? 0) === 0;

  const enrollments = await getEnrollmentsForStudent(id, tenantId, student);
  const driverTrainingEnrollments = enrollments.filter(e => e.programType === 'driver_training');
  // Active always wins (a returning student's new program never shows a
  // stale status from an old one); otherwise the most recently completed
  // one (so a finished program drives "Completed" rather than "No Active
  // Enrollment"); otherwise the most recently updated one regardless of
  // status (withdrawn/inactive/suspended each drive their own correct
  // status via studentStatus.ts, rather than falling through) - the same
  // resolution order as getDisplayDriverTrainingEnrollmentsBatch, applied
  // in-memory here since this list is already fetched.
  const activeDriverTraining =
    driverTrainingEnrollments.find(e => e.status === 'active') ??
    driverTrainingEnrollments
      .filter(e => e.completedAt !== null)
      .sort((a, b) => new Date(b.completedAt as Date).getTime() - new Date(a.completedAt as Date).getTime())[0] ??
    driverTrainingEnrollments
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];

  return {
    ...student,
    progress: activeDriverTraining?.progress,
    needsGuardian,
    enrollments,
    activeEnrollment: activeDriverTraining
      ? {
          id: activeDriverTraining.id,
          programType: activeDriverTraining.programType,
          status: activeDriverTraining.status,
          enrollmentDate: activeDriverTraining.enrollmentDate,
          completed: activeDriverTraining.completed,
          completionReason: activeDriverTraining.completionReason,
          withdrawnReason: activeDriverTraining.withdrawnReason,
        }
      : null,
  };
};

/**
 * Create new student
 * Form order: Name → DOB → Address → Student Phone → Parent/Guardian → Email → Permit → Notes
 * Business rule: At least one contact method required (student phone OR Parent/Guardian)
 */
export const createStudent = async (
  tenantId: string,
  data: {
    fullName: string;
    firstName?: string;
    lastName?: string;
    middleName?: string;
    email?: string; // Required for adults (18+); optional for minors
    phone?: string; // Student phone (optional - can use Parent/Guardian instead)
    dateOfBirth?: Date;
    address?: string; // Legacy combined address
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    emergencyContactFirstName?: string; // Parent/Guardian first name
    emergencyContactLastName?: string; // Parent/Guardian last name
    emergencyContactPhone?: string; // Parent/Guardian phone
    emergencyContact2FirstName?: string; // Secondary contact first name
    emergencyContact2LastName?: string; // Secondary contact last name
    emergencyContact2Phone?: string; // Secondary contact phone
    hoursRequired?: number; // Default: 6 (California requirement)
    licenseType?: 'car' | 'motorcycle' | 'commercial'; // Default: 'car'
    assignedInstructorId?: string;
    learnerPermitNumber?: string;
    learnerPermitIssueDate?: Date;
    learnerPermitExpiration?: Date;
    notes?: string;
  },
  userId?: string
): Promise<Student> => {
  logger.info('Creating new student', {
    tenantId,
    fullName: data.fullName,
    email: data.email,
  });

  try {
    // Validate: At least one contact method required (student phone OR Parent/Guardian)
    const hasStudentPhone = data.phone && data.phone.trim().length > 0;
    const hasParentContact = data.emergencyContactPhone && data.emergencyContactPhone.trim().length > 0;

    if (!hasStudentPhone && !hasParentContact) {
      throw new AppError('At least one contact phone is required (Student Phone or Parent/Guardian)', 400);
    }

    // Validate: date of birth is required for new students (existing NULL
    // rows from before this requirement remain valid - see computeStudentProgress's
    // needsDateOfBirth fallback - but no new student may be created without one)
    if (!data.dateOfBirth) {
      throw new AppError('Date of birth is required', 400);
    }

    // Validate: email is required for adults (18+); optional for minors,
    // who often have no email of their own and share a parent's contact.
    // Can't be a DB CHECK - age changes daily.
    const tenantSettings = await getTenantSettings(tenantId);
    const timezone = resolveTenantTimezone(tenantSettings?.timezone);
    const age = calculateAge(data.dateOfBirth ?? null, timezone);
    const isAdult = age !== null && age >= 18;
    if (isAdult && (!data.email || data.email.trim().length === 0)) {
      throw new AppError('Email is required for adult students (18+)', 400);
    }

    // Check if email already exists for this tenant (only when an email
    // was actually provided - multiple students may share a null email,
    // enforced by the partial unique index on (tenant_id, email))
    if (data.email) {
      const existing = await query(
        'SELECT id FROM students WHERE email = $1 AND tenant_id = $2',
        [data.email, tenantId]
      );

      if (existing.rows.length > 0) {
        logger.warn('Duplicate student email detected', {
          tenantId,
          email: data.email,
        });
        throw new AppError('Student with this email already exists', 400);
      }
    }

    const result = await query(
      `INSERT INTO students (
        tenant_id, full_name, first_name, last_name, middle_name, email, phone, date_of_birth, address,
        address_line1, address_line2, city, state, zip_code,
        emergency_contact_first_name, emergency_contact_last_name, emergency_contact_phone,
        emergency_contact_2_first_name, emergency_contact_2_last_name, emergency_contact_2_phone,
        learner_permit_number, learner_permit_issue_date, learner_permit_expiration,
        notes, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $25)
      RETURNING *`,
      [
        tenantId,
        data.fullName,
        data.firstName || null,
        data.lastName || null,
        data.middleName || null,
        data.email || null, // Allow null email for minors
        data.phone || null, // Allow null phone
        data.dateOfBirth || null,
        data.address || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.state || null,
        data.zipCode || null,
        data.emergencyContactFirstName || null,
        data.emergencyContactLastName || null,
        data.emergencyContactPhone || null,
        data.emergencyContact2FirstName || null,
        data.emergencyContact2LastName || null,
        data.emergencyContact2Phone || null,
        data.learnerPermitNumber || null,
        data.learnerPermitIssueDate || null,
        data.learnerPermitExpiration || null,
        data.notes || null,
        userId || null,
      ]
    );

    const newStudent = keysToCamel(result.rows[0]) as Student;

    // Every new student starts with exactly one driver_training enrollment,
    // matching Constraint A/D's invariant for existing (backfilled) students.
    await createEnrollmentRecord(
      newStudent.id,
      tenantId,
      {
        programType: 'driver_training',
        hoursRequired: data.hoursRequired,
        licenseType: data.licenseType,
        assignedInstructorId: data.assignedInstructorId,
      },
      userId
    );

    logger.info('Successfully created student', {
      tenantId,
      studentId: newStudent.id,
      fullName: newStudent.fullName,
    });

    return (await getStudentById(newStudent.id, tenantId)) as Student;
  } catch (error) {
    logger.error('Failed to create student', error as Error, {
      tenantId,
      email: data.email,
    });
    throw error;
  }
};

export type CreateStudentWithGuardianEntry =
  | { mode: 'existing'; guardianId: string; relationship?: string; isPrimary?: boolean }
  | { mode: 'new'; firstName?: string; lastName?: string; email?: string; phone?: string; relationship?: string; isPrimary?: boolean };

export interface CreateStudentWithGuardianInput {
  student: Parameters<typeof createStudent>[1];
  guardians: CreateStudentWithGuardianEntry[]; // 1..N
}

/**
 * Atomically create a student and create-or-link ONE OR MORE guardians in a
 * single transaction. A failure at ANY step (student insert, any guardian's
 * insert/lookup, or any student_guardians link) rolls back everything - there
 * is no partial state where a student exists with fewer guardians than were
 * requested, which is exactly the broken state needsGuardian exists to
 * detect. This is a genuine loop over one BEGIN/COMMIT, not N calls to a
 * single-guardian helper (each of which would open its own transaction).
 *
 * All validation - including the duplicate-guardian-reference check and the
 * exact-match lookup per new guardian - runs BEFORE BEGIN so a 400/409 never
 * opens a transaction. Mirrors createStudent's validation rules exactly
 * (contact-method required, DOB required, adult-email required) plus
 * createGuardian's rule (email-or-phone required) for each guardians[i]
 * with mode === 'new'.
 *
 * This is the ONLY entry point for creating a student together with one or
 * more guardians - POST /students (createStudent above) is untouched and
 * still used for adults, and for minors whose guardian-linking is deferred.
 */
export const createStudentWithGuardian = async (
  tenantId: string,
  input: CreateStudentWithGuardianInput,
  userId?: string
): Promise<{ student: Student; guardians: Array<{ guardian: Guardian; link: StudentGuardianLink }> }> => {
  const { student: data, guardians } = input;

  logger.info('Creating new student with guardians', {
    tenantId,
    fullName: data.fullName,
    guardianCount: guardians?.length,
  });

  // --- Student validation (identical to createStudent) ---
  const hasStudentPhone = data.phone && data.phone.trim().length > 0;
  const hasParentContact = data.emergencyContactPhone && data.emergencyContactPhone.trim().length > 0;
  if (!hasStudentPhone && !hasParentContact) {
    throw new AppError('At least one contact phone is required (Student Phone or Parent/Guardian)', 400);
  }

  if (!data.dateOfBirth) {
    throw new AppError('Date of birth is required', 400);
  }

  const tenantSettings = await getTenantSettings(tenantId);
  const timezone = resolveTenantTimezone(tenantSettings?.timezone);
  const age = calculateAge(data.dateOfBirth ?? null, timezone);
  const isAdult = age !== null && age >= 18;
  if (isAdult && (!data.email || data.email.trim().length === 0)) {
    throw new AppError('Email is required for adult students (18+)', 400);
  }

  // --- Guardian validation (identical to createGuardian, per entry) ---
  if (!guardians || guardians.length === 0) {
    throw new AppError('At least one guardian is required', 400);
  }

  for (const guardian of guardians) {
    if (guardian.mode === 'new') {
      const hasEmail = guardian.email && guardian.email.trim().length > 0;
      const hasPhone = guardian.phone && guardian.phone.trim().length > 0;
      if (!hasEmail && !hasPhone) {
        throw new AppError('At least one of email or phone is required for each guardian', 400);
      }
    } else if (!guardian.guardianId) {
      throw new AppError('guardianId is required', 400);
    }
  }

  // --- Reject duplicate guardian references within this request ---
  const seenGuardianIds = new Set<string>();
  const seenNewContacts = new Set<string>();
  for (const guardian of guardians) {
    if (guardian.mode === 'existing') {
      if (seenGuardianIds.has(guardian.guardianId)) {
        throw new AppError(`Duplicate guardian reference in request: ${guardian.guardianId}`, 400);
      }
      seenGuardianIds.add(guardian.guardianId);
    } else {
      const email = guardian.email?.trim().toLowerCase();
      const phone = guardian.phone?.trim();
      const contactKey = email ? `email:${email}` : phone ? `phone:${phone}` : null;
      if (contactKey) {
        if (seenNewContacts.has(contactKey)) {
          throw new AppError('Duplicate guardian reference in request: two new guardians share the same email or phone', 400);
        }
        seenNewContacts.add(contactKey);
      }
    }
  }

  // --- Exact-match check per new guardian (defense in depth - the
  // frontend already runs this before submit for the duplicate-confirm
  // UX, but a direct API call must be refused too, not silently create a
  // duplicate guardian record). Pooled query is fine here since this is
  // still before BEGIN. ---
  for (const guardian of guardians) {
    if (guardian.mode !== 'new') continue;
    if (!guardian.email && !guardian.phone) continue;
    const matches = await findExactGuardianMatch(tenantId, {
      email: guardian.email,
      phone: guardian.phone,
    });
    if (matches.length > 0) {
      throw new AppError(
        `A guardian with this email or phone already exists: ${matches[0].firstName ?? ''} ${matches[0].lastName ?? ''}`.trim(),
        409
      );
    }
  }

  // --- Resolve exactly one primary guardian ---
  const explicitPrimaryCount = guardians.filter(g => g.isPrimary === true).length;
  if (explicitPrimaryCount > 1) {
    throw new AppError('Only one guardian may be marked primary', 400);
  }
  const primaryIndex = explicitPrimaryCount === 1 ? guardians.findIndex(g => g.isPrimary === true) : 0;

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Duplicate-email check runs on the same client so it's serialized
    // with this transaction's own commit (avoids a TOCTOU gap against a
    // concurrent duplicate-email create via the pooled connection).
    if (data.email) {
      const existing = await client.query(
        'SELECT id FROM students WHERE email = $1 AND tenant_id = $2',
        [data.email, tenantId]
      );
      if (existing.rows.length > 0) {
        throw new AppError('Student with this email already exists', 400);
      }
    }

    const studentResult = await client.query(
      `INSERT INTO students (
        tenant_id, full_name, first_name, last_name, middle_name, email, phone, date_of_birth, address,
        address_line1, address_line2, city, state, zip_code,
        emergency_contact_first_name, emergency_contact_last_name, emergency_contact_phone,
        emergency_contact_2_first_name, emergency_contact_2_last_name, emergency_contact_2_phone,
        learner_permit_number, learner_permit_issue_date, learner_permit_expiration,
        notes, created_by, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $25)
      RETURNING *`,
      [
        tenantId,
        data.fullName,
        data.firstName || null,
        data.lastName || null,
        data.middleName || null,
        data.email || null,
        data.phone || null,
        data.dateOfBirth || null,
        data.address || null,
        data.addressLine1 || null,
        data.addressLine2 || null,
        data.city || null,
        data.state || null,
        data.zipCode || null,
        data.emergencyContactFirstName || null,
        data.emergencyContactLastName || null,
        data.emergencyContactPhone || null,
        data.emergencyContact2FirstName || null,
        data.emergencyContact2LastName || null,
        data.emergencyContact2Phone || null,
        data.learnerPermitNumber || null,
        data.learnerPermitIssueDate || null,
        data.learnerPermitExpiration || null,
        data.notes || null,
        userId || null,
      ]
    );
    const newStudent = keysToCamel(studentResult.rows[0]) as Student;

    // Initial driver_training enrollment, on the same client/transaction -
    // a failure here rolls back the student insert too (Constraint A: no
    // student may exist without its enrollment).
    let hoursRequired = data.hoursRequired;
    if (hoursRequired === undefined) {
      hoursRequired = tenantSettings?.defaultHoursRequired ?? 6;
    }
    const licenseType = data.licenseType ?? 'car';
    await client.query(
      `INSERT INTO enrollments (
         tenant_id, student_id, program_type, hours_required, license_type, assigned_instructor_id, created_by, updated_by
       ) VALUES ($1, $2, 'driver_training', $3, $4, $5, $6, $6)`,
      [tenantId, newStudent.id, hoursRequired, licenseType, data.assignedInstructorId || null, userId || null]
    );

    // Every guardian's insert-or-lookup and link INSERT runs on this same
    // client, inside this same transaction - a loop over one BEGIN/COMMIT,
    // never N separate transactions (Constraint A).
    const createdGuardians: Array<{ guardian: Guardian; link: StudentGuardianLink }> = [];

    for (let i = 0; i < guardians.length; i++) {
      const guardian = guardians[i];
      let guardianRow: Guardian;

      if (guardian.mode === 'new') {
        const guardianResult = await client.query(
          `INSERT INTO guardians (
            tenant_id, first_name, last_name, email, phone, created_by, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $6)
          RETURNING *`,
          [
            tenantId,
            guardian.firstName || null,
            guardian.lastName || null,
            guardian.email || null,
            guardian.phone || null,
            userId || null,
          ]
        );
        guardianRow = keysToCamel(guardianResult.rows[0]) as Guardian;
      } else {
        const guardianCheck = await client.query(
          'SELECT * FROM guardians WHERE id = $1 AND tenant_id = $2',
          [guardian.guardianId, tenantId]
        );
        if (guardianCheck.rows.length === 0) {
          throw new AppError('Guardian not found', 404);
        }
        guardianRow = keysToCamel(guardianCheck.rows[0]) as Guardian;
      }

      // Brand-new student - safe to insert is_primary directly (exactly
      // one entry resolved to true above), no demote-then-promote needed
      // since nothing else can conflict with the partial unique index yet.
      const linkResult = await client.query(
        `INSERT INTO student_guardians (tenant_id, student_id, guardian_id, relationship, is_primary)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          tenantId,
          newStudent.id,
          guardianRow.id,
          guardian.relationship || null,
          i === primaryIndex,
        ]
      );
      const link = keysToCamel(linkResult.rows[0]) as StudentGuardianLink;

      createdGuardians.push({ guardian: guardianRow, link });
    }

    await client.query('COMMIT');

    logger.info('Successfully created student with guardians', {
      tenantId,
      studentId: newStudent.id,
      guardianIds: createdGuardians.map(g => g.guardian.id),
    });

    return { student: newStudent, guardians: createdGuardians };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create student with guardians, rolled back', error as Error, { tenantId });
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Update student
 */
export const updateStudent = async (
  id: string,
  tenantId: string,
  data: Partial<Student>,
  userId?: string
): Promise<Student> => {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  // Build dynamic update query
  if (data.fullName !== undefined) {
    fields.push(`full_name = $${paramCount++}`);
    values.push(data.fullName);
  }
  if (data.firstName !== undefined) {
    fields.push(`first_name = $${paramCount++}`);
    values.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    fields.push(`last_name = $${paramCount++}`);
    values.push(data.lastName);
  }
  if (data.middleName !== undefined) {
    fields.push(`middle_name = $${paramCount++}`);
    values.push(data.middleName);
  }
  if (data.email !== undefined) {
    fields.push(`email = $${paramCount++}`);
    values.push(data.email);
  }
  if (data.phone !== undefined) {
    fields.push(`phone = $${paramCount++}`);
    values.push(data.phone);
  }
  if (data.address !== undefined) {
    fields.push(`address = $${paramCount++}`);
    values.push(data.address);
  }
  if (data.addressLine1 !== undefined) {
    fields.push(`address_line1 = $${paramCount++}`);
    values.push(data.addressLine1);
  }
  if (data.addressLine2 !== undefined) {
    fields.push(`address_line2 = $${paramCount++}`);
    values.push(data.addressLine2);
  }
  if (data.city !== undefined) {
    fields.push(`city = $${paramCount++}`);
    values.push(data.city);
  }
  if (data.state !== undefined) {
    fields.push(`state = $${paramCount++}`);
    values.push(data.state);
  }
  if (data.zipCode !== undefined) {
    fields.push(`zip_code = $${paramCount++}`);
    values.push(data.zipCode);
  }
  if (data.emergencyContactFirstName !== undefined) {
    fields.push(`emergency_contact_first_name = $${paramCount++}`);
    values.push(data.emergencyContactFirstName);
  }
  if (data.emergencyContactLastName !== undefined) {
    fields.push(`emergency_contact_last_name = $${paramCount++}`);
    values.push(data.emergencyContactLastName);
  }
  if (data.emergencyContactPhone !== undefined) {
    fields.push(`emergency_contact_phone = $${paramCount++}`);
    values.push(data.emergencyContactPhone);
  }
  if (data.emergencyContact2FirstName !== undefined) {
    fields.push(`emergency_contact_2_first_name = $${paramCount++}`);
    values.push(data.emergencyContact2FirstName);
  }
  if (data.emergencyContact2LastName !== undefined) {
    fields.push(`emergency_contact_2_last_name = $${paramCount++}`);
    values.push(data.emergencyContact2LastName);
  }
  if (data.emergencyContact2Phone !== undefined) {
    fields.push(`emergency_contact_2_phone = $${paramCount++}`);
    values.push(data.emergencyContact2Phone);
  }
  if (data.learnerPermitNumber !== undefined) {
    fields.push(`learner_permit_number = $${paramCount++}`);
    values.push(emptyToNull(data.learnerPermitNumber));
  }
  if (data.learnerPermitIssueDate !== undefined) {
    fields.push(`learner_permit_issue_date = $${paramCount++}`);
    values.push(emptyToNull(data.learnerPermitIssueDate));
  }
  if (data.learnerPermitExpiration !== undefined) {
    fields.push(`learner_permit_expiration = $${paramCount++}`);
    values.push(emptyToNull(data.learnerPermitExpiration));
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${paramCount++}`);
    values.push(data.notes);
  }
  if (data.lastContactedAt !== undefined) {
    fields.push(`last_contacted_at = $${paramCount++}`);
    values.push(emptyToNull(data.lastContactedAt));
  }
  if (userId) {
    fields.push(`updated_by = $${paramCount++}`);
    values.push(userId);
  }

  if (fields.length === 0) {
    throw new AppError('No fields to update', 400);
  }

  // If email or dateOfBirth is changing, verify the resulting row still
  // satisfies "email required for adults" - requires reading the current
  // row when only one of the two is present in this patch.
  if (data.email !== undefined || data.dateOfBirth !== undefined) {
    const current = await getStudentById(id, tenantId);
    if (!current) {
      throw new AppError('Student not found', 404);
    }
    const resultingEmail = data.email !== undefined ? data.email : current.email;
    const resultingDob = data.dateOfBirth !== undefined ? data.dateOfBirth : current.dateOfBirth;
    const tenantSettings = await getTenantSettings(tenantId);
    const timezone = resolveTenantTimezone(tenantSettings?.timezone);
    const resultingAge = calculateAge(resultingDob ?? null, timezone);
    const resultingIsAdult = resultingAge !== null && resultingAge >= 18;
    if (resultingIsAdult && (!resultingEmail || resultingEmail.trim().length === 0)) {
      throw new AppError('Email is required for adult students (18+)', 400);
    }
  }

  values.push(id, tenantId);

  const result = await query(
    `UPDATE students
     SET ${fields.join(', ')}
     WHERE id = $${paramCount} AND tenant_id = $${paramCount + 1}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    throw new AppError('Student not found', 404);
  }

  return keysToCamel(result.rows[0]) as Student;
};

/**
 * Delete student (hard delete for now, will be soft delete when blockchain is implemented)
 * NOTE: When blockchain is integrated, this will change to set a deleted_at timestamp
 * instead of actually removing the record, since blockchain data is immutable.
 */
export const deleteStudent = async (
  id: string,
  tenantId: string
): Promise<void> => {
  logger.info('Deleting student', { tenantId, studentId: id });

  try {
    const result = await query(
      `DELETE FROM students
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      logger.warn('Student not found for deletion', { tenantId, studentId: id });
      throw new AppError('Student not found', 404);
    }

    logger.info('Successfully deleted student', { tenantId, studentId: id });
  } catch (error) {
    logger.error('Failed to delete student', error as Error, { tenantId, studentId: id });
    throw error;
  }
};

/**
 * Get students whose active driver_training enrollment has this status.
 * `status` used to live on students directly; it's now an enrollment
 * concept (Constraint A/D), so this filters via a join rather than a
 * column read. No frontend caller reaches this endpoint today (verified:
 * frontend/src/api/students.ts defines getByStatus but no component calls
 * it - same dead-but-present precedent as the old reopen endpoint).
 */
export const getStudentsByStatus = async (
  tenantId: string,
  status: 'active' | 'completed' | 'inactive' | 'suspended'
): Promise<Student[]> => {
  const result = await query(
    `SELECT s.*
     FROM students s
     JOIN enrollments e ON e.student_id = s.id AND e.program_type = 'driver_training'
     WHERE s.tenant_id = $1 AND e.tenant_id = $1 AND e.status = $2
     ORDER BY s.created_at DESC`,
    [tenantId, status]
  );

  return attachProgress(result.rows.map(keysToCamel) as Student[], tenantId);
};

/**
 * Get students assigned (via their active driver_training enrollment) to an
 * instructor. assigned_instructor_id moved to enrollments (Constraint A/D).
 */
export const getStudentsByInstructor = async (
  tenantId: string,
  instructorId: string
): Promise<Student[]> => {
  const result = await query(
    `SELECT s.*
     FROM students s
     JOIN enrollments e ON e.student_id = s.id AND e.program_type = 'driver_training' AND e.status = 'active'
     WHERE s.tenant_id = $1 AND e.tenant_id = $1 AND e.assigned_instructor_id = $2
     ORDER BY s.created_at DESC`,
    [tenantId, instructorId]
  );

  return attachProgress(result.rows.map(keysToCamel) as Student[], tenantId);
};
