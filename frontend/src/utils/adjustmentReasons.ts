import type { AdjustmentReasonCode } from '@/types';

// Fixed reason list, shared by the refund dialog, void dialog, history
// list, and receipt - one label map so the wording can't drift between
// surfaces. Matches the backend's own CHECK-constrained reason_code set
// exactly (migration 007_payment_adjustments.sql).
export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReasonCode, string> = {
  duplicate_payment: 'Duplicate payment',
  entered_in_error: 'Entered by mistake',
  wrong_student: 'Wrong student',
  lesson_cancelled: 'Lesson cancelled',
  overpaid: 'Overpaid',
  student_withdrew: 'Student withdrew',
  other: 'Other',
};

export const ADJUSTMENT_REASON_CODES: AdjustmentReasonCode[] = [
  'duplicate_payment',
  'entered_in_error',
  'wrong_student',
  'lesson_cancelled',
  'overpaid',
  'student_withdrew',
  'other',
];
