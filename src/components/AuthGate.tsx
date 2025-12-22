import { useAccount, useIsAuthenticated, useLogOut } from 'jazz-tools/react';
import { useEffect, useState } from 'react';
import { useViewStateCleanup } from '@/hooks/useViewStateCleanup';
import { betterAuthClient } from '@/lib/auth-client';
import { useDialog } from '@/lib/dialog-context';
import { Account } from '@/schemas';
import * as folderService from '@/services/folderService';
import { EmailAuthDialog } from './auth/EmailAuthDialog';
import { SignInDialog } from './auth/SignInDialog';
import { AppContainer } from './editor/AppContainer';
import { LoadingScreen } from './ui/loading';

export type ViewMode = 'classic' | 'simplified';

export function AuthGate() {
  // Check if user just verified their email
  // Use sessionStorage to persist across remounts (Jazz can cause remounts during init)
  const [showEmailAuthDialog, setShowEmailAuthDialog] = useState(() => {
    // Check sessionStorage first (survives remounts)
    const stored = sessionStorage.getItem('show-signin-after-verify');
    if (stored === 'true') {
      return true;
    }

    // Check URL params
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('verified') === 'true';
  });
  const [showSignInDialog, setShowSignInDialog] = useState(false);

  // Handle side effects for email verification dialog (moved from useState initializer)
  useEffect(() => {
    if (showEmailAuthDialog) {
      // Clean up sessionStorage flag
      sessionStorage.removeItem('show-signin-after-verify');
      // Clean up URL if it has the verified param
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('verified') === 'true') {
        // Store in sessionStorage in case of remount before cleanup
        sessionStorage.setItem('show-signin-after-verify', 'true');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [showEmailAuthDialog]);
  // Jazz 0.19: useAccount returns MaybeLoaded, need explicit type handling
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.19 MaybeLoaded type requires runtime checks
  const me = useAccount(Account) as any;
  const logOut = useLogOut();
  const { showAlert, showConfirm } = useDialog();
  const isAuthenticated = useIsAuthenticated();

  // Run viewState cleanup in the background
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue with optional root
  useViewStateCleanup(me as any);

  // View mode state - defaults to "simplified" for new users
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const stored = localStorage.getItem('view-mode');
    return stored ? (stored as ViewMode) : 'simplified';
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
    // Each domain (app.kjekit.com, checklist.rkroll.com) uses its own origin
    betterAuthClient.signIn.social({
      provider: 'google',
    });
  };

  const handleAppleSignIn = () => {
    // Clear the signed-out flag when user signs in
    localStorage.removeItem('user-signed-out');
    setUserSignedOut(false);

    // BetterAuth handles OAuth redirect automatically
    betterAuthClient.signIn.social({
      provider: 'apple',
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

  const handleDeleteAccount = async () => {
    // Show confirmation dialog
    const confirmed = await showConfirm({
      title: 'Delete Account',
      message:
        'This will permanently delete your account and all your data.\n\n' +
        'This action cannot be undone. Are you sure you want to continue?',
      confirmText: 'Delete Account',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    try {
      // Call the delete account API FIRST to remove BetterAuth user
      // This order ensures we don't lose Jazz data if the API call fails
      const response = await fetch('/api/account', {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete account');
      }

      // Only delete Jazz data AFTER API call succeeds
      // This ensures data is actually deleted from Jazz, not just orphaned
      if (me) {
        // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
        folderService.deleteAllUserData(me as any);
      }

      // Sign out after successful deletion
      localStorage.setItem('user-signed-out', 'true');
      setUserSignedOut(true);

      try {
        await logOut();
      } catch {
        // Silently ignore logOut errors
      }

      // Clean up Jazz local storage and IndexedDB
      // This ensures no local data remnants after account deletion
      const jazzKeys = Object.keys(localStorage).filter(
        (key) => key.startsWith('jazz-') || key.startsWith('co_z'),
      );
      for (const key of jazzKeys) {
        localStorage.removeItem(key);
      }

      try {
        indexedDB.deleteDatabase('jazz-storage');
      } catch {
        // Silently ignore IndexedDB errors
      }

      await showAlert({
        title: 'Account Deleted',
        message: 'Your account has been permanently deleted.',
      });
    } catch (error) {
      await showAlert({
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to delete account',
      });
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
        onDeleteAccount={handleDeleteAccount}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isAuthenticated={true}
      />
    );
  }

  // Allow local mode - show app without authentication (Jazz creates anonymous account)
  return (
    <>
      <EmailAuthDialog open={showEmailAuthDialog} onOpenChange={setShowEmailAuthDialog} />
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
