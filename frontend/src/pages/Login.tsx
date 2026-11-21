import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Car, Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { landingPathForRole } from '@/utils/roleRouting';
import { AuthPageShell, GlassInput } from '@/components/common';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading, error, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Redirect if already authenticated. Falls back to this user's own
  // role-based landing page (not always "/") - RequireRole would bounce an
  // instructor away from an inappropriate `from` anyway, but landing them
  // correctly on the first hop avoids a visible extra redirect.
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as any)?.from?.pathname || landingPathForRole(user?.role);
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location, user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Basic validation
    if (!email.trim()) {
      setLocalError('Please enter your email address');
      return;
    }
    if (!password) {
      setLocalError('Please enter your password');
      return;
    }

    setIsSubmitting(true);

    try {
      const success = await login(email.trim(), password);
      if (success) {
        // `user` may not have updated in this closure yet immediately after
        // login() resolves - reading role straight off the login response
        // isn't available here, so this relies on `from` when present and
        // otherwise falls back to admin's "/", which RoleLandingRedirect
        // (rendered right after this navigate) still correctly re-routes an
        // instructor onward from.
        const from = (location.state as any)?.from?.pathname || '/';
        navigate(from, { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || error;

  // Don't show login form while checking auth state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-appbg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <AuthPageShell
      headline="Welcome back"
      benefits={['Run your whole school from one dashboard', 'Scheduling, payments, and student records in sync']}
    >
      <div className="text-center mb-7">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl shadow-lg mb-4">
          <Car className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-tx-primary">Sign in</h1>
        <p className="text-tx-secondary mt-1 text-sm">Sign in to your driving school account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {displayError && (
          <div className="bg-status-danger-bg border border-status-danger-border rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-status-danger-text flex-shrink-0 mt-0.5" />
            <p className="text-sm text-status-danger-text">{displayError}</p>
          </div>
        )}

        <GlassInput
          label="Email Address"
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          icon={<Mail className="h-5 w-5" />}
          disabled={isSubmitting}
        />

        <GlassInput
          label="Password"
          id="password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          icon={<Lock className="h-5 w-5" />}
          disabled={isSubmitting}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-tx-muted hover:text-tx-secondary"
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          }
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-12 bg-primary text-white rounded-[14px] font-medium hover:brightness-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Signing in...
            </>
          ) : (
            'Sign In'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-sm text-tx-muted">
          Forgot your password?{' '}
          <button className="text-primary hover:text-primary font-medium">
            Reset it here
          </button>
        </p>
      </div>

      <p className="text-center text-xs text-tx-muted mt-6">
        Budget Drive Protocol
      </p>
    </AuthPageShell>
  );
};
