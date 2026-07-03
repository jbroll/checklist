import { useSharing } from '@jbr-jazz/hierarchy-client';
import type { CoMap, ID } from 'jazz-tools';
import { Apple, Check, Loader2, Share2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { betterAuthClient } from '@/lib/auth-client';
import { useAccount } from '@/lib/jazz';
import { ACCOUNT_RESOLVE, Account, FolderNode } from '@/schema';

// CSRF header for API requests
const getAuthHeaders = async (): Promise<Record<string, string>> => ({
  'X-Requested-With': 'XMLHttpRequest',
});

interface InviteAcceptPageProps {
  token: string;
}

interface InviteValidation {
  valid: boolean;
  senderEmail?: string;
  permission?: string;
  error?: string;
}

type PageState =
  | { type: 'loading' }
  | { type: 'not_authenticated' }
  | { type: 'email_mismatch'; userEmail: string }
  | { type: 'valid'; invite: InviteValidation }
  | { type: 'accepting' }
  | { type: 'success'; targetId: string }
  | { type: 'error'; message: string };

export function InviteAcceptPage({ token }: InviteAcceptPageProps) {
  // Initialize useSharing hook
  const sharing = useSharing({
    apiBaseUrl: '',
    getAuthHeaders,
  });

  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.19 MaybeLoaded type requires runtime checks
  const me = useAccount(Account, { resolve: ACCOUNT_RESOLVE }) as any;
  // Stable account id for effect deps (the `me`/`sharing` object refs change every
  // render; depending on them floods /validate — see the useEffect below).
  const meId: string | null = me?.$jazz?.id ?? null;
  const [state, setState] = useState<PageState>({ type: 'loading' });

  // Track if we've moved past the initial validation phase
  // Once we're in accepting/success/error state, don't re-validate
  const hasStartedAcceptingRef = useRef(false);

  // Validate the invite token. Keyed on stable token + meId, NOT the me/sharing
  // object refs (they change every render -> infinite /validate loop). Read at call time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on meId by design
  useEffect(() => {
    // Don't re-validate if we've already started accepting or completed
    if (hasStartedAcceptingRef.current) {
      return;
    }

    async function doValidation() {
      try {
        const data = await sharing.validateInvite(token);

        // The backend discloses nothing about the invite until the caller is a
        // signed-in checklist user. Show the sign-in prompt, not invite details.
        if (data.error === 'unauthenticated') {
          setState({ type: 'not_authenticated' });
          return;
        }

        // Authenticated, but not the invited recipient: the backend withholds
        // the sender and all other details. Show the wrong-account recovery
        // screen (only the caller's own email, which they already know).
        if (data.error === 'email_mismatch') {
          const sessionResult = await betterAuthClient.getSession();
          setState({
            type: 'email_mismatch',
            userEmail: sessionResult?.data?.user?.email || '',
          });
          return;
        }

        if (!data.valid) {
          setState({
            type: 'error',
            message: getErrorMessage(data.error || 'invalid'),
          });
          return;
        }

        // Authenticated + valid: the recipient-email match is enforced
        // authoritatively by the backend on accept (case-insensitive, and it
        // also honors verified secondary emails), so we don't pre-check here.
        setState({ type: 'valid', invite: data as InviteValidation });
      } catch (error) {
        console.error('Failed to validate invite:', error);
        setState({ type: 'error', message: 'Failed to load invite. Please try again.' });
      }
    }

    doValidation();
  }, [token, meId]);

  const handleAccept = async () => {
    // Mark that we've started accepting - prevents re-validation on me changes
    hasStartedAcceptingRef.current = true;
    setState({ type: 'accepting' });

    try {
      const result = await sharing.acceptInvite(token);

      if (!result) {
        throw new Error(sharing.error?.message || 'Failed to accept invite');
      }

      // Load the shared folder and add it to root.folders if not already present
      if (me?.root?.folders && result.targetId) {
        try {
          // Load the folder CoValue using the ID from the accept response
          const folder = await FolderNode.load(result.targetId as ID<CoMap>, {
            loadAs: me,
          });

          if (folder) {
            // Check if folder is already in root.folders (avoid duplicates)
            const alreadyExists = me.root.folders.some(
              (f: { $jazz?: { id?: string } } | null) => f?.$jazz?.id === folder.$jazz.id,
            );

            if (!alreadyExists) {
              me.root.folders.$jazz.push(folder);
            }
          }
        } catch (loadError) {
          // Log but don't fail - user still got access, folder just won't appear immediately
          console.error('Failed to add folder to root:', loadError);
        }
      }

      setState({ type: 'success', targetId: result.targetId });

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error) {
      console.error('Failed to accept invite:', error);
      const message = error instanceof Error ? error.message : 'Failed to accept invite';

      // The backend rejects a non-recipient with an email-mismatch error. Show
      // the "wrong account" recovery screen (revealing only the signed-in email,
      // which the user already knows) instead of a generic failure.
      if (/not for your account/i.test(message)) {
        const sessionResult = await betterAuthClient.getSession();
        setState({
          type: 'email_mismatch',
          userEmail: sessionResult?.data?.user?.email || '',
        });
        return;
      }

      setState({ type: 'error', message });
    }
  };

  const handleDecline = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md">
        {state.type === 'loading' && <LoadingState />}

        {state.type === 'not_authenticated' && <NotAuthenticatedState token={token} />}

        {state.type === 'email_mismatch' && (
          <EmailMismatchState userEmail={state.userEmail} token={token} />
        )}

        {state.type === 'valid' && (
          <ValidInviteState
            invite={state.invite}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        )}

        {state.type === 'accepting' && <AcceptingState />}

        {state.type === 'success' && <SuccessState />}

        {state.type === 'error' && <ErrorState message={state.message} />}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-lg border border-divider-primary bg-surface-elevated p-8 shadow-sm">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-green-600" />
        <p className="text-content-secondary">Loading invite...</p>
      </div>
    </div>
  );
}

