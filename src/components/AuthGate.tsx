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

  // Track if user explicitly signed out
  const [userSignedOut, setUserSignedOut] = useState(
    () => localStorage.getItem('user-signed-out') === 'true',
  );

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.removeItem('user-signed-out');
      setUserSignedOut(false);

      // Check for invite token in URL parameters after OAuth redirect
      const urlParams = new URLSearchParams(window.location.search);
      const inviteToken = urlParams.get('inviteToken');
      if (inviteToken) {
        // Redirect to the invite page and clean up URL
        window.location.href = `/invite/${inviteToken}`;
      }
    }
  }, [isAuthenticated]);

  // Get account ID for keying the AppContainer
  // The key forces a remount when switching between accounts
  const accountId = me?.$jazz.id;

  const handleShowSignInDialog = () => {
    setShowSignInDialog(true);
  };

  const handleGoogleSignIn = () => {
    // Clear the signed-out flag when user signs in
    localStorage.removeItem('user-signed-out');
    setUserSignedOut(false);

    // BetterAuth handles OAuth redirect automatically
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
        key={`auth-${accountId}`}
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
        key={`anon-${accountId}`}
        onSignIn={handleShowSignInDialog}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isAuthenticated={false}
      />
    </>
  );
}
