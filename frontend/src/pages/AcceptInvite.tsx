import React, { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Car, Lock, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { authApi } from '@/api/auth';

export const AcceptInvitePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('This invite link is missing its token. Ask for a new invite.');
      return;
    }
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSubmitting(true);
    try {
      await authApi.acceptInvite(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to accept invite. The link may be invalid or expired.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl shadow-lg mb-4">
            <Car className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-tx-primary">Accept Invite</h1>
          <p className="text-tx-secondary mt-1">Set a password to activate your account</p>
        </div>

        <div className="bg-surface rounded-2xl shadow-xl p-8">
          {success ? (
            <div className="bg-status-success-bg border border-status-success-border rounded-lg p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-status-success-text flex-shrink-0 mt-0.5" />
              <p className="text-sm text-status-success-text">Invite accepted. Redirecting to login...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-status-danger-bg border border-status-danger-border rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-status-danger-text flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-status-danger-text">{error}</p>
                </div>
              )}

              {!token && (
                <div className="bg-status-warning-bg border border-status-warning-border rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-status-warning-text flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-status-warning-text">
                    No invite token found in this link. Make sure you used the exact link from your invite.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-tx-secondary mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-tx-muted" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose a password"
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
                  Confirm Password
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

              <button
                type="submit"
                disabled={isSubmitting || !token}
                className="w-full bg-primary text-white py-3 px-4 rounded-lg font-medium hover:brightness-90 hover:bg-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
              >
                {isSubmitting ? 'Activating...' : 'Activate Account'}
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
