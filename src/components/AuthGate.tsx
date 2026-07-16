import { useEffect, useState } from 'react';
import { useDialog } from '@/lib/dialog-context';
import { signIn, signOut, useAuthor, useSession } from '@/rowboat';
import { EmailAuthDialog } from './auth/EmailAuthDialog';
import { SignInDialog } from './auth/SignInDialog';
import { AppContainer } from './editor/AppContainer';

export function AuthGate() {
  // Check if user just verified their email
  // Use sessionStorage to persist across remounts
  const [showEmailAuthDialog, setShowEmailAuthDialog] = useState(() => {
    const stored = sessionStorage.getItem('show-signin-after-verify');
    if (stored === 'true') {
      return true;
    }
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('verified') === 'true';
  });
  const [showSignInDialog, setShowSignInDialog] = useState(false);

  useEffect(() => {
    if (showEmailAuthDialog) {
      sessionStorage.removeItem('show-signin-after-verify');
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('verified') === 'true') {
        sessionStorage.setItem('show-signin-after-verify', 'true');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [showEmailAuthDialog]);

  // `useAuthor()` is `null` both while the session hasn't resolved yet AND once it's
  // confirmed there is none (anonymous); `useSession().isPending` is what distinguishes
  // "loading" from "confirmed anonymous".
  const author = useAuthor();
  const session = useSession();
  const isAuthenticated = author !== null;
  const { showAlert, showConfirm } = useDialog();

  const [userSignedOut, setUserSignedOut] = useState(
    () => localStorage.getItem('user-signed-out') === 'true',
  );

  useEffect(() => {
    if (isAuthenticated) {
      localStorage.removeItem('user-signed-out');
      setUserSignedOut(false);

      const pendingToken = sessionStorage.getItem('pending-invite-token');
      if (pendingToken) {
        sessionStorage.removeItem('pending-invite-token');
        const TOKEN_REGEX = /^[a-zA-Z0-9_-]+$/;
        const MAX_TOKEN_LENGTH = 128;
        if (TOKEN_REGEX.test(pendingToken) && pendingToken.length <= MAX_TOKEN_LENGTH) {
          window.location.href = `/invite/${pendingToken}`;
          return;
        }
      }

      const urlParams = new URLSearchParams(window.location.search);
      const inviteToken = urlParams.get('inviteToken');
      if (inviteToken) {
        const TOKEN_REGEX = /^[a-zA-Z0-9_-]+$/;
        const MAX_TOKEN_LENGTH = 128;
        if (TOKEN_REGEX.test(inviteToken) && inviteToken.length <= MAX_TOKEN_LENGTH) {
          window.location.href = `/invite/${inviteToken}`;
        }
      }
    }
  }, [isAuthenticated]);

  const handleShowSignInDialog = () => {
    setShowSignInDialog(true);
  };

  const handleGoogleSignIn = () => {
    localStorage.removeItem('user-signed-out');
    setUserSignedOut(false);
    signIn.social({ provider: 'google', callbackURL: window.location.origin });
  };

  const handleAppleSignIn = () => {
    localStorage.removeItem('user-signed-out');
    setUserSignedOut(false);
    signIn.social({ provider: 'apple', callbackURL: window.location.origin });
  };

  const handleSignOut = async () => {
    localStorage.setItem('user-signed-out', 'true');
    setUserSignedOut(true);

    try {
      await signOut();
    } catch (error) {
      console.error('[AuthGate] Sign out failed:', error);
    }
  };

  const handleDeleteAccount = async () => {
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
      // DELETE /api/account first — this order ensures we don't lose local data if the
      // server call fails.
      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete account');
      }

      localStorage.setItem('user-signed-out', 'true');
      setUserSignedOut(true);

      try {
        await signOut();
      } catch {
        // Silently ignore sign-out errors — the account is already deleted server-side.
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

  // Wait for the session to resolve before deciding which screen to show.
  if (session.isPending) {
    return null;
  }

  if (isAuthenticated && !userSignedOut) {
    return (
      <AppContainer
        key={`auth-${author}`}
        onSignOut={handleSignOut}
        onDeleteAccount={handleDeleteAccount}
        isAuthenticated={true}
      />
    );
  }

  // Anonymous mode — the app works fully offline-first without signing in.
  return (
    <>
      <EmailAuthDialog open={showEmailAuthDialog} onOpenChange={setShowEmailAuthDialog} />
      <SignInDialog
        open={showSignInDialog}
        onOpenChange={setShowSignInDialog}
        onGoogleSignIn={handleGoogleSignIn}
        onAppleSignIn={handleAppleSignIn}
      />
      <AppContainer key="anon" onSignIn={handleShowSignInDialog} isAuthenticated={false} />
    </>
  );
}
