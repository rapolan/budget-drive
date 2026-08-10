import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { authApi } from '@/api/auth';

vi.mock('@/api/auth', async () => {
  const actual = await vi.importActual<typeof import('@/api/auth')>('@/api/auth');
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      getCurrentUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
  };
});

function rejectionWithStatus(status: number, message = 'error') {
  return Object.assign(new Error(message), { response: { status, data: { error: message } } });
}

afterEach(cleanup);

// Regression coverage: refreshUser's catch block previously treated ANY
// rejected getCurrentUser() call - a 401 (invalid token), a 429 (rate
// limit), or a network error - identically: clear auth_token/tenant_id and
// force user to null. A transient 429 has nothing to do with whether the
// token is still valid, and clearing credentials on it silently logged the
// user out from under an in-progress action. Only a real 401 should do that.
describe('AuthContext - refreshUser error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('clears the token and sets user to null on a 401 (real auth failure)', async () => {
    localStorage.setItem('auth_token', 'stale-token');
    localStorage.setItem('tenant_id', 'tenant-1');
    (authApi.getCurrentUser as ReturnType<typeof vi.fn>).mockRejectedValue(rejectionWithStatus(401, 'Invalid token'));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('tenant_id')).toBeNull();
  });

  it('leaves the token and does not force logout on a 429 (rate limit)', async () => {
    localStorage.setItem('auth_token', 'still-valid-token');
    localStorage.setItem('tenant_id', 'tenant-1');
    (authApi.getCurrentUser as ReturnType<typeof vi.fn>).mockRejectedValue(
      rejectionWithStatus(429, 'Too many requests. Please try again later.')
    );

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Credentials are untouched - a rate-limit response is not proof the
    // token is invalid.
    expect(localStorage.getItem('auth_token')).toBe('still-valid-token');
    expect(localStorage.getItem('tenant_id')).toBe('tenant-1');
  });

  it('leaves the token and does not force logout on a generic network error (no response)', async () => {
    localStorage.setItem('auth_token', 'still-valid-token');
    localStorage.setItem('tenant_id', 'tenant-1');
    (authApi.getCurrentUser as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network Error'));

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(localStorage.getItem('auth_token')).toBe('still-valid-token');
    expect(localStorage.getItem('tenant_id')).toBe('tenant-1');
  });

  it('sets user on a successful response', async () => {
    localStorage.setItem('auth_token', 'valid-token');
    localStorage.setItem('tenant_id', 'tenant-1');
    (authApi.getCurrentUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        id: 'user-1',
        email: 'admin@example.com',
        fullName: 'Admin User',
        phone: null,
        profilePhotoUrl: null,
        emailVerified: true,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
        role: 'admin',
        membershipStatus: 'active',
        instructorId: null,
      },
    });

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.user?.email).toBe('admin@example.com');
    expect(result.current.isAuthenticated).toBe(true);
  });
});
