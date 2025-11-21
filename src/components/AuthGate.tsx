import { useAccount, useIsAuthenticated } from 'jazz-tools/react';
import { useEffect, useState } from 'react';
import { betterAuthClient } from '@/lib/auth-client';
import { useDialog } from '@/lib/dialog-context';
import { Account } from '@/schemas';
import { SignInDialog } from './auth/SignInDialog';
import { AppContainer } from './editor/AppContainer';
import { LoadingScreen } from './ui/loading';

export type ViewMode = 'classic' | 'simplified';

export function AuthGate() {
  const [showSignInDialog, setShowSignInDialog] = useState(false);
  const { me, logOut } = useAccount(Account);
  const { showAlert } = useDialog();

  // Use Jazz's built-in authentication state detection (recommended by Jazz docs)
  // This automatically syncs with BetterAuth plugin and handles OAuth callbacks
  const isAuthenticated = useIsAuthenticated();

  // View mode state - defaults to "classic" to preserve existing experience
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem('view-mode');
    return (stored === 'simplified' ? 'simplified' : 'classic') as ViewMode;
  });

  // Persist view mode preference to localStorage
  useEffect(() => {
    localStorage.setItem('view-mode', viewMode);
  }, [viewMode]);

  // Track if user explicitly signed out (reactive state)
  const [userSignedOut, setUserSignedOut] = useState(
    () => localStorage.getItem('user-signed-out') === 'true',
  );

  // Track authentication state for localStorage flags
  useEffect(() => {
    if (isAuthenticated) {
      localStorage.setItem('had-session', 'true');
      localStorage.removeItem('user-signed-out');
      setUserSignedOut(false); // Update reactive state
    }
  }, [isAuthenticated]);

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
            isAuthenticated,
          });
        } catch (error) {
          console.error('[AuthGate] Error loading account state:', error);
        }
      };

      logAccountState();
    }
  }, [me, isAuthenticated]);

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
    setShowSignInDialog(true);
  };

  const handleGoogleSignIn = () => {
    // Clear the signed-out flag when user signs in
    localStorage.removeItem('user-signed-out');

    // Use BetterAuth client API - this redirects to Google OAuth
    // Don't specify callbackURL - let BetterAuth handle the OAuth callback automatically
    // at /api/auth/callback/google, then it will redirect back to the app root
    betterAuthClient.signIn.social({
      provider: 'google',
    });
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
    setUserSignedOut(true); // Update reactive state

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

  // Wait for Jazz account to be initialized
  if (!me) {
    return <LoadingScreen />;
  }

  // If authenticated with BetterAuth and has Jazz account, show the app with sign out
  if (isAuthenticated && !userSignedOut) {
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
