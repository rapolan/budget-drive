import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { RequireRole } from './RequireRole';

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderWithRole(role: string | undefined, allow: Array<'owner' | 'admin' | 'instructor' | 'staff' | 'viewer'>) {
  mockUseAuth.mockReturnValue({ user: role ? { role } : null });
  return render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          path="/protected"
          element={
            <RequireRole allow={allow}>
              <div>Protected content</div>
            </RequireRole>
          }
        />
        <Route path="/" element={<div>Admin dashboard landing</div>} />
        <Route path="/my/today" element={<div>Instructor landing</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('RequireRole', () => {
  beforeEach(() => {
    cleanup();
    mockUseAuth.mockReset();
  });

  it('renders children when the user\'s role is in the allow list', () => {
    renderWithRole('admin', ['owner', 'admin', 'staff']);
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects an instructor to their own landing page when the role is not allowed', () => {
    renderWithRole('instructor', ['owner', 'admin', 'staff']);
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('Instructor landing')).toBeInTheDocument();
  });

  it('redirects a non-instructor role to "/" when not allowed', () => {
    renderWithRole('staff', ['owner', 'admin']);
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('Admin dashboard landing')).toBeInTheDocument();
  });

  it('redirects when there is no user at all', () => {
    renderWithRole(undefined, ['owner', 'admin']);
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('Admin dashboard landing')).toBeInTheDocument();
  });

  it('allows only instructor for the instructor-only route tree', () => {
    renderWithRole('instructor', ['instructor']);
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('blocks an admin from an instructor-only route, redirecting to "/"', () => {
    renderWithRole('admin', ['instructor']);
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
    expect(screen.getByText('Admin dashboard landing')).toBeInTheDocument();
  });
});
