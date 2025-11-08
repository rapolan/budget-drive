// Core API Types matching backend schema

export interface Tenant {
  id: string;
  businessName: string;
  subdomain: string;
  planTier: 'basic' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'trial';
  trialEndsAt?: Date;
  createdAt: Date;
  updatedAt: Date;
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
  enableBlockchainPayments: boolean;
  enableGoogleCalendar: boolean;
  enableCertificates: boolean;
  enableFollowUpTracker: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Student {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth?: Date;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  learnerPermitNumber?: string;
  learnerPermitExpiration?: Date;
  status: 'active' | 'completed' | 'dropped' | 'suspended';
  enrollmentDate: Date;
  completionDate?: Date;
  totalHoursCompleted: number;
  notes?: string;
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
  vehicleId: string;
  date: Date;
  startTime: string;
  endTime: string;
  duration: number;
  lessonType: 'behind_wheel' | 'classroom' | 'observation' | 'road_test';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  cost: number;
  studentPerformance?: string;
  instructorRating?: number;
  notes?: string;
  completionVerified: boolean;
  googleCalendarEventId?: string;
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
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  learnerPermitNumber?: string;
  learnerPermitExpiration?: string;
  notes?: string;
}

export interface CreateInstructorInput {
  fullName: string;
  email: string;
  phone: string;
  dateOfBirth?: string;
  address?: string;
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
  vehicleId: string;
  date: string;
  startTime: string;
  endTime: string;
  duration: number;
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
  reason?: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: Date;
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
  isActive?: boolean;
}

export interface CreateTimeOffInput {
  instructorId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status?: 'pending' | 'approved' | 'rejected';
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
