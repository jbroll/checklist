import { XCircle } from 'lucide-react';
import { Component, type ErrorInfo, lazy, type ReactNode, Suspense } from 'react';
import { AuthGate } from './components/AuthGate';
import { LoadingScreen } from './components/ui/loading';
import { DialogProvider } from './lib/dialog-context';
import { JazzProvider } from './lib/jazz';

/**
 * Error Boundary to catch rendering errors and prevent white screen crashes
 */
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] React error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-red-50">
          <div className="max-w-md rounded-lg border-4 border-red-500 bg-white p-8 text-center shadow-lg">
            <div className="mb-4 flex justify-center">
              <XCircle className="h-16 w-16 text-red-500" />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-red-900">Something went wrong</h1>
            <p className="mb-4 text-neutral-600">
              An unexpected error occurred. Please refresh the page to try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-block rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
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

// Lazy load TestPage only in development to avoid bundling it in production
const TestPage = lazy(() => import('./TestPage').then((module) => ({ default: module.TestPage })));

// Lazy load InviteAcceptPage for sharing invites
const InviteAcceptPage = lazy(() =>
  import('./components/sharing/InviteAcceptPage').then((module) => ({
    default: module.InviteAcceptPage,
  })),
);

// Lazy load ResetPasswordPage for password reset flow
const ResetPasswordPage = lazy(() =>
  import('./components/auth/ResetPasswordPage').then((module) => ({
    default: module.ResetPasswordPage,
  })),
);

// Lazy load VerifyEmailPage for additional email verification
const VerifyEmailPage = lazy(() =>
  import('./components/auth/VerifyEmailPage').then((module) => ({
    default: module.VerifyEmailPage,
  })),
);

// Lazy load Jazz Inspector to avoid bundling it unnecessarily
const JazzInspector = lazy(() =>
  import('jazz-tools/inspector').then((module) => ({ default: module.JazzInspector })),
);

/**
 * Conditional Jazz Inspector wrapper
 * Only shows inspector in development mode (never in production)
 */
function ConditionalJazzInspector() {
  const isDevelopment = import.meta.env.DEV;

  // Only show inspector in development mode
  if (!isDevelopment) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <JazzInspector />
    </Suspense>
  );
}

function App() {
  // Parse current route
  const pathname = window.location.pathname;
  const isTestPage = pathname === '/test';
  const isResetPasswordPage = pathname === '/reset-password';
  const isVerifyEmailPage = pathname === '/verify-email';
  const inviteMatch = pathname.match(/^\/invite\/(.+)$/);
  const inviteToken = inviteMatch ? inviteMatch[1] : null;

  // Block test page in production
  if (isTestPage && import.meta.env.PROD) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-red-50">
        <div className="max-w-md rounded-lg border-4 border-red-500 bg-white p-8 text-center shadow-lg">
          <div className="mb-4 flex justify-center">
            <XCircle className="h-16 w-16 text-red-500" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-red-900">Access Denied</h1>
          <p className="mb-4 text-neutral-600">Test page is not available in production.</p>
          <a
            href="/"
            className="inline-block rounded-lg bg-green-600 px-4 py-2 text-white hover:bg-green-700"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <JazzProvider>
        <DialogProvider>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:border focus:border-green-600 focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:ring-2 focus:ring-green-500/20"
          >
            Skip to main content
          </a>
          <div className="min-h-screen bg-surface-secondary">
            {inviteToken ? (
              <Suspense fallback={<LoadingScreen />}>
                <InviteAcceptPage token={inviteToken} />
              </Suspense>
            ) : isResetPasswordPage ? (
              <Suspense fallback={<LoadingScreen />}>
                <ResetPasswordPage />
              </Suspense>
            ) : isVerifyEmailPage ? (
              <Suspense fallback={<LoadingScreen />}>
                <VerifyEmailPage />
              </Suspense>
            ) : isTestPage ? (
              <Suspense fallback={<LoadingScreen />}>
                <TestPage />
              </Suspense>
            ) : (
              <AuthGate />
            )}
          </div>
          <ConditionalJazzInspector />
        </DialogProvider>
      </JazzProvider>
    </ErrorBoundary>
  );
}

export default App;
