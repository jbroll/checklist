import { Component, type ReactNode } from 'react';

interface Props {
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary that catches errors in a specific feature area.
 * Shows a user-friendly error message with a retry option.
 */
export class FeatureErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`Error in ${this.props.feature}:`, error, errorInfo);
    // Could report to error tracking service here
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 text-center rounded-lg bg-surface-secondary">
          <h2 className="text-lg font-semibold text-content-primary">Something went wrong</h2>
          <p className="mt-1 text-sm text-content-secondary">
            The {this.props.feature} encountered an error.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="mt-3 px-4 py-2 text-sm font-medium text-white bg-primary rounded-md hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Try again
          </button>
          {import.meta.env.DEV && this.state.error && (
            <details className="mt-4 text-left text-xs text-content-tertiary">
              <summary className="cursor-pointer">Error details</summary>
              <pre className="mt-2 p-2 overflow-auto bg-surface-primary rounded">
                {this.state.error.message}
                {'\n'}
                {this.state.error.stack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
