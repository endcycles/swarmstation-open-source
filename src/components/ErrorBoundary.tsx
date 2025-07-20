import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Logger } from '../../core/utils/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details for debugging
    Logger.error('ERROR_BOUNDARY', `Component error: ${error.message}`, {
      name: error.name,
      stack: error.stack,
      componentStack: errorInfo.componentStack
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-dark text-white flex items-center justify-center p-8">
          <div className="max-w-md w-full bg-white/5 border border-red-status/30 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-red-status mb-4">Something went wrong</h2>
            <p className="text-gray-text mb-4">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {this.state.error && (
              <details className="mt-4" open>
                <summary className="cursor-pointer text-sm text-gray-text hover:text-white">
                  Error details
                </summary>
                <div className="mt-2 p-4 bg-black/30 rounded text-xs overflow-auto">
                  <p className="text-red-400 font-bold mb-2">Error Message:</p>
                  <p className="text-white mb-4">{this.state.error.message}</p>
                  <p className="text-red-400 font-bold mb-2">Stack Trace:</p>
                  <pre className="text-gray-300">{this.state.error.stack}</pre>
                </div>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-gradient-to-r from-purple-gradient-start to-purple-gradient-end text-gray-dark rounded hover:shadow-glow transition-all"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;