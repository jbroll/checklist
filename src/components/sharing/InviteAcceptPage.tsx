import { Check, Loader2, Share2, XCircle } from 'lucide-react';
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
        const response = await fetch(`http://localhost:3001/api/shares/validate/${token}`);
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
      const response = await fetch('http://localhost:3001/api/shares/accept', {
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

        {state.type === 'not_authenticated' && <NotAuthenticatedState />}

        {state.type === 'email_mismatch' && (
          <EmailMismatchState inviteEmail={state.inviteEmail} userEmail={state.userEmail} />
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

function NotAuthenticatedState() {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <Share2 className="h-12 w-12 text-green-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-neutral-900">Sign In Required</h1>
      <p className="mb-6 text-center text-neutral-600">
        Please sign in to accept this folder invitation.
      </p>
      <Button
        className="w-full"
        onClick={() => {
          window.location.href = '/';
        }}
      >
        Go to Sign In
      </Button>
    </div>
  );
}

function EmailMismatchState({
  inviteEmail,
  userEmail,
}: {
  inviteEmail: string;
  userEmail: string;
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

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onDecline}>
          Decline
        </Button>
        <Button className="flex-1" onClick={onAccept}>
          Accept Invite
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
