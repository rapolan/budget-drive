import { describe, it, expect } from 'vitest';
import { resolveStudentPickupAddress } from './studentPickupAddress';
import type { Student } from '@/types';

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: 's1',
    tenantId: 't1',
    fullName: 'Test Student',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Student;
}

describe('resolveStudentPickupAddress', () => {
  it('uses the distinct pickup address when the toggle is on and a pickup address is set', () => {
    const s = student({
      pickupAddressDifferentFromHome: true,
      pickupAddressLine1: '1 Pickup St',
      pickupCity: 'Pickup City',
      pickupState: 'CA',
      pickupZipCode: '90001',
      addressLine1: '2 Home St',
      city: 'Home City',
      state: 'CA',
      zipCode: '90002',
    });
    expect(resolveStudentPickupAddress(s)).toBe('1 Pickup St, Pickup City, CA, 90001');
  });

  it('falls back to home address when the toggle is off, even if pickup fields happen to be set', () => {
    const s = student({
      pickupAddressDifferentFromHome: false,
      pickupAddressLine1: '1 Pickup St',
      addressLine1: '2 Home St',
      city: 'Home City',
      state: 'CA',
      zipCode: '90002',
    });
    expect(resolveStudentPickupAddress(s)).toBe('2 Home St, Home City, CA, 90002');
  });

  it('falls back to home address when the toggle is on but no pickup address line is set', () => {
    const s = student({
      pickupAddressDifferentFromHome: true,
      pickupAddressLine1: undefined,
      addressLine1: '2 Home St',
      city: 'Home City',
      state: 'CA',
      zipCode: '90002',
    });
    expect(resolveStudentPickupAddress(s)).toBe('2 Home St, Home City, CA, 90002');
  });

  it('falls back to the legacy combined address field when no structured home address exists', () => {
    const s = student({ address: '123 Legacy Ave, Somewhere, CA 90003' });
    expect(resolveStudentPickupAddress(s)).toBe('123 Legacy Ave, Somewhere, CA 90003');
  });

  it('returns an empty string when the student has no address of any kind', () => {
    const s = student();
    expect(resolveStudentPickupAddress(s)).toBe('');
  });
});
