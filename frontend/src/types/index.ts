// Core API Types matching backend schema

export type TenantType = 'school' | 'independent';

export interface Tenant {
  id: string;
  businessName: string;
  subdomain: string;
  tenantType: TenantType;
  planTier: 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  trialEndsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// User account (can belong to multiple tenants)
export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  profilePhotoUrl?: string;
  status: 'active' | 'suspended' | 'pending_verification';
  emailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// User's membership in a tenant (for account switching)
export interface UserTenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  role: 'owner' | 'admin' | 'instructor' | 'staff' | 'viewer';
  instructorId?: string;
  status: 'active' | 'suspended' | 'invited' | 'declined';
  isDefaultTenant: boolean;
  lastAccessedAt?: Date;
  // Joined fields for display
  tenantName?: string;
  tenantSlug?: string;
  tenantType?: TenantType;
  businessName?: string;
  logoUrl?: string;
  primaryColor?: string;
}

// Tenant-timezone-resolved "now" - the ONLY source of "today"/current-time/
// week/month boundaries anywhere in the frontend. Never derive any of these
// from the browser's own Date/Intl; render this value instead (see
// docs/ARCHITECTURE.md §7).
export interface TenantNow {
  timezone: string;
  today: string;       // YYYY-MM-DD
  tomorrow: string;     // YYYY-MM-DD
  currentTime: string;  // HH:MM
  weekStart: string;    // YYYY-MM-DD, Sunday-start
  weekEnd: string;      // YYYY-MM-DD, weekStart + 6
  monthBoundaries: { start: string; end: string };
}

export interface TenantSettings {
  id: string;
  tenantId: string;
  // Present once TenantContext's first fetch of GET /tenant/settings
  // resolves - null only during that brief pre-hydration window.
  tenantNow?: TenantNow;

  // Business identity
  businessName?: string;
  businessTagline?: string;
  // DMV-issued driving school license number - Phase 1 of the
  // compliance-records arc (docs/compliance-records-build-plan.md).
  // Nullable: not every tenant has one on file yet.
  licenseNumber?: string;
  logoUrl?: string;

  // Colors
  primaryColor: string;

  // Contact
  supportEmail?: string;
  supportPhone?: string;
  websiteUrl?: string;

  // Address
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;

  // Localization
  // null until an admin has explicitly saved one - the Settings page uses
  // this to decide whether to offer the browser-detected zone as a
  // suggestion. Never fall back to the browser's zone for anything other
  // than that suggestion; all real date/time display already comes
  // pre-resolved from the backend regardless of this value.
  timezone: string | null;
  currency: string;
  language: string;

  // Defaults
  defaultHoursRequired: number;
  standardLessonLengthMinutes: number;
  defaultLessonCost: number;
  maxLessonsPerStudentPerDay: number;
  // Per-lesson BTW discount for a student with a completed INTERNAL
  // driver_education enrollment (never an externally-completed one).
  deDiscountAmount?: number;

  // Lesson Review & Cancellation Policy
  lessonCompletionMode: 'manual' | 'auto';
  cancellationFeeAmount: number;
  cancellationFeeWindowHours: number;
  cancellationFeePayee: 'instructor' | 'school';

  // Feature flags
  enableBlockchain?: boolean;
  enableBlockchainPayments: boolean;
  enableGoogleCalendar: boolean;
  enableCertificates: boolean;
  enableFollowUpTracker: boolean;
  enableMultiPayment?: boolean;
  enableStudentPortal?: boolean;
  enableInstructorPortal?: boolean;
  enableSmsNotifications?: boolean;
  enableEmailNotifications?: boolean;
  // Off by default. Gates the Classroom nav page and driver_education's
  // classroom delivery mode (Phase 3 of the compliance-records arc).
  enableDriverEducation?: boolean;

  createdAt: Date;
  updatedAt: Date;
}

// Single source of truth for student progress - computed backend-side by
// studentProgressService.computeStudentProgress. The frontend never
// recomputes this; it only renders displayLabel/percentComplete/track.
export type ProgressTrack = 'hours' | 'lessons' | 'completed';

export interface StudentProgress {
  track: ProgressTrack;
  hoursCompleted?: number;
  hoursRequired?: number;
  hoursScheduled?: number;
  lessonsCompleted?: number;
  lessonsBooked?: number;
  lessonsRequired?: number;
  lessonsPercent?: number;
  completedAt?: string | null;
  completionReason?: string | null;
  displayLabel: string;
  percentComplete: number;
  needsDateOfBirth: boolean;
}

