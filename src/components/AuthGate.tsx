import { ShoppingCart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { betterAuthClient } from '@/lib/auth-client';
import { useDialog } from '@/lib/dialog-context';
import { useAccount } from '@/lib/jazz';
import { Account } from '@/schemas';
import { SignInDialog } from './auth/SignInDialog';
import { AppContainer } from './editor/AppContainer';
import { Button } from './ui/button';
import { LoadingScreen } from './ui/loading';

export type ViewMode = 'classic' | 'simplified';

export function AuthGate() {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [showSignInDialog, setShowSignInDialog] = useState(false);
  const { me, logOut } = useAccount(Account);
  const { showAlert } = useDialog();

  // View mode state - defaults to "classic" to preserve existing experience
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem('view-mode');
    return (stored === 'simplified' ? 'simplified' : 'classic') as ViewMode;
  });

  // Persist view mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('view-mode', viewMode);
  }, [viewMode]);

  // Check if user explicitly signed out
  const userSignedOut = localStorage.getItem('user-signed-out') === 'true';

  // Check authentication status with BetterAuth on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log(
          '[AuthGate] Checking session with baseURL:',
          import.meta.env.PROD ? `${import.meta.env.VITE_AUTH_URL}/api/auth` : '(dev proxy)',
        );
        console.log('[AuthGate] Document cookies:', document.cookie);
        const session = await betterAuthClient.getSession();
        console.log('[AuthGate] Session response:', session);
        const hasValidSession = !!session?.data?.user;
        console.log('[AuthGate] Has valid session:', hasValidSession, 'User:', session?.data?.user);
        setIsAuthenticated(hasValidSession);

        // Only update signed-out flag if we DON'T have a valid session
        // This prevents marking user as signed-out after successful OAuth
        if (!hasValidSession) {
          // Don't set signed-out flag if we've never tried to sign in
          // This allows local/anonymous mode to work
          const hadPreviousSession = localStorage.getItem('had-session') === 'true';
          if (hadPreviousSession) {
            localStorage.setItem('user-signed-out', 'true');
          }
        } else {
          // Mark that we've had a session, and clear signed-out flag
          localStorage.setItem('had-session', 'true');
          localStorage.removeItem('user-signed-out');
        }
      } catch (error) {
        console.error('[AuthGate] Failed to check session:', error);
        setIsAuthenticated(false);
        // Don't automatically set signed-out flag on error
        // This could be a temporary network issue
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Debug: Log account state changes
  useEffect(() => {
    if (me) {
      const logAccountState = async () => {
        try {
          const accountId = me.$jazz.id;
          const hasRoot = me.$jazz.has('root');

          // Load root to get folder count
          const { root } = await me.$jazz.ensureLoaded({ resolve: { root: { folders: true } } });
          const foldersCount = root?.folders?.length || 0;

          console.log('[AuthGate] Account state:', {
            accountId,
            hasRoot,
            foldersCount,
            profileName: me.profile?.name,
          });
        } catch (error) {
          console.error('[AuthGate] Error loading account state:', error);
        }
      };

      logAccountState();
    }
  }, [me]);

  // Update profile name from BetterAuth session when Jazz account becomes available
  useEffect(() => {
    const syncProfileName = async () => {
      // Only sync if we have a Jazz account with a profile but no name set
      if (me?.profile && !me.profile.name) {
        try {
          // Get the current BetterAuth session to access user data
          const session = await betterAuthClient.getSession();

          if (session?.data?.user?.name) {
            me.profile.$jazz.set('name', session.data.user.name);
          }
        } catch {
          // Silently ignore profile sync errors
        }
      }
    };

    syncProfileName();
  }, [me?.profile]); // Only run when profile becomes available, not on name changes

  const handleShowSignInDialog = () => {
    console.log('[AuthGate] Sign-in clicked - showing provider selection dialog');
    setShowSignInDialog(true);
  };

  const handleGoogleSignIn = () => {
    console.log('[AuthGate] handleGoogleSignIn called!');

    // Clear the signed-out flag when user signs in
    localStorage.removeItem('user-signed-out');

    // Use BetterAuth client API - this should automatically redirect to Google
    // No await or .then() - the redirect happens synchronously
    betterAuthClient.signIn.social({
      provider: 'google',
      callbackURL: '/',
    });

    console.log('[AuthGate] signIn.social() called - redirect should happen automatically');
  };

  const handleAppleSignIn = async () => {
    await showAlert({
      title: 'Not Available',
      message: 'Apple sign-in not available.',
    });
  };

  const handleSignOut = async () => {
    // Set a flag to prevent auto-login after sign out
    localStorage.setItem('user-signed-out', 'true');

    // Sign out from BetterAuth first (clear server session)
    try {
      await betterAuthClient.signOut();
    } catch {
      // Silently ignore signOut errors
    }

    // Sign out from Jazz (this clears the local account and triggers state change)
    // The state change will automatically show the login screen, no reload needed
    try {
      await logOut();
    } catch {
      // Silently ignore logOut errors
    }
  };

  // Show loading screen while checking authentication
  if (isLoading) {
    return <LoadingScreen />;
  }

  // If authenticated with BetterAuth and has Jazz account, show the app with sign out
  if (isAuthenticated && me && !userSignedOut) {
    return (
      <AppContainer
        onSignOut={handleSignOut}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isAuthenticated={true}
      />
    );
  }

  // Allow local mode - show app without authentication (Jazz creates anonymous account)
  if (me) {
    return (
      <>
        <SignInDialog
          open={showSignInDialog}
          onOpenChange={setShowSignInDialog}
          onGoogleSignIn={handleGoogleSignIn}
          onAppleSignIn={handleAppleSignIn}
        />
        <AppContainer
          onSignIn={handleShowSignInDialog}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          isAuthenticated={false}
        />
      </>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="flex items-center justify-center gap-3 text-4xl font-bold text-neutral-900">
            <ShoppingCart className="h-10 w-10" />
            BubbleList
          </h1>
          <p className="mt-2 text-neutral-600">Collaborative lists that sync in real-time</p>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-center text-xl font-semibold">Sign in to continue</h2>

          <div className="space-y-3">
            <Button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              variant="secondary"
              className="w-full py-3"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" role="img" aria-label="Google logo">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>

            <Button
              type="button"
              onClick={handleAppleSignIn}
              disabled={isLoading}
              variant="dark"
              className="w-full py-3"
            >
              <svg
                className="h-5 w-5"
                fill="currentColor"
                viewBox="0 0 24 24"
                role="img"
                aria-label="Apple logo"
              >
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
              </svg>
              Continue with Apple
            </Button>
          </div>

          <div className="mt-6 text-center text-sm text-neutral-500">
            By continuing, you agree to our Terms of Service and Privacy Policy
          </div>
        </div>

        <div className="text-center text-sm text-neutral-500">
          <p>Built with Jazz.tools & BetterAuth</p>
          <p className="mt-1">Real-time sync • Offline-first • Encrypted storage</p>
        </div>
      </div>
    </div>
  );
}
