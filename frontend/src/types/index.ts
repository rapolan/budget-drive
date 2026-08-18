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
  // Public profile settings
  publicProfileEnabled: boolean;
  publicSlug?: string;
  publicDescription?: string;
  publicPhotoUrl?: string;
  publicBookingEnabled: boolean;
  publicShowRates: boolean;
  publicRequirePaymentUpfront: boolean;
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
  emergencyContactFirstName?: string; // Parent/Guardian first name
  emergencyContactLastName?: string; // Parent/Guardian last name
  emergencyContactPhone?: string; // Parent/Guardian phone
  emergencyContact2FirstName?: string; // Secondary contact first name
  emergencyContact2LastName?: string; // Secondary contact last name
  emergencyContact2Phone?: string; // Secondary contact phone
  learnerPermitNumber?: string;
  learnerPermitIssueDate?: Date;
  learnerPermitExpiration?: Date;
  status: 'enrolled' | 'active' | 'completed' | 'dropped' | 'suspended' | 'permit_expired';
  enrollmentDate: Date;
  completionDate?: Date;
  totalHoursCompleted: number; // Legacy/cache column - do not read for display, see Student.progress
  hoursRequired?: number; // Default: 6 (hidden in form)
  progress?: StudentProgress; // Attached by the backend - the single source of truth for display
  needsGuardian?: boolean; // Attached by the backend - true only for minors with zero linked guardians
  assignedInstructorId?: string;
  trackOverride?: 'hours' | 'lessons' | null;
  completed?: boolean;
  completedAt?: Date | null;
  completedBy?: string | null;
  completionReason?: string | null;
  paymentStatus?: 'paid' | 'partial' | 'unpaid' | 'overdue';
  totalPaid?: number;
  outstandingBalance?: number;
  lastContactedAt?: Date;  // Timestamp of last contact attempt for follow-up
  notes?: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
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
  homeZipCode?: string; // Instructor's home base ZIP code (used for proximity matching)
  serviceZipCodes?: string; // Comma-separated ZIP codes or prefixes instructor serves (e.g., "90001,90002" or "920,921")
  licenseNumber?: string;
  licenseExpiration?: Date;
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

export interface Certificate {
  id: string;
  tenantId: string;
  studentId: string;
  certificateNumber: string;
  issueDate: Date;
  certificateType: 'completion' | 'attendance' | 'behind_wheel_hours';
  hoursCompleted?: number;
  issuedBy: string;
  pdfUrl?: string;
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
  homeZipCode?: string; // Instructor's home base ZIP code
  serviceZipCodes?: string; // Comma-separated ZIP codes or prefixes
  licenseNumber?: string;
  licenseExpiration?: string;
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

// ===================================================================
// REFERRAL SYSTEM TYPES
// ===================================================================

export type ReferralSourceType = 'student' | 'instructor' | 'partner_school' | 'affiliate' | 'employee' | 'custom';
export type ReferralRewardType = 'credit' | 'cash' | 'free_lesson' | 'percentage' | 'commission';
export type ReferralRecipientType = 'referrer' | 'referee' | 'both';
export type ReferralStatus = 'pending' | 'converted' | 'qualified' | 'rewarded' | 'expired' | 'cancelled';
export type RewardStatus = 'pending' | 'active' | 'partially_used' | 'fully_used' | 'paid_out' | 'expired' | 'cancelled';

export interface ReferralSource {
  id: string;
  tenantId: string;
  name: string;
  sourceType: ReferralSourceType;
  referringStudentId?: string;
  referringInstructorId?: string;
  referralCode?: string;
  isActive: boolean;
  totalReferrals: number;
  successfulConversions: number;
  totalRewardsPaid: number;
  totalCommissionsPaid: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  referringStudentName?: string;
  referringInstructorName?: string;
}

export interface ReferralRewardConfig {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  rewardType: ReferralRewardType;
  recipientType: ReferralRecipientType;
  referrerRewardAmount?: number;
  referrerRewardPercentage?: number;
  refereeRewardAmount?: number;
  refereeRewardPercentage?: number;
  commissionDurationMonths?: number;
  commissionMaxAmount?: number;
  minPurchaseAmount?: number;
  maxRewardsPerReferrer?: number;
  requiresCompletion: boolean;
  isActive: boolean;
  validFrom?: Date;
  validUntil?: Date;
  totalBudget?: number;
  totalSpent: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Referral {
  id: string;
  tenantId: string;
  referralSourceId: string;
  rewardConfigId?: string;
  referredStudentId?: string;
  referredLeadId?: string;
  status: ReferralStatus;
  referralCodeUsed?: string;
  referralDate: Date;
  conversionDate?: Date;
  qualificationDate?: Date;
  firstLessonId?: string;
  firstPaymentId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  referredStudentName?: string;
  sourceName?: string;
}

export interface ReferralReward {
  id: string;
  tenantId: string;
  referralId: string;
  recipientType: 'referrer' | 'referee';
  recipientStudentId?: string;
  recipientInstructorId?: string;
  rewardType: ReferralRewardType;
  amount: number;
  creditBalanceRemaining?: number;
  expiresAt?: Date;
  status: RewardStatus;
  totalUsed: number;
  payoutMethod?: 'check' | 'bank_transfer' | 'paypal' | 'bsv' | 'credit_applied';
  payoutDate?: Date;
  payoutReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  // Joined fields
  recipientName?: string;
}

// Form inputs for referral system
export interface CreateReferralSourceInput {
  name: string;
  sourceType: ReferralSourceType;
  referringStudentId?: string;
  referringInstructorId?: string;
  referralCode?: string;
  notes?: string;
}

export interface CreateReferralRewardConfigInput {
  name: string;
  description?: string;
  rewardType: ReferralRewardType;
  recipientType: ReferralRecipientType;
  referrerRewardAmount?: number;
  referrerRewardPercentage?: number;
  refereeRewardAmount?: number;
  refereeRewardPercentage?: number;
  commissionDurationMonths?: number;
  commissionMaxAmount?: number;
  minPurchaseAmount?: number;
  maxRewardsPerReferrer?: number;
  requiresCompletion?: boolean;
  validFrom?: string;
  validUntil?: string;
  totalBudget?: number;
}

export interface CreateReferralInput {
  referralSourceId: string;
  rewardConfigId?: string;
  referredStudentId?: string;
  referredLeadId?: string;
  referralCodeUsed?: string;
  notes?: string;
}
