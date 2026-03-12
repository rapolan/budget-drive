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

export interface TenantSettings {
  id: string;
  tenantId: string;
  tagline?: string;
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  contactEmail?: string;
  contactPhone?: string;
  websiteUrl?: string;
  businessAddress?: string;
  timezone: string;
  currency: string;
  language: string;
  defaultHoursRequired: number; // State-specific training hours requirement
  enableBlockchainPayments: boolean;
  enableGoogleCalendar: boolean;
  enableCertificates: boolean;
  enableFollowUpTracker: boolean;
  // Independent instructor specific fields
  independentInstructorId?: string;
  acceptsNewStudents: boolean;
  serviceAreaDescription?: string;
  serviceAreaRadiusMiles?: number;
  serviceZipCodes?: string[];
  specializations?: string[];
  languagesSpoken: string[];
  yearsExperience?: number;
  bio?: string;
  teachingPhilosophy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Student {
  id: string;
  tenantId: string;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  email: string;
  phone?: string | null; // Student phone (optional - Parent/Guardian can be primary contact)
  dateOfBirth?: Date;
  address?: string; // Legacy combined address field
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  emergencyContact?: string; // Legacy field - deprecated in favor of split fields
  emergencyContactName?: string; // Parent/Guardian name
  emergencyContactPhone?: string; // Parent/Guardian phone
  emergencyContact2Name?: string; // Secondary contact name
  emergencyContact2Phone?: string; // Secondary contact phone
  learnerPermitNumber?: string;
  learnerPermitIssueDate?: Date;
  learnerPermitExpiration?: Date;
  status: 'enrolled' | 'active' | 'completed' | 'dropped' | 'suspended' | 'permit_expired';
  enrollmentDate: Date;
  completionDate?: Date;
  totalHoursCompleted: number;
  hoursRequired?: number; // Default: 6 (hidden in form)
  assignedInstructorId?: string;
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
  employmentType: 'w2_employee' | '1099_contractor' | 'volunteer';
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
  email: string;
  
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
  emergencyContact?: string; // Legacy field - kept for backward compatibility
  emergencyContactName?: string; // Parent/Guardian name
  emergencyContactPhone?: string; // Parent/Guardian phone
  emergencyContact2Name?: string; // Secondary contact name (optional)
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

export interface CreateInstructorInput {
  fullName: string;
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
  employmentType?: 'w2_employee' | '1099_contractor' | 'volunteer';
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
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  instructorId: string;
  vehicleId?: string;
  available: boolean;
  conflictReason?: string;
}

export interface SchedulingConflict {
  type: 'instructor_busy' | 'vehicle_busy' | 'student_busy' | 'outside_working_hours' | 'time_off' | 'buffer_violation';
  message: string;
  conflictingLessonId?: string;
  timeOffId?: string;
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