export interface Student {
  id: string;
  tenantId: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  email?: string; // Required for adults (18+ by dateOfBirth); optional for minors, whose guardian's email is the contact
  phone?: string | null; // Student phone (optional - Parent/Guardian can be primary contact)
  dateOfBirth?: Date;
  address?: string; // Legacy combined address field
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  // Distinct pickup location (migration 022) - when
  // pickupAddressDifferentFromHome is false, the booking wizard falls back
  // to the home address fields above, same as before this feature existed.
  pickupAddressDifferentFromHome?: boolean;
  pickupAddressLine1?: string | null;
  pickupAddressLine2?: string | null;
  pickupCity?: string | null;
  pickupState?: string | null;
  pickupZipCode?: string | null;
  emergencyContactFirstName?: string; // Parent/Guardian first name
  emergencyContactLastName?: string; // Parent/Guardian last name
  emergencyContactPhone?: string; // Parent/Guardian phone
  emergencyContact2FirstName?: string; // Secondary contact first name
  emergencyContact2LastName?: string; // Secondary contact last name
  emergencyContact2Phone?: string; // Secondary contact phone
  learnerPermitNumber?: string;
  learnerPermitIssueDate?: Date;
  learnerPermitExpiration?: Date;
  // Program state (hoursRequired/status/completed*/trackOverride/
  // licenseType/enrollmentDate/assignedInstructorId/payment fields) moved
  // to Enrollment - a person may have more than one program. progress/
  // needsGuardian/enrollments are attached by the backend's read paths,
  // not stored columns.
  progress?: StudentProgress; // Derived from this student's active driver_training enrollment
  needsGuardian?: boolean; // Attached by the backend - true only for minors with zero linked guardians
  enrollments?: Enrollment[]; // Attached on the student detail response - all of this person's enrollments
  // Small, explicit lifecycle view of the active driver_training
  // enrollment, attached on every list/detail read alongside `progress`.
  // Deliberately not flattened onto Student (recreates the person-vs-program
  // ambiguity this refactor removes) and deliberately separate from
  // `progress` (a computed hours/lessons view, not a grab-bag). null means
  // no active driver_training enrollment right now - handle it explicitly.
  activeEnrollment?: ActiveEnrollmentSummary | null;
  // Derived (not stored) payment summary for the active driver_training
  // enrollment - mirrors `progress`'s shape/rationale, computed fresh from
  // payments.amount each read. Undefined (not null) when there's no active
  // enrollment to derive it from, matching `progress`'s own convention.
  paymentSummary?: EnrollmentPaymentSummary;
  lastContactedAt?: Date;  // Timestamp of last contact attempt for follow-up
  notes?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt: Date;
  updatedAt: Date;

  // Derived (not stored) - attached by the backend's read paths, same
  // convention as progress/needsGuardian/activeEnrollment above.
  hasOutstandingFee?: boolean;
  outstandingFeeAmount?: number;
  // This minor's primary linked guardian, for the Contact column's
  // guardian-contact fallback and the clickable-guardian-name display.
  // undefined for adults and for minors with zero linked guardians.
  primaryGuardian?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
}

// =====================================================
// ENROLLMENT TYPES
// =====================================================

export type ProgramType = 'driver_education' | 'driver_training';

export interface EnrollmentPaymentSummary {
  totalPaid: number;
  outstandingBalance: number | null; // null when totalCost is not computable (no override, no lessons yet)
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overdue' | 'unknown';
}

// Small, explicit lifecycle view attached to Student.activeEnrollment - just
// the fields studentStatus.ts needs to compute a workflow status, not the
// full Enrollment shape.
export interface ActiveEnrollmentSummary {
  id: string;
  programType: ProgramType;
  status: 'active' | 'completed' | 'inactive' | 'suspended' | 'withdrawn';
  enrollmentDate: Date;
  completed: boolean;
  completionReason: string | null;
  withdrawnReason: string | null;
}

export interface Enrollment {
  id: string;
  tenantId: string;
  studentId: string;
  programType: ProgramType;
  status: 'active' | 'completed' | 'inactive' | 'suspended' | 'withdrawn';
  enrollmentDate: Date;
  hoursRequired: number;
  trackOverride: 'hours' | 'lessons' | null;
  assignedInstructorId: string | null;
  licenseType: 'car' | 'motorcycle' | 'commercial';
  totalCost: number | null;

  completed: boolean;
  completedAt: Date | null;
  completedBy: string | null;
  completionReason: string | null;

  reopenedAt: Date | null;
  reopenedBy: string | null;
  reopenedReason: string | null;

  withdrawnAt: Date | null;
  withdrawnBy: string | null;
  withdrawnReason: string | null;

