/**
 * Application Constants
 * Centralized constants for the Budget Drive Protocol backend
 */

/**
 * Budget Drive Protocol (BDP) Fee Structure
 * Based on BDP_VISION_AND_PHILOSOPHY.md
 */
export const BDP_FEES = {
  /** Fee per lesson booking (5 satoshis) */
  LESSON_BOOKING: 5,

  /** Fee per notification sent (1 satoshi) */
  NOTIFICATION: 1,

  /** Fee per certificate issuance (10 satoshis) */
  CERTIFICATE: 10,

  /** Fee per background check (100 satoshis) */
  BACKGROUND_CHECK: 100,

  /** Fee per insurance verification (50 satoshis) */
  INSURANCE_VERIFICATION: 50,

  /** Fee per Google Calendar sync event (2 satoshis) */
  CALENDAR_SYNC: 2,
} as const;

/**
 * Scheduling & Availability Constants
 */
export const SCHEDULING = {
  /** Buffer time between lessons in minutes (default: 30) */
  BUFFER_TIME_MINUTES: 30,

  /** Default working hours start time */
  DEFAULT_WORKING_HOURS_START: '08:00',

  /** Default working hours end time */
  DEFAULT_WORKING_HOURS_END: '18:00',

  /** Maximum days in advance for scheduling */
  MAX_DAYS_ADVANCE: 90,

  /** Minimum hours before lesson can be cancelled */
  MIN_CANCELLATION_HOURS: 24,
} as const;

/**
 * Pagination Constants
 */
export const PAGINATION = {
  /** Default page size for API queries */
  DEFAULT_PAGE_SIZE: 50,

  /** Maximum page size allowed */
  MAX_PAGE_SIZE: 1000,

  /** Minimum page size */
  MIN_PAGE_SIZE: 1,
} as const;

/**
 * Notification Constants
 */
export const NOTIFICATIONS = {
  /** Hours before lesson to send reminder (24 hours) */
  REMINDER_24H_HOURS: 24,

  /** Hours before lesson to send reminder (1 hour) */
  REMINDER_1H_HOURS: 1,

  /** Maximum retry attempts for failed notifications */
  MAX_RETRY_ATTEMPTS: 3,

  /** Retry delay in milliseconds */
  RETRY_DELAY_MS: 5000,
} as const;

/**
 * Treasury Constants
 */
export const TREASURY = {
  /** Minimum balance threshold for alerts (in satoshis) */
  MIN_BALANCE_ALERT: 1000,

  /** Maximum transactions to return in history */
  MAX_TRANSACTION_HISTORY: 50,
} as const;

/**
 * Lesson Duration Constants (in hours)
 */
export const LESSON_DURATION = {
  /** Standard lesson duration */
  STANDARD: 1,

  /** Extended lesson duration */
  EXTENDED: 2,

  /** Highway lesson duration */
  HIGHWAY: 3,
} as const;

/**
 * Student Status Constants
 */
export const STUDENT_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  DROPPED: 'dropped',
  SUSPENDED: 'suspended',
} as const;

/**
 * Lesson Status Constants
 */
export const LESSON_STATUS = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no-show',
} as const;

/**
 * Payment Status Constants
 */
export const PAYMENT_STATUS = {
  PAID: 'paid',
  PARTIAL: 'partial',
  UNPAID: 'unpaid',
  OVERDUE: 'overdue',
} as const;

/**
 * License Type Constants
 */
export const LICENSE_TYPE = {
  CAR: 'car',
  MOTORCYCLE: 'motorcycle',
  COMMERCIAL: 'commercial',
} as const;

/**
 * Vehicle Type Constants
 */
export const VEHICLE_TYPE = {
  CAR: 'car',
  MOTORCYCLE: 'motorcycle',
  TRUCK: 'truck',
} as const;

/**
 * Time Off Status Constants
 */
export const TIME_OFF_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

/**
 * Notification Status Constants
 */
export const NOTIFICATION_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
} as const;

/**
 * Validation Constants
 */
export const VALIDATION = {
  /** Minimum age for students (in years) */
  MIN_STUDENT_AGE: 15,

  /** Maximum age for students (in years) */
  MAX_STUDENT_AGE: 120,

  /** Minimum password length */
  MIN_PASSWORD_LENGTH: 8,

  /** Maximum password length */
  MAX_PASSWORD_LENGTH: 128,

  /** Phone number regex pattern */
  PHONE_PATTERN: /^\+?[\d\s\-\(\)]+$/,

  /** Email regex pattern (basic) */
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;