function NotAuthenticatedState({ token }: { token: string }) {
  const handleGoogleSignIn = () => {
    // Store invite token in sessionStorage to avoid exposing in OAuth callback URL
    sessionStorage.setItem('pending-invite-token', token);
    betterAuthClient.signIn.social({
      provider: 'google',
      callbackURL: window.location.origin,
    });
  };

  const handleAppleSignIn = () => {
    // Store invite token in sessionStorage to avoid exposing in OAuth callback URL
    sessionStorage.setItem('pending-invite-token', token);
    betterAuthClient.signIn.social({
      provider: 'apple',
      callbackURL: window.location.origin,
    });
  };

  // Sign in BEFORE any invite details are shown. The invite's sender, permission
  // and recipient are never disclosed to a caller who has not authenticated as a
  // checklist user, so this screen intentionally shows no details about it.
  return (
    <div className="rounded-lg border border-divider-primary bg-surface-elevated p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <Share2 className="h-12 w-12 text-green-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-content-primary">
        Sign In to Continue
      </h1>
      <p className="mb-6 text-center text-content-secondary">
        Sign in to view and accept this invitation.
      </p>
      <div className="space-y-3">
        <Button
          type="button"
          onClick={handleGoogleSignIn}
          variant="outline"
          className="w-full justify-start gap-3 py-6 text-base"
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
          variant="outline"
          className="w-full justify-start gap-3 py-6 text-base"
        >
          <Apple className="h-5 w-5" />
          Continue with Apple
        </Button>

        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

function EmailMismatchState({ userEmail, token }: { userEmail: string; token: string }) {
  return (
    <div className="rounded-lg border border-yellow-200 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <XCircle className="h-12 w-12 text-yellow-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-content-primary">Wrong Account</h1>
      <p className="mb-4 text-center text-content-secondary">
        This invite was sent to a different email address.
      </p>
      <p className="mb-6 text-center text-sm text-content-tertiary">
        You're signed in as {userEmail}
      </p>
      <div className="flex flex-col gap-3">
        <Button
          className="w-full"
          onClick={async () => {
            await betterAuthClient.signOut();
            window.location.href = `/invite/${token}`;
          }}
        >
          Sign In with Different Account
        </Button>
        <Button
          className="w-full"
          variant="outline"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

function ValidInviteState({
  invite,
  onAccept,
  onDecline,
}: {
  invite: InviteValidation;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="rounded-lg border border-divider-primary bg-surface-elevated p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <Share2 className="h-12 w-12 text-green-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-content-primary">
        Folder Invitation
      </h1>
      <p className="mb-6 text-center text-content-secondary">
        {invite.senderEmail} has invited you to collaborate
      </p>

      <PermissionDetails permission={invite.permission} />

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={onDecline}>
            Decline
          </Button>
          <Button className="flex-1" onClick={onAccept}>
            Accept Invite
          </Button>
        </div>
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

function AcceptingState() {
  return (
    <div className="rounded-lg border border-divider-primary bg-surface-elevated p-8 shadow-sm">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-green-600" />
        <p className="text-content-secondary">Granting access...</p>
      </div>
    </div>
  );
}

function SuccessState() {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <div className="rounded-full bg-green-600 p-3">
          <Check className="h-8 w-8 text-white" />
        </div>
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-green-900">Access Granted!</h1>
      <p className="mb-6 text-center text-green-700">
        The shared folder will appear in your dashboard.
      </p>
      <p className="text-center text-sm text-green-600">Redirecting to dashboard...</p>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <XCircle className="h-12 w-12 text-red-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-red-900">Invite Error</h1>
      <p className="mb-6 text-center text-red-700">{message}</p>
      <p className="mb-6 text-center text-sm text-red-600">
        Please read the message above before continuing.
      </p>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => {
          window.location.href = '/';
        }}
      >
        Go to Dashboard
      </Button>
    </div>
  );
}

/**
 * Display permission level with Jazz role names (reader/writer/admin)
 */
function PermissionDetails({ permission }: { permission?: string }) {
  const labels: Record<string, { name: string; description: string }> = {
    reader: { name: 'Reader', description: 'You can view items in this folder' },
    writer: { name: 'Writer', description: 'You can view and modify items in this folder' },
    admin: { name: 'Admin', description: 'You have full control including sharing permissions' },
  };

  const info = labels[permission || ''] || { name: permission, description: '' };

  return (
    <div className="mb-6 space-y-3 rounded-lg bg-surface-tertiary p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-content-secondary">Permission Level:</span>
        <span className="font-medium text-content-primary">{info.name}</span>
      </div>
      <div className="text-sm text-content-secondary">{info.description}</div>
    </div>
  );
}

function getErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'not_found':
      return 'This invite link is invalid or has been revoked.';
    case 'expired':
      return 'This invite link has expired.';
    case 'already_accepted':
      return 'This invite has already been accepted.';
    case 'already_member':
      return 'You already have access to this folder.';
    case 'self_invite':
      return 'You cannot accept an invite to your own folder.';
    default:
      return 'This invite link is no longer valid.';
  }
}
