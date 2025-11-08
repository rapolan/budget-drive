/**
 * Budget Driving School - TypeScript Type Definitions
 * Complete type safety for multi-tenant driving school management
 */

// =====================================================
// TENANT SYSTEM TYPES
// =====================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  email: string;
  phone: string | null;
  status: 'active' | 'suspended' | 'cancelled' | 'trial';
  planTier: 'basic' | 'professional' | 'enterprise';
  trialEndsAt: Date | null;
  subscriptionStartsAt: Date | null;
  subscriptionEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantSettings {
  id: string;
  tenantId: string;

  // Branding
  businessName: string;
  businessTagline: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;

  // Contact
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string;
  supportEmail: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  businessHours: BusinessHours;

  // Features
  enableBlockchain: boolean;
  enableGoogleCalendar: boolean;
  enableAppleCalendar: boolean;
  enableCertificates: boolean;
  enableMultiPayment: boolean;
  enableFollowUpTracker: boolean;
  enableStudentPortal: boolean;
  enableInstructorPortal: boolean;
  enableSmsNotifications: boolean;
  enableEmailNotifications: boolean;

  // Localization
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  currencyCode: string;
  currencySymbol: string;
  language: string;

  // UI
  dashboardWidgets: DashboardWidget[];

  // Legal
  termsOfServiceUrl: string | null;
  privacyPolicyUrl: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

export interface DayHours {
  open: string;
  close: string;
  closed: boolean;
}

export interface DashboardWidget {
  id: string;
  order: number;
  enabled: boolean;
}

export interface TenantFullInfo extends Tenant {
  settings: TenantSettings;
}

// =====================================================
// USER & INSTRUCTOR TYPES
// =====================================================

export interface Instructor {
  id: string;
  tenantId: string;

  // Personal
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: Date | null;
  address: string | null;

  // Employment
  employmentType: 'w2_employee' | 'independent_contractor';
  hireDate: Date;
  terminationDate: Date | null;
  status: 'active' | 'inactive' | 'on_leave' | 'terminated';

  // Licenses
  driversLicenseNumber: string | null;
  driversLicenseExpiration: Date | null;
  instructorLicenseNumber: string | null;
  instructorLicenseExpiration: Date | null;

  // Vehicle & Mileage
  providesOwnVehicle: boolean;
  mileageReimbursementRate: number;

  // Availability
  availability: any; // JSONB
  hourlyRate: number | null;

  // Performance
  rating: number | null;
  totalLessonsTaught: number;

  // Calendar
  googleCalendarConnected: boolean;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InstructorCertification {
  id: string;
  instructorId: string;
  certificationType: 'drivers_license' | 'instructor_license' | 'cpr' | 'first_aid' | 'defensive_driving' | 'other';
  certificationNumber: string | null;
  issueDate: Date;
  expirationDate: Date;
  issuingAuthority: string | null;
  documentUrl: string | null;
  status: 'valid' | 'expired' | 'pending_renewal' | 'revoked';
  reminderSent: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// STUDENT TYPES
// =====================================================

export interface Student {
  id: string;
  tenantId: string;

  // Personal
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  address: string;
  emergencyContact: string;

  // Program
  licenseType: 'car' | 'motorcycle' | 'commercial';
  enrollmentDate: Date;
  status: 'active' | 'completed' | 'inactive' | 'suspended';

  // Progress
  totalHoursCompleted: number;
  hoursRequired: number;
  assignedInstructorId: string | null;

  // Financial
  paymentStatus: 'paid' | 'partial' | 'unpaid' | 'overdue';
  totalPaid: number;
  outstandingBalance: number;

  // Blockchain
  bsvCertificateHash: string | null;
  codaRowId: string | null;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// LEAD & FOLLOW-UP TYPES
// =====================================================

export interface Lead {
  id: string;
  tenantId: string;

  // Contact
  fullName: string;
  email: string | null;
  phone: string;

  // Qualification
  source: 'website' | 'referral' | 'google_ads' | 'facebook' | 'instagram' | 'walk_in' | 'phone' | 'other' | null;
  status: 'new' | 'contacted' | 'interested' | 'enrolled' | 'lost';
  interestLevel: 'hot' | 'warm' | 'cold' | null;
  preferredContactMethod: 'email' | 'phone' | 'sms' | 'any' | null;

  // Assignment
  assignedToInstructorId: string | null;
  firstContactDate: Date | null;
  lastContactDate: Date | null;
  nextFollowUpDate: Date | null;

  // Conversion
  convertedToStudentId: string | null;
  conversionDate: Date | null;
  lostReason: string | null;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowUp {
  id: string;
  tenantId: string;

  // Polymorphic relationship
  entityType: 'lead' | 'student' | 'inactive_student';
  leadId: string | null;
  studentId: string | null;

  // Assignment
  assignedTo: string | null;

  // Details
  followUpType: 'call' | 'email' | 'sms' | 'in_person' | null;
  status: 'pending' | 'completed' | 'skipped' | 'rescheduled';

  // Scheduling
  scheduledDate: Date;
  completedDate: Date | null;

  // Outcome
  outcome: 'enrolled' | 'still_interested' | 'not_interested' | 'no_response' | 'callback_requested' | null;
  notes: string | null;
  nextFollowUpDate: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// VEHICLE TYPES
// =====================================================

export interface Vehicle {
  id: string;
  tenantId: string;

  // Ownership
  ownershipType: 'school_owned' | 'instructor_owned' | 'leased';
  ownerInstructorId: string | null;

  // Details
  make: string;
  model: string;
  year: number;
  color: string | null;
  licensePlate: string;
  vin: string | null;

  // Registration & Insurance
  registrationExpiration: Date;
  insuranceProvider: string | null;
  insurancePolicyNumber: string | null;
  insuranceExpiration: Date;

  // DMV Compliance
  dmvInspectionDate: Date | null;
  dmvInspectionExpiration: Date | null;
  hasDualControls: boolean;

  // Operational
  currentMileage: number;
  status: 'active' | 'maintenance' | 'inactive' | 'retired';

  // Maintenance
  lastOilChangeMileage: number | null;
  nextOilChangeMileage: number | null;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleMaintenance {
  id: string;
  tenantId: string;
  vehicleId: string;

  maintenanceType: 'oil_change' | 'tire_rotation' | 'brake_service' | 'inspection' | 'repair' | 'other' | null;
  serviceDate: Date;
  mileageAtService: number;

  cost: number;
  vendor: string | null;

  nextServiceDate: Date | null;
  nextServiceMileage: number | null;

  description: string | null;
  receiptUrl: string | null;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface VehicleMileageLog {
  id: string;
  tenantId: string;
  vehicleId: string;
  instructorId: string;

  // Trip details
  tripDate: Date;
  startTime: string | null;
  endTime: string | null;

  // Mileage
  startingOdometer: number;
  endingOdometer: number;
  totalMiles: number; // Computed column

  // Purpose
  lessonId: string | null;
  purpose: 'lesson' | 'pickup_student' | 'vehicle_maintenance' | 'administrative' | 'other' | null;

  // Reimbursement
  reimbursementRate: number | null;
  reimbursementAmount: number; // Computed column
  reimbursementStatus: 'pending' | 'approved' | 'paid' | 'not_applicable';
  paidInPayrollId: string | null;

  // Location
  startLocationAddress: string | null;
  endLocationAddress: string | null;
  routeNotes: string | null;

  // Photos
  odometerPhotoStartUrl: string | null;
  odometerPhotoEndUrl: string | null;

  // Verification
  submittedByInstructorAt: Date | null;
  approvedByAdminId: string | null;
  approvedAt: Date | null;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MileageReimbursementReport {
  id: string;
  tenantId: string;
  instructorId: string;

  // Period
  periodStart: Date;
  periodEnd: Date;

  // Totals
  totalTrips: number;
  totalMiles: number;
  averageRate: number;
  totalReimbursement: number;

  // Status
  status: 'draft' | 'submitted' | 'approved' | 'paid' | 'disputed';

  // Workflow
  submittedByInstructorAt: Date | null;
  reviewedByAdminId: string | null;
  approvedAt: Date | null;
  paidDate: Date | null;
  paidInPayrollId: string | null;

  reportPdfUrl: string | null;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// LESSON TYPES
// =====================================================

export interface Lesson {
  id: string;
  tenantId: string;
  studentId: string;
  instructorId: string;
  vehicleId: string;

  // Scheduling
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;

  // Details
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  lessonType: 'behind_wheel' | 'classroom' | 'road_test_prep';
  skillsPracticed: string[] | null;

  // Performance
  studentPerformance: 'excellent' | 'good' | 'needs_improvement' | 'poor' | null;
  instructorRating: number | null;
  notes: string | null;
  completionVerified: boolean;

  // Financial
  cost: number;

  // Blockchain
  bsvRecordHash: string | null;
  codaRowId: string | null;

  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// FINANCIAL TYPES
// =====================================================

export interface Payment {
  id: string;
  tenantId: string;
  studentId: string;

  date: Date;
  amount: number;
  paymentMethod: 'bsv' | 'mnee' | 'stripe_card' | 'paypal' | 'cash' | 'check' | 'debit' | 'credit';
  paymentType: string;

  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  confirmationDate: Date | null;

  relatedLessonIds: string[] | null;
  invoiceId: string | null;

  bsvTransactionId: string | null;

  receiptSent: boolean;
  receiptUrl: string | null;
  notes: string | null;

  codaRowId: string | null;

  createdAt: Date;
  updatedAt: Date;
}

export interface Invoice {
  id: string;
  tenantId: string;
  studentId: string;

  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;

  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  discountReason: string | null;
  totalAmount: number;
  amountPaid: number;
  balanceDue: number;

  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
  paymentTerms: 'due_on_receipt' | 'net_15' | 'net_30' | 'net_60';

  sentAt: Date | null;
  paidAt: Date | null;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InvoiceLineItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  lessonIds: string[] | null;
  createdAt: Date;
}

export interface PaymentPlan {
  id: string;
  tenantId: string;
  studentId: string;

  totalAmount: number;
  downPayment: number;
  numInstallments: number;
  installmentAmount: number;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';

  startDate: Date;
  nextDueDate: Date | null;

  status: 'active' | 'completed' | 'defaulted' | 'cancelled';

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Installment {
  id: string;
  paymentPlanId: string;

  installmentNumber: number;
  dueDate: Date;
  amountDue: number;
  amountPaid: number;

  status: 'pending' | 'paid' | 'late' | 'waived';
  paidDate: Date | null;
  paymentId: string | null;
  lateFee: number;

  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// BLOCKCHAIN & CERTIFICATE TYPES
// =====================================================

export interface BlockchainRecord {
  id: string;
  tenantId: string;

  transactionType: 'payment' | 'certificate' | 'lesson_record' | null;
  transactionHash: string;
  blockchain: 'bsv' | 'mnee';

  paymentId: string | null;
  certificateId: string | null;
  lessonId: string | null;

  amount: number | null;
  dataPayload: any; // JSONB

  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  confirmedAt: Date | null;

  createdAt: Date;
}

export interface Certificate {
  id: string;
  tenantId: string;
  studentId: string;

  certificateNumber: string;
  issueDate: Date;
  certificateType: 'completion' | 'achievement' | 'hours_milestone' | 'test_passed' | null;

  title: string;
  description: string | null;
  hoursCompleted: number | null;

  pdfUrl: string | null;
  imageUrl: string | null;

  blockchainHash: string | null;
  blockchainVerified: boolean;

  issuedBy: string | null;
  sentToStudent: boolean;
  sentAt: Date | null;

  notes: string | null;
  createdAt: Date;
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

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

// =====================================================
// DTO (Data Transfer Object) TYPES
// =====================================================

export interface CreateStudentDTO {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth: Date;
  address: string;
  emergencyContact: string;
  licenseType: 'car' | 'motorcycle' | 'commercial';
  hoursRequired: number;
  assignedInstructorId?: string;
}

export interface UpdateStudentDTO {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  emergencyContact?: string;
  status?: 'active' | 'completed' | 'inactive' | 'suspended';
  assignedInstructorId?: string;
  notes?: string;
}

export interface CreateInstructorDTO {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth?: Date;
  address?: string;
  employmentType: 'w2_employee' | 'independent_contractor';
  hireDate: Date;
  driversLicenseNumber?: string;
  driversLicenseExpiration?: Date;
  instructorLicenseNumber?: string;
  instructorLicenseExpiration?: Date;
  providesOwnVehicle?: boolean;
  hourlyRate?: number;
}

export interface UpdateInstructorDTO {
  fullName?: string;
  email?: string;
  phone?: string;
  address?: string;
  status?: 'active' | 'inactive' | 'on_leave' | 'terminated';
  providesOwnVehicle?: boolean;
  mileageReimbursementRate?: number;
  hourlyRate?: number;
  notes?: string;
}

export interface CreateLessonDTO {
  studentId: string;
  instructorId: string;
  vehicleId: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  lessonType: 'behind_wheel' | 'classroom' | 'road_test_prep';
  cost: number;
}

export interface UpdateTenantSettingsDTO {
  businessName?: string;
  businessTagline?: string;
  logoUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  supportEmail?: string;
  supportPhone?: string;
  websiteUrl?: string;
  enableBlockchain?: boolean;
  enableGoogleCalendar?: boolean;
  enableCertificates?: boolean;
  enableMultiPayment?: boolean;
  timezone?: string;
  currencyCode?: string;
  currencySymbol?: string;
}

// =====================================================
// SCHEDULING & AVAILABILITY TYPES
// =====================================================

export interface InstructorAvailability {
  id: string;
  tenantId: string;
  instructorId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // HH:MM:SS format
  endTime: string; // HH:MM:SS format
  isActive: boolean;
  notes: string | null;
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
  reason: 'vacation' | 'sick' | 'personal' | 'training' | 'other';
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
  bufferTimeBetweenLessons: number; // minutes
  bufferTimeBeforeFirstLesson: number; // minutes
  bufferTimeAfterLastLesson: number; // minutes
  minHoursAdvanceBooking: number; // hours
  maxDaysAdvanceBooking: number; // days
  defaultLessonDuration: number; // minutes
  allowBackToBackLessons: boolean;
  defaultWorkStartTime: string; // HH:MM:SS format
  defaultWorkEndTime: string; // HH:MM:SS format
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationQueue {
  id: string;
  tenantId: string;
  notificationType: 'lesson_reminder_24h' | 'lesson_reminder_1h' | 'lesson_booked' | 'lesson_cancelled';
  recipientType: 'student' | 'instructor' | 'admin';
  recipientId: string;
  sendEmail: boolean;
  sendSms: boolean;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string;
  lessonId: string | null;
  scheduledFor: Date;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sentAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Available time slot for booking
export interface TimeSlot {
  startTime: string; // ISO 8601 datetime
  endTime: string; // ISO 8601 datetime
  instructorId: string;
  vehicleId: string | null;
  duration: number; // minutes
}

// Request to find available slots
export interface AvailabilityRequest {
  tenantId: string;
  instructorId?: string; // Optional: specific instructor or any available
  vehicleId?: string; // Optional: specific vehicle or any available
  startDate: Date;
  endDate: Date;
  duration: number; // minutes
  studentId?: string; // Optional: for checking if student has conflicts
}

// Conflict detection result
export interface SchedulingConflict {
  type: 'instructor_busy' | 'vehicle_busy' | 'student_busy' | 'outside_working_hours' | 'time_off' | 'buffer_violation';
  message: string;
  conflictingLessonId?: string;
  conflictingTimeOffId?: string;
}
