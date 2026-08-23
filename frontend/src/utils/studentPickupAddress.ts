import type { Student } from '@/types';

// One source of truth for "what address does the booking wizard default
// to for this student" - reused by SmartBookingForm's preselected-student
// effect and SetupStep's student-picker dropdown, so they can't diverge.
// A student's own designated pickup address (pickupAddressDifferentFromHome)
// takes priority over their home address when set; the caller (SmartBookingForm)
// still layers "Book again"'s prefilledPickupAddress - the most recent
// lesson's actual pickup point - above whatever this returns, since a past
// lesson's specific location is more relevant to a repeat booking than
// either general default.
export function resolveStudentPickupAddress(student: Student): string {
  if (student.pickupAddressDifferentFromHome && student.pickupAddressLine1) {
    return [
      student.pickupAddressLine1,
      student.pickupAddressLine2,
      student.pickupCity && student.pickupState
        ? `${student.pickupCity}, ${student.pickupState}`
        : student.pickupCity || student.pickupState,
      student.pickupZipCode,
    ].filter(Boolean).join(', ');
  }

  if (student.addressLine1) {
    return [
      student.addressLine1,
      student.addressLine2,
      student.city && student.state ? `${student.city}, ${student.state}` : student.city || student.state,
      student.zipCode,
    ].filter(Boolean).join(', ');
  }

  return student.address || '';
}