  externalDeCompleted: boolean;
  externalDeCompletedDate: Date | null;
  externalDeProvider: string | null;

  manualCompletedHours: number | null;

  // driver_education only: which DMV form this enrollment resolves to.
  // Null on driver_training rows and on driver_education rows created
  // before Phase 3.
  deDeliveryMode: 'classroom' | 'online' | null;

  completionHash: string | null;
  ledgerTxid: string | null;

  progress?: StudentProgress;
  paymentSummary?: EnrollmentPaymentSummary;
  certificateExists?: boolean;
  // Was this person a minor AS OF this enrollment's completion date (not
  // today) - resolved server-side (tenant-timezone-aware); the frontend
  // never computes this boundary itself. False for a non-completed
  // enrollment.
  wasMinorAtCompletion?: boolean;
  // classroom driver_education only: which curriculum days (1-4) have been
  // attended, ACROSS ANY cohort. Undefined for driver_training and online
  // driver_education.
  classroomAttendance?: { attendedCurriculumDays: number[]; isComplete: boolean };

  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// GUARDIAN TYPES
// =====================================================

export interface Guardian {
  id: string;
  tenantId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// A guardian search result with disambiguating context - who they're
// already linked to - so a human can tell two same-name guardians apart
// before deciding to link one (Constraint B: matching never links).
export interface GuardianCandidate extends Guardian {
  linkedStudentNames: string[];
}

export type GuardianRelationship = 'mother' | 'father' | 'grandparent' | 'legal_guardian' | 'other';

export interface StudentGuardianLink {
  id: string;
  tenantId: string;
  studentId: string;
  guardianId: string;
  relationship: GuardianRelationship | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Guardian/Student fields flattened with the join row's relationship/
// isPrimary, matching GET /students/:id/guardians and
// GET /guardians/:id/students' exact return shape.
export type LinkedGuardian = Guardian & { relationship: GuardianRelationship | null; isPrimary: boolean };
export type LinkedStudent = Student & { relationship: GuardianRelationship | null; isPrimary: boolean };

export interface CreateGuardianInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export interface PersonSearchResult {
  type: 'student' | 'guardian';
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface Instructor {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth?: Date;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  // Driving School Instructor License (CA DMV) - the instructing credential,
  // not a driver's license. drivers_license_number/Expiration also exist on
  // the DB row but are intentionally not exposed here yet (see
  // docs/BLUEPRINTS.md).
  instructorLicenseNumber?: string;
  instructorLicenseExpiration?: Date;
  // Driver education classroom teacher - a DIFFERENT credential from the
  // BTW instructor license above (Phase 3).
  isDeTeacher?: boolean;
  deCredentialNumber?: string;
  deCredentialExpiration?: Date;
  certifications?: string[];
  employmentType: 'w2_employee' | 'independent_contractor';
  hireDate: Date;
  terminationDate?: Date;
  status: 'active' | 'on_leave' | 'terminated';
  hourlyRate?: number;
  googleCalendarId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Vehicle {
  id: string;
  tenantId: string;
  ownershipType: 'school_owned' | 'instructor_owned' | 'leased';
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string;
  color?: string;
  registrationExpiration: Date;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiration: Date;
  currentMileage: number;
  status: 'active' | 'maintenance' | 'retired';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lesson {
  id: string;
  tenantId: string;
  studentId: string;
  instructorId: string;
  vehicleId: string | null;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  lessonNumber?: number | null;
  lessonType: 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  cost: number;
  // Set at booking time when the student had a completed INTERNAL
  // driver_education enrollment; the amount already subtracted from
  // cost, kept for auditability.
  deDiscountApplied?: number | null;
  pickupAddress?: string | null;
  skillsPracticed?: string[] | null;
  studentPerformance?: string;
  instructorRating?: number;
  notes?: string;
  completionVerified: boolean;
  googleCalendarEventId?: string;
  bsvRecordHash?: string | null;
  codaRowId?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  tenantId: string;
  studentId: string;
  amount: number;
  paymentMethod: 'cash' | 'card' | 'stripe' | 'paypal' | 'bsv' | 'mnee';
  paymentType: 'lesson_payment' | 'package' | 'registration_fee' | 'late_fee' | 'refund';
  date: Date;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  confirmationDate?: Date;
  bsvTransactionId?: string;
  stripePaymentIntentId?: string;
  paypalOrderId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlockchainTransaction {
  id: string;
  tenantId: string;
  paymentId: string;
  transactionHash: string;
  fromAddress: string;
  toAddress: string;
  amount: number;
  currency: 'BSV' | 'MNEE';
  confirmations: number;
  blockHeight?: number;
  timestamp: Date;
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

// See backend/src/types/index.ts's Certificate for the full rationale -
// this must stay field-for-field identical to what the API returns.
export interface Certificate {
  id: string;
  tenantId: string;
  enrollmentId: string | null;

  serialNumber: string;
  formType: string;
  status: 'issued' | 'void';
  voidReason: string | null;

  issueDate: Date;
  issuedByInstructorId: string | null;
  recordedBy: string | null;

  completionHash: string | null;
  ledgerTxid: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface FollowUp {
  id: string;
  tenantId: string;
  studentId: string;
  followUpType: 'initial_contact' | 'check_in' | 'reminder' | 'post_completion';
  scheduledDate: Date;
  completedDate?: Date;
  status: 'pending' | 'completed' | 'cancelled';
  notes?: string;
  assignedTo?: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Form Input Types
export interface CreateStudentInput {
  // Required fields
  fullName: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  email?: string; // Required for adults (18+ by dateOfBirth); optional for minors

  // Contact - at least one required (student phone OR Parent/Guardian phone)
  phone?: string; // Student phone (optional - Parent/Guardian can be primary contact)
  
  // Optional fields (form order: Name → DOB → Address → Phone → Parent/Guardian → Email → Permit → Notes)
  dateOfBirth?: string;
  address?: string; // Legacy combined address field
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  pickupAddressDifferentFromHome?: boolean;
  pickupAddressLine1?: string;
  pickupAddressLine2?: string;
  pickupCity?: string;
  pickupState?: string;
  pickupZipCode?: string;

  // Parent/Guardian contact
  emergencyContactFirstName?: string; // Parent/Guardian first name
  emergencyContactLastName?: string; // Parent/Guardian last name
  emergencyContactPhone?: string; // Parent/Guardian phone
  emergencyContact2FirstName?: string; // Secondary contact first name (optional)
  emergencyContact2LastName?: string; // Secondary contact last name (optional)
  emergencyContact2Phone?: string; // Secondary contact phone (optional)
  
  // Program details (defaults applied by backend if not provided)
  hoursRequired?: number; // Default: 6 (hidden in form)
  assignedInstructorId?: string;
  
  // Learner's permit
  learnerPermitNumber?: string;
  learnerPermitIssueDate?: string;
  learnerPermitExpiration?: string;

  // Follow-up tracking
  lastContactedAt?: Date;

  notes?: string;

  // The student's first enrollment. Omitted (or driver_training) matches
  // today's default behavior exactly. driver_education creates that
  // enrollment instead of the automatic driver_training one - never both.
  initialEnrollment?:
    | { programType: 'driver_training' }
    | { programType: 'driver_education'; deDeliveryMode: 'classroom' | 'online' };
}

export type CreateStudentWithGuardianEntry =
  | { mode: 'existing'; guardianId: string; relationship?: GuardianRelationship; isPrimary?: boolean }
  | { mode: 'new'; firstName?: string; lastName?: string; email?: string; phone?: string; relationship?: GuardianRelationship; isPrimary?: boolean };

export interface CreateStudentWithGuardianInput {
  student: CreateStudentInput;
  guardians: CreateStudentWithGuardianEntry[]; // 1..N
}

export interface CreateInstructorInput {
  fullName: string;
  // Frontend-only convenience fields - instructors has no first/last/middle
  // name columns, these are joined into fullName before the API call.
  firstName?: string;
  middleName?: string;
  lastName?: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  address?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  instructorLicenseNumber?: string;
  instructorLicenseExpiration?: string;
  isDeTeacher?: boolean;
  deCredentialNumber?: string;
  deCredentialExpiration?: string;
  certifications?: string[];
  employmentType?: 'w2_employee' | 'independent_contractor';
  hireDate?: string;
  hourlyRate?: number;
  googleCalendarId?: string;
  notes?: string;
}

export interface CreateVehicleInput {
  ownershipType?: 'school_owned' | 'instructor_owned' | 'leased';
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin?: string;
  color?: string;
  registrationExpiration: string;
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiration: string;
  currentMileage?: number;
  notes?: string;
}

export interface CreateLessonInput {
  studentId: string;
  instructorId: string;
  vehicleId?: string | null;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
  lessonNumber?: number | null;
  lessonType?: 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
  cost?: number;
  pickupAddress?: string | null;
  notes?: string;
}

export interface CreatePaymentInput {
  studentId: string;
  amount: number;
  paymentMethod?: 'cash' | 'card' | 'stripe' | 'paypal' | 'bsv' | 'mnee';
  paymentType?: 'lesson_payment' | 'package' | 'registration_fee' | 'late_fee' | 'refund';
  date?: string;
  status?: 'pending' | 'confirmed' | 'failed' | 'refunded';
  bsvTransactionId?: string;
  notes?: string;
}

// ===================================================================
// PHASE 4A: SCHEDULING & AVAILABILITY TYPES
// ===================================================================

export interface InstructorAvailability {
  id: string;
  tenantId: string;
  instructorId: string;
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  startTime: string; // HH:MM format
  endTime: string; // HH:MM format
  maxStudents: number | null; // Override for max students (null = use tenant default)
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstructorTimeOff {
  id: string;
  tenantId: string;
  instructorId: string;
  startDate: Date;
  endDate: Date;
  startTime: string | null; // HH:MM:SS format (null = all day)
  endTime: string | null; // HH:MM:SS format (null = all day)
  reason: string;
  notes: string | null;
  isApproved: boolean;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SchedulingSettings {
  id: string;
  tenantId: string;
  defaultBufferMinutes: number;
  minimumNoticeHours: number;
  maxAdvanceBookingDays: number;
  allowDoubleBooking: boolean;
  businessHoursStart: string; // HH:MM format
  businessHoursEnd: string; // HH:MM format
  createdAt: Date;
  updatedAt: Date;
}

export interface TimeSlot {
  date: string; // YYYY-MM-DD
  startTime: string; // ISO 8601 datetime (UTC instant) - never parse this with new Date().getHours(), use startTimeLocal
  endTime: string; // ISO 8601 datetime (UTC instant) - never parse this with new Date().getHours(), use endTimeLocal
  startTimeLocal: string; // Tenant wall-clock "HH:MM" - use directly
  endTimeLocal: string; // Tenant wall-clock "HH:MM" - use directly
  instructorId: string;
  vehicleId?: string;
  available: boolean;
  conflictReason?: string;
}

export interface SchedulingConflict {
  type: 'instructor_busy' | 'vehicle_busy' | 'student_busy' | 'outside_working_hours' | 'time_off' | 'buffer_violation' | 'capacity_reached' | 'student_daily_limit';
  message: string;
  conflictingLessonId?: string;
  timeOffId?: string;
}

export interface RankedTimeSlot extends TimeSlot {
  proximityScore: number;
  instructorName: string;
  instructorZip: string | null;
  comingFrom: 'home' | 'lesson';
  // true when this slot only appears because the search found zero
  // in-service-area results and fell back to every candidate instructor -
  // never affects sort order, only which group it renders under.
  outsideServiceArea: boolean;
}

// Form Input Types for Phase 4A
export interface CreateAvailabilityInput {
  instructorId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  maxStudents?: number | null; // Override for max students (null = use tenant default)
  isActive?: boolean;
}

// One entry per day of week (0-6), for the weekly availability grid's
// bulk save. startTime/endTime/maxStudents are only meaningful (and only
// sent) when isActive is true.
export interface WeekDayAvailabilityInput {
  dayOfWeek: number;
  isActive: boolean;
  startTime?: string;
  endTime?: string;
  maxStudents?: number | null;
}

export interface CreateTimeOffInput {
  instructorId: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  reason: string;
  notes?: string;
  isApproved?: boolean;
}

export interface FindSlotsRequest {
  instructorId: string;
  startDate: string;
  endDate: string;
  duration: number;
  vehicleId?: string;
  studentId?: string;
}

export interface CheckConflictsRequest {
  instructorId: string;
  vehicleId: string;
  studentId: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface FindRankedSlotsRequest {
  studentId: string;
  pickupZip: string;
  duration: number;
  // Search window, as YYYY-MM-DD strings in the tenant's timezone. Both
  // optional - the backend applies its own default (tomorrow through 13
  // days later) when omitted. Always sourced from a DatePresetsResponse or
  // raw user keystrokes into a date input - never computed client-side.
  startDate?: string;
  endDate?: string;
  timePreference?: 'any' | 'morning' | 'afternoon' | 'evening';
  instructorId?: string;
}

export interface FindRankedSlotsResult {
  slots: RankedTimeSlot[];
  failedInstructors: string[];
}

// A date range as YYYY-MM-DD strings, always server-computed in the
// tenant's timezone (backend/src/utils/tenantTime.ts) - the frontend only
// ever displays these values, never derives them itself.
export interface DateRangeBoundary {
  start: string;
  end: string;
}

export interface DatePresetsResponse {
  next2Weeks: DateRangeBoundary;
  thisMonth: DateRangeBoundary;
  nextMonth: DateRangeBoundary;
}
