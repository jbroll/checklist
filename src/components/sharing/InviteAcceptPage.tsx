import { Apple, Check, Loader2, Share2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { betterAuthClient } from '@/lib/auth-client';
import { useAccount } from '@/lib/jazz';
import { Account } from '@/schemas';

interface InviteAcceptPageProps {
  token: string;
}

interface InviteValidation {
  valid: boolean;
  senderEmail?: string;
  recipientEmail?: string;
  permission?: string;
  error?: string;
}

type PageState =
  | { type: 'loading' }
  | { type: 'not_authenticated' }
  | { type: 'email_mismatch'; inviteEmail: string; userEmail: string }
  | { type: 'valid'; invite: InviteValidation }
  | { type: 'accepting' }
  | { type: 'success'; folderId: string }
  | { type: 'error'; message: string };

export function InviteAcceptPage({ token }: InviteAcceptPageProps) {
  const { me } = useAccount(Account);
  const [state, setState] = useState<PageState>({ type: 'loading' });

  // Validate the invite token
  useEffect(() => {
    async function validateInvite() {
      try {
        const response = await fetch(`/api/shares/validate/${token}`);
        const data: InviteValidation = await response.json();

        if (!data.valid) {
          setState({
            type: 'error',
            message: getErrorMessage(data.error || 'invalid'),
          });
          return;
        }

        // Get current user session from BetterAuth
        const sessionResult = await betterAuthClient.getSession();

        // Check if user is authenticated
        if (!sessionResult?.data?.user || !me) {
          setState({ type: 'not_authenticated' });
          return;
        }

        // Check if email matches
        const userEmail = sessionResult.data.user.email;
        if (userEmail !== data.recipientEmail) {
          setState({
            type: 'email_mismatch',
            inviteEmail: data.recipientEmail || '',
            userEmail: userEmail || '',
          });
          return;
        }

        setState({ type: 'valid', invite: data });
      } catch (error) {
        console.error('Failed to validate invite:', error);
        setState({ type: 'error', message: 'Failed to load invite. Please try again.' });
      }
    }

    validateInvite();
  }, [token, me]);

  const handleAccept = async () => {
    setState({ type: 'accepting' });

    try {
      const response = await fetch('/api/shares/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to accept invite');
      }

      const data = await response.json();
      setState({ type: 'success', folderId: data.folderId });

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error) {
      console.error('Failed to accept invite:', error);
      setState({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to accept invite',
      });
    }
  };

  const handleDecline = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 p-4">
      <div className="w-full max-w-md">
        {state.type === 'loading' && <LoadingState />}

        {state.type === 'not_authenticated' && <NotAuthenticatedState token={token} />}

        {state.type === 'email_mismatch' && (
          <EmailMismatchState
            inviteEmail={state.inviteEmail}
            userEmail={state.userEmail}
            token={token}
          />
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
    <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-green-600" />
        <p className="text-neutral-600">Loading invite...</p>
      </div>
    </div>
  );
}

function NotAuthenticatedState({ token }: { token: string }) {
  const handleGoogleSignIn = () => {
    // Trigger Google OAuth sign-in with invite token in redirect URL
    betterAuthClient.signIn.social({
      provider: 'google',
      callbackURL: `${window.location.origin}?inviteToken=${token}`,
    });
  };

  const handleAppleSignIn = () => {
    // Trigger Apple OAuth sign-in with invite token in redirect URL
    betterAuthClient.signIn.social({
      provider: 'apple',
      callbackURL: `${window.location.origin}?inviteToken=${token}`,
    });
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <Share2 className="h-12 w-12 text-green-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-neutral-900">Sign In Required</h1>
      <p className="mb-6 text-center text-neutral-600">
        Please sign in to accept this folder invitation.
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

function EmailMismatchState({
  inviteEmail,
  userEmail,
  token,
}: {
  inviteEmail: string;
  userEmail: string;
  token: string;
}) {
  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <XCircle className="h-12 w-12 text-yellow-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-neutral-900">Email Mismatch</h1>
      <div className="mb-6 space-y-2 text-center text-sm">
        <p className="text-neutral-600">This invite was sent to:</p>
        <p className="font-medium text-neutral-900">{inviteEmail}</p>
        <p className="text-neutral-600">You are currently signed in as:</p>
        <p className="font-medium text-neutral-900">{userEmail}</p>
      </div>
      <p className="mb-6 text-center text-neutral-600">
        Please sign in with the invited email address to accept this invitation.
      </p>
      <div className="flex flex-col gap-3">
        <Button
          className="w-full"
          onClick={async () => {
            // Sign out and redirect with invite token in URL
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
    <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <Share2 className="h-12 w-12 text-green-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-neutral-900">Folder Invitation</h1>
      <p className="mb-6 text-center text-neutral-600">
        {invite.senderEmail} has invited you to collaborate
      </p>

      <div className="mb-6 space-y-3 rounded-lg bg-neutral-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-600">Permission Level:</span>
          <span className="font-medium text-neutral-900">
            {invite.permission === 'view' && 'View Only'}
            {invite.permission === 'edit' && 'Can Edit'}
            {invite.permission === 'admin' && 'Admin'}
          </span>
        </div>
        <div className="text-sm text-neutral-600">
          {invite.permission === 'view' && 'You can view items in this folder'}
          {invite.permission === 'edit' && 'You can view and modify items in this folder'}
          {invite.permission === 'admin' && 'You have full control including sharing permissions'}
        </div>
      </div>

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
    <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-green-600" />
        <p className="text-neutral-600">Granting access...</p>
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
      <h1 className="mb-2 text-center text-2xl font-bold text-red-900">Invalid Invite</h1>
      <p className="mb-6 text-center text-red-700">{message}</p>
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

function getErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'not_found':
      return 'This invite link is invalid or has been revoked.';
    case 'expired':
      return 'This invite link has expired.';
    case 'already_accepted':
      return 'This invite has already been accepted.';
    default:
      return 'This invite link is no longer valid.';
  }
}
