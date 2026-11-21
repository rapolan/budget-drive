import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Car, Mail, Lock, Eye, EyeOff, Building2, User, AlertCircle } from 'lucide-react';
import { signupApi } from '@/api/signup';
import { useAuth } from '@/contexts/AuthContext';
import { CURRENT_TERMS_VERSION } from '@/content/legalContent';
import { AuthPageShell, GlassInput } from '@/components/common';

const BENEFITS = [
  'Scheduling, payments, and student records in one place',
  'Your data is always yours - export it any time',
  'Set up in a few minutes, no credit card required',
];

/**
 * Public school signup page. The invite code is read from the URL
 * FRAGMENT (#code=...), never a query param - a fragment is never sent
 * to the server and never appears in a Referer header, which matters
 * for a value that's effectively a bearer secret. Stripped from the
 * visible URL immediately after reading, so a screenshot or copy-pasted
 * link doesn't carry it forward either.
 */
export const SignupPage: React.FC = () => {
  const navigate = useNavigate();
  const { signup } = useAuth();

  const [code, setCode] = useState<string | null>(null);
  const [codeReadAttempted, setCodeReadAttempted] = useState(false);

  useEffect(() => {
    const hash = window.location.hash; // e.g. "#code=abc123"
    const match = hash.match(/code=([^&]+)/);
    if (match) {
      setCode(decodeURIComponent(match[1]));
      window.history.replaceState(null, '', window.location.pathname);
    }
    setCodeReadAttempted(true);
  }, []);

  const { data: validateData, isLoading: isValidating } = useQuery({
    queryKey: ['signup-validate-code', code],
    queryFn: () => signupApi.validateCode(code as string),
    enabled: Boolean(code),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });
  const codeLooksInvalid = codeReadAttempted && Boolean(code) && !isValidating && validateData?.data?.valid !== true;

  const [schoolName, setSchoolName] = useState('');
  const [ownerFullName, setOwnerFullName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { error: authError } = useAuth();
  const displayError = localError || authError;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!code) {
      setLocalError('No invite code found. Open your invite link again.');
      return;
    }
    if (!schoolName.trim() || !ownerFullName.trim() || !ownerEmail.trim()) {
      setLocalError('Please fill in every field.');
      return;
    }
    if (ownerPassword.length < 8) {
      setLocalError('Password must be at least 8 characters long.');
      return;
    }
    if (ownerPassword !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    if (!termsAccepted) {
      setLocalError('You must accept the Terms of Service and Privacy Policy to continue.');
      return;
    }

    setIsSubmitting(true);
    try {
      const success = await signup({
        code,
        schoolName: schoolName.trim(),
        ownerFullName: ownerFullName.trim(),
        ownerEmail: ownerEmail.trim(),
        ownerPassword,
        termsAccepted,
        termsVersion: CURRENT_TERMS_VERSION,
      });
      if (success) {
        navigate('/onboarding', { replace: true });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthPageShell headline="Set up your school in a few minutes" benefits={BENEFITS}>
      <div className="text-center mb-7">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl shadow-lg mb-4">
          <Car className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-tx-primary">Create your school's account</h1>
        <p className="text-tx-secondary mt-1 text-sm">Set up your driving school in a few minutes</p>
      </div>

      {!code && codeReadAttempted ? (
        <div className="bg-status-warning-bg border border-status-warning-border rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-status-warning-text flex-shrink-0 mt-0.5" />
          <p className="text-sm text-status-warning-text">
            No invite code found. Open your invite link again - it may have been refreshed or the link was copied without its code.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {displayError && (
            <div className="bg-status-danger-bg border border-status-danger-border rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-status-danger-text flex-shrink-0 mt-0.5" />
              <p className="text-sm text-status-danger-text">{displayError}</p>
            </div>
          )}

          {codeLooksInvalid && (
            <div className="bg-status-warning-bg border border-status-warning-border rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-status-warning-text flex-shrink-0 mt-0.5" />
              <p className="text-sm text-status-warning-text">
                This invite code looks invalid or expired. You can still try submitting, or ask for a new link.
              </p>
            </div>
          )}

          <GlassInput
            label="School name"
            id="schoolName"
            type="text"
            value={schoolName}
            onChange={(e) => setSchoolName(e.target.value)}
            icon={<Building2 className="h-5 w-5" />}
            disabled={isSubmitting}
            valid={schoolName.trim().length > 0}
          />

          <GlassInput
            label="Your full name"
            id="ownerFullName"
            type="text"
            value={ownerFullName}
            onChange={(e) => setOwnerFullName(e.target.value)}
            icon={<User className="h-5 w-5" />}
            disabled={isSubmitting}
            valid={ownerFullName.trim().length > 0}
          />

          <GlassInput
            label="Your email"
            id="ownerEmail"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            autoComplete="email"
            icon={<Mail className="h-5 w-5" />}
            disabled={isSubmitting}
            valid={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)}
          />

          <GlassInput
            label="Password"
            id="ownerPassword"
            type={showPassword ? 'text' : 'password'}
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.target.value)}
            autoComplete="new-password"
            icon={<Lock className="h-5 w-5" />}
            hint={ownerPassword.length === 0 ? 'At least 8 characters' : undefined}
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

          <GlassInput
            label="Confirm password"
            id="confirmPassword"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            icon={<Lock className="h-5 w-5" />}
            disabled={isSubmitting}
            valid={confirmPassword.length > 0 && confirmPassword === ownerPassword}
          />

          <div className="flex items-start gap-2 pt-1">
            <input
              id="termsAccepted"
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-edge-strong text-primary focus:ring-primary"
              disabled={isSubmitting}
            />
            <label htmlFor="termsAccepted" className="text-sm text-tx-secondary">
              I agree to the{' '}
              <Link to="/terms" target="_blank" className="text-primary hover:text-primary font-medium">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" target="_blank" className="text-primary hover:text-primary font-medium">
                Privacy Policy
              </Link>
              . This app is always the source of truth for your lesson data - it stays yours and you can export it.
            </label>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 bg-primary text-white rounded-[14px] font-medium hover:brightness-90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          >
            {isSubmitting ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              'Create Account'
            )}
          </button>
        </form>
      )}

      <div className="mt-6 text-center">
        <p className="text-sm text-tx-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-primary hover:text-primary font-medium">
            Sign in
          </Link>
        </p>
      </div>

      <p className="text-center text-xs text-tx-muted mt-6">Budget Drive Protocol</p>
    </AuthPageShell>
  );
};

export default SignupPage;
