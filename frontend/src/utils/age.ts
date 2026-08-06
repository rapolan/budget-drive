/**
 * Age Calculation Utility
 */

/**
 * Calculate age in whole years from a date of birth, live against today.
 * @param dob - Date of birth (string, Date, or null/undefined)
 * @returns Age in years, or null if no date of birth is available
 */
export function calculateAge(dob: string | Date | null | undefined): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
