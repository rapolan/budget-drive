import type { Student } from '@/types';

// One source of truth for "what contact do we show for this student" -
// reused by the Students list (table + card views) and the student detail
// view, so they can't diverge. A minor with no email/phone of their own
// falls back to their linked primary guardian's contact, labeled
// "(Guardian)" so it's clear whose number it is. A minor with no guardian
// linked yet has no fallback to show - the existing needsGuardian
// indicator already covers that case, this helper doesn't duplicate it.
export interface StudentContactDisplay {
  email: string | null;
  phone: string | null;
  isGuardianFallback: boolean;
}

export function getStudentContactDisplay(student: Pick<Student, 'email' | 'phone' | 'primaryGuardian'>): StudentContactDisplay {
  const ownEmail = student.email || null;
  const ownPhone = student.phone || null;

  if (ownEmail || ownPhone) {
    return { email: ownEmail, phone: ownPhone, isGuardianFallback: false };
  }

  const guardian = student.primaryGuardian;
  if (guardian && (guardian.email || guardian.phone)) {
    return { email: guardian.email, phone: guardian.phone, isGuardianFallback: true };
  }

  return { email: null, phone: null, isGuardianFallback: false };
}
