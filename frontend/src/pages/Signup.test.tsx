import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SignupPage } from './Signup';
import { signupApi } from '@/api/signup';

vi.mock('@/api/signup', () => ({
  signupApi: {
    validateCode: vi.fn(),
    signup: vi.fn(),
  },
}));

const mockSignup = vi.fn();
const mockNavigate = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ signup: mockSignup, error: null }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

afterEach(cleanup);

function renderSignup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/signup']}>
        <SignupPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('SignupPage - reading the invite code from the URL fragment', () => {
  beforeEach(() => {
    vi.mocked(signupApi.validateCode).mockReset();
    mockSignup.mockReset();
    mockNavigate.mockReset();
    window.location.hash = '';
  });

  it('reads the code from location.hash and strips it from the visible URL after reading', async () => {
    vi.mocked(signupApi.validateCode).mockResolvedValue({ success: true, data: { valid: true } });
    window.location.hash = '#code=abc123def456';

    renderSignup();

    await waitFor(() => expect(signupApi.validateCode).toHaveBeenCalledWith('abc123def456'));
    expect(window.location.hash).toBe('');
  });

  it('shows a warning banner when no code is present at all', async () => {
    window.location.hash = '';

    renderSignup();

    await waitFor(() => expect(screen.getByText(/No invite code found/i)).toBeInTheDocument());
  });
});

describe('SignupPage - invalid code', () => {
  beforeEach(() => {
    vi.mocked(signupApi.validateCode).mockReset();
    mockSignup.mockReset();
    window.location.hash = '#code=invalid-code';
  });

  it('shows an inline warning but the form stays usable', async () => {
    vi.mocked(signupApi.validateCode).mockResolvedValue({ success: false, error: 'This invite code is invalid or has expired.' });

    renderSignup();

    await waitFor(() => expect(screen.getByText(/looks invalid or expired/i)).toBeInTheDocument());
    // Form fields are still present and interactive.
    expect(screen.getByLabelText(/School name/i)).toBeEnabled();
  });
});

describe('SignupPage - successful submit', () => {
  beforeEach(() => {
    vi.mocked(signupApi.validateCode).mockReset();
    mockSignup.mockReset();
    mockNavigate.mockReset();
    window.location.hash = '#code=valid-code-123';
  });

  it('calls signup() with the form data and navigates to /onboarding on success', async () => {
    vi.mocked(signupApi.validateCode).mockResolvedValue({ success: true, data: { valid: true } });
    mockSignup.mockResolvedValue(true);

    renderSignup();

    await waitFor(() => expect(screen.getByLabelText(/School name/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/School name/i), { target: { value: 'Acme Driving School' } });
    fireEvent.change(screen.getByLabelText(/Your full name/i), { target: { value: 'Jane Owner' } });
    fireEvent.change(screen.getByLabelText(/Your email/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password1234' } });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'Password1234' } });
    fireEvent.click(screen.getByLabelText(/I agree to the/i));

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(mockSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'valid-code-123',
        schoolName: 'Acme Driving School',
        ownerFullName: 'Jane Owner',
        ownerEmail: 'jane@example.com',
        ownerPassword: 'Password1234',
        termsAccepted: true,
      })
    ));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/onboarding', { replace: true }));
  });

  it('rejects submission when terms are not accepted', async () => {
    vi.mocked(signupApi.validateCode).mockResolvedValue({ success: true, data: { valid: true } });

    renderSignup();
    await waitFor(() => expect(screen.getByLabelText(/School name/i)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/School name/i), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText(/Your full name/i), { target: { value: 'Jane' } });
    fireEvent.change(screen.getByLabelText(/Your email/i), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Password$/i), { target: { value: 'Password1234' } });
    fireEvent.change(screen.getByLabelText(/Confirm password/i), { target: { value: 'Password1234' } });
    // Deliberately not checking the terms checkbox.

    fireEvent.click(screen.getByRole('button', { name: /Create Account/i }));

    await waitFor(() => expect(screen.getByText(/must accept the Terms/i)).toBeInTheDocument());
    expect(mockSignup).not.toHaveBeenCalled();
  });
});
