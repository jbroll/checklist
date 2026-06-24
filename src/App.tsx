import { RefreshCw } from 'lucide-react';
import {
  Component,
  type ErrorInfo,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useState,
} from 'react';
import { AuthGate } from './components/AuthGate';
import { InAppBrowserWarning } from './components/sharing/InAppBrowserWarning';
import { LoadingScreen } from './components/ui/loading';
import { brand } from './lib/brand';
import { DialogProvider } from './lib/dialog-context';
import { JazzProvider } from './lib/jazz';
import { detectInAppBrowser } from './utils/inAppBrowserDetection';

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
        <div className="flex min-h-screen items-center justify-center bg-green-50 dark:bg-neutral-900">
          <div className="max-w-md rounded-xl border border-green-200 dark:border-green-800 bg-white dark:bg-neutral-800 p-8 text-center shadow-lg">
            <div className="mb-4 flex justify-center">
              <div className="rounded-full bg-green-100 dark:bg-green-900 p-4">
                <RefreshCw className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Just a moment...
            </h1>
            <p className="mb-6 text-neutral-600 dark:text-neutral-400">
              We hit a small bump. A quick refresh should get things back on track.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-white font-medium hover:bg-green-700 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
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

// Lazy load billing pages for Stripe checkout flow
const BillingSuccessPage = lazy(() =>
  import('./components/billing/BillingSuccessPage').then((module) => ({
    default: module.BillingSuccessPage,
  })),
);

const BillingCancelPage = lazy(() =>
  import('./components/billing/BillingCancelPage').then((module) => ({
    default: module.BillingCancelPage,
  })),
);

// Lazy load MergeAccountFlow for account merge
const MergeAccountFlow = lazy(() => import('./components/auth/MergeAccountFlow'));

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
  // Check for in-app browser (Facebook, Instagram, etc.) which don't support
  // OAuth properly and have limited local storage capabilities
  const [browserInfo] = useState(() => detectInAppBrowser());
  const [dismissedWarning, setDismissedWarning] = useState(false);

  // Update document head based on brand
  useEffect(() => {
    // Update title
    document.title = brand.name;

    // Update favicon
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) {
      favicon.href = brand.logos.favicon;
    }

    // Update theme color
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) {
      themeColor.content = brand.themeColor;
    }

    // Update description
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) {
      description.content = brand.tagline;
    }

    // Update apple-mobile-web-app-title
    const appleTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    if (appleTitle) {
      appleTitle.content = brand.name;
    }
  }, []);

  // Parse current route
  const pathname = window.location.pathname;
  const isTestPage = pathname === '/test';
  const isResetPasswordPage = pathname === '/reset-password';
  const isVerifyEmailPage = pathname === '/verify-email';
  const isBillingSuccess = pathname === '/billing/success';
  const isBillingCancel = pathname === '/billing/cancel';
  const inviteMatch = pathname.match(/^\/invite\/(.+)$/);
  const inviteToken = inviteMatch ? inviteMatch[1] : null;
  const isMergeFlow = new URLSearchParams(window.location.search).get('merge') !== null;

  // Block test page in production
  if (isTestPage && import.meta.env.PROD) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-green-50 dark:bg-neutral-900">
        <div className="max-w-md rounded-xl border border-green-200 dark:border-green-800 bg-white dark:bg-neutral-800 p-8 text-center shadow-lg">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-green-100 dark:bg-green-900 p-4">
              <RefreshCw className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Page Not Available
          </h1>
          <p className="mb-6 text-neutral-600 dark:text-neutral-400">
            This page is only available in development mode.
          </p>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2.5 text-white font-medium hover:bg-green-700 transition-colors"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  // Block in-app browsers (Facebook, Instagram, etc.) which don't support
  // OAuth and have unreliable local storage for offline data
  if (browserInfo.isInAppBrowser && !dismissedWarning) {
    return <InAppBrowserWarning onContinue={() => setDismissedWarning(true)} />;
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
            ) : isBillingSuccess ? (
              <Suspense fallback={<LoadingScreen />}>
                <BillingSuccessPage />
              </Suspense>
            ) : isBillingCancel ? (
              <Suspense fallback={<LoadingScreen />}>
                <BillingCancelPage />
              </Suspense>
            ) : isTestPage ? (
              <Suspense fallback={<LoadingScreen />}>
                <TestPage />
              </Suspense>
            ) : isMergeFlow ? (
              <Suspense fallback={<LoadingScreen />}>
                <MergeAccountFlow />
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
