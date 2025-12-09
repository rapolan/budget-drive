import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // In production, you could send this to an error tracking service like Sentry
    // Example: Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center justify-center w-16 h-16 mx-auto bg-red-100 rounded-full">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>

            <h1 className="mt-6 text-2xl font-bold text-center text-gray-900">
              Oops! Something went wrong
            </h1>

            <p className="mt-4 text-center text-gray-600">
              We're sorry, but something unexpected happened. Don't worry, your data is safe.
            </p>

            {/* Error details (only show in development) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="mt-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Error Details (Development Only):</h3>
                <div className="text-xs font-mono text-red-600 overflow-auto max-h-48">
                  <p className="font-bold">{this.state.error.toString()}</p>
                  {this.state.errorInfo && (
                    <pre className="mt-2 whitespace-pre-wrap text-gray-700">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-medium"
              >
                <RefreshCw className="w-5 h-5" />
                Try Again
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 hover:border-gray-400 hover:scale-105 active:scale-95 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 transition-all font-medium"
              >
                <Home className="w-5 h-5" />
                Go to Dashboard
              </button>
            </div>

            {/* Help text */}
            <p className="mt-6 text-sm text-center text-gray-500">
              If this problem persists, please contact support or try refreshing the page.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
