import type { InviteAcceptanceState } from '@jbroll/rowboat-sharing-react';
import {
  SharingError,
  stashInviteToken,
  useInviteAcceptance,
  useSharing,
} from '@jbroll/rowboat-sharing-react';
import { Apple, Check, Loader2, Share2, XCircle } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { signIn, signOut, useAuthor, useSession } from '@/rowboat';
import { logSharingError, withErrorCode } from './sharingErrorText';

const REDIRECT_AFTER_ACCEPT_MS = 2000;

interface InviteAcceptPageProps {
  token: string;
}

type ValidInvite = Extract<InviteAcceptanceState, { status: 'valid' }>;

function inviteErrorMessage(state: Extract<InviteAcceptanceState, { status: 'error' }>): string {
  return withErrorCode(baseInviteErrorMessage(state), state.error);
}

function baseInviteErrorMessage(state: Extract<InviteAcceptanceState, { status: 'error' }>) {
  // The server collapses invalid, expired, used, and addressed-to-someone-else into one answer.
  if (state.reason === 'invalid') return 'This invite link is no longer valid.';
  if (state.error instanceof SharingError && state.error.code === 'inviter_no_longer_admin') {
    return 'The person who invited you can no longer share this list.';
  }
  return 'Something went wrong with this invite. Please try again.';
}

export function InviteAcceptPage({ token }: InviteAcceptPageProps) {
  const sharing = useSharing({
    apiBaseUrl: '/api/shares',
    fetchFn: (input, init) => fetch(input, { ...init, credentials: 'include' }),
  });

  const author = useAuthor();
  const session = useSession();
  const userEmail = session.data?.user?.email ?? '';

  const { state, accept } = useInviteAcceptance({
    token,
    isAuthenticated: author !== null,
    sessionPending: session.isPending,
    sharing,
  });

  const failure = state.status === 'error' ? state.error : null;
  useEffect(() => logSharingError('invite', failure), [failure]);

  // The shared folder appears once the next sync pulls it: visibility follows group membership.
  useEffect(() => {
    if (state.status !== 'accepted') return;
    const timer = setTimeout(() => {
      window.location.href = '/';
    }, REDIRECT_AFTER_ACCEPT_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  const handleDecline = () => {
    window.location.href = '/';
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md">
        {state.status === 'loading' && <LoadingState />}

        {state.status === 'not_authenticated' && <NotAuthenticatedState token={token} />}

        {state.status === 'wrong_account' && (
          <EmailMismatchState userEmail={userEmail} token={token} />
        )}

        {state.status === 'valid' && (
          <ValidInviteState
            invite={state}
            onAccept={() => void accept()}
            onDecline={handleDecline}
          />
        )}

        {state.status === 'accepting' && <AcceptingState />}

        {state.status === 'accepted' && <SuccessState />}

        {state.status === 'error' && <ErrorState message={inviteErrorMessage(state)} />}
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
    stashInviteToken(token);
    signIn.social({
      provider: 'google',
      callbackURL: window.location.origin,
    });
  };

  const handleAppleSignIn = () => {
    stashInviteToken(token);
    signIn.social({
      provider: 'apple',
      callbackURL: window.location.origin,
    });
  };

  // Sign in BEFORE any invite details are shown. The invite's sender, role and recipient are
  // never disclosed to a caller who hasn't authenticated as a checklist user, so this screen
  // intentionally shows no details about it.
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
            await signOut();
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
  invite: ValidInvite;
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
        {invite.inviter.deleted ? 'Someone' : invite.inviter.email} has invited you to{' '}
        {invite.targetName ?? 'collaborate'}
      </p>

      <RoleDetails role={invite.role} />

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
 * Display role level with rowboat's role names (reader/writer/admin).
 */
function RoleDetails({ role }: { role: string | null }) {
  const labels: Record<string, { name: string; description: string }> = {
    reader: { name: 'Reader', description: 'You can view items in this folder' },
    writer: { name: 'Writer', description: 'You can view and modify items in this folder' },
    admin: { name: 'Admin', description: 'You have full control including sharing permissions' },
  };

  const info = labels[role ?? ''] ?? { name: role, description: '' };

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
