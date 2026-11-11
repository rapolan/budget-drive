import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Car, Mail, Lock, Eye, EyeOff, Building2, User, AlertCircle } from 'lucide-react';
import { signupApi } from '@/api/signup';
import { useAuth } from '@/contexts/AuthContext';
import { CURRENT_TERMS_VERSION } from '@/content/legalContent';

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
    <div className="min-h-screen bg-appbg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-lg mb-4">
            <Car className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-tx-primary">Create Your School's Account</h1>
          <p className="text-tx-secondary mt-1">Set up your driving school in a few minutes</p>
        </div>

        <div className="bg-surface rounded-2xl shadow-xl p-8">
          {!code && codeReadAttempted ? (
            <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-status-warning-text flex-shrink-0 mt-0.5" />
              <p className="text-sm text-status-warning-text">
                No invite code found. Open your invite link again - it may have been refreshed or the link was copied without its code.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {displayError && (
                <div className="bg-status-danger-bg border border-status-danger-border rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-status-danger-text flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-status-danger-text">{displayError}</p>
                </div>
              )}

              {codeLooksInvalid && (
                <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-status-warning-text flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-status-warning-text">
                    This invite code looks invalid or expired. You can still try submitting, or ask for a new link.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="schoolName" className="block text-sm font-medium text-tx-secondary mb-2">
                  School name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Building2 className="h-5 w-5 text-tx-muted" />
                  </div>
                  <input
                    id="schoolName"
                    type="text"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder="Acme Driving School"
                    className="block w-full pl-10 pr-4 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-tx-primary placeholder-gray-400"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ownerFullName" className="block text-sm font-medium text-tx-secondary mb-2">
                  Your full name
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-tx-muted" />
                  </div>
                  <input
                    id="ownerFullName"
                    type="text"
                    value={ownerFullName}
                    onChange={(e) => setOwnerFullName(e.target.value)}
                    placeholder="Jane Smith"
                    className="block w-full pl-10 pr-4 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-tx-primary placeholder-gray-400"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ownerEmail" className="block text-sm font-medium text-tx-secondary mb-2">
                  Your email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-tx-muted" />
                  </div>
                  <input
                    id="ownerEmail"
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    placeholder="jane@example.com"
                    autoComplete="email"
                    className="block w-full pl-10 pr-4 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-tx-primary placeholder-gray-400"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ownerPassword" className="block text-sm font-medium text-tx-secondary mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-tx-muted" />
                  </div>
                  <input
                    id="ownerPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
                    className="block w-full pl-10 pr-12 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-tx-primary placeholder-gray-400"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-tx-muted hover:text-tx-secondary"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-tx-secondary mb-2">
                  Confirm password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-tx-muted" />
                  </div>
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    className="block w-full pl-10 pr-4 py-3 border border-edge-strong rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent transition-all text-tx-primary placeholder-gray-400"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="flex items-start gap-2">
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
                className="w-full bg-primary text-white py-3 px-4 rounded-lg font-medium hover:brightness-90 hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
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
        </div>

        <p className="text-center text-sm text-tx-muted mt-8">Budget Drive Protocol</p>
      </div>
    </div>
  );
};

export default SignupPage;
