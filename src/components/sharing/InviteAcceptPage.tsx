import type { CoMap, ID } from 'jazz-tools';
import {
  AlertTriangle,
  Apple,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Share2,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { betterAuthClient } from '@/lib/auth-client';
import { useAccount } from '@/lib/jazz';
import { Account, FolderNode } from '@/schemas';
import type { InAppBrowserInfo } from '@/utils/inAppBrowserDetection';
import { copyToClipboard, getCurrentUrl } from '@/utils/inAppBrowserDetection';
import { useInAppBrowserDetection } from './InAppBrowserWarning';

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
  | { type: 'in_app_browser' }
  | { type: 'loading' }
  | { type: 'not_authenticated' }
  | { type: 'email_mismatch'; inviteEmail: string; userEmail: string }
  | { type: 'valid'; invite: InviteValidation }
  | { type: 'accepting' }
  | { type: 'success'; folderId: string }
  | { type: 'error'; message: string };

export function InviteAcceptPage({ token }: InviteAcceptPageProps) {
  const { me } = useAccount(Account);
  const browserInfo = useInAppBrowserDetection();
  const [state, setState] = useState<PageState>(() =>
    browserInfo.isInAppBrowser ? { type: 'in_app_browser' } : { type: 'loading' },
  );

  // Track if we've moved past the initial validation phase
  // Once we're in accepting/success/error state, don't re-validate
  const hasStartedAcceptingRef = useRef(false);

  // Validate the invite token
  useEffect(() => {
    // Don't validate if in-app browser
    if (browserInfo.isInAppBrowser) {
      return;
    }

    // Don't re-validate if we've already started accepting or completed
    if (hasStartedAcceptingRef.current) {
      return;
    }

    async function doValidation() {
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

    doValidation();
  }, [token, me, browserInfo.isInAppBrowser]);

  const handleAccept = async () => {
    // Mark that we've started accepting - prevents re-validation on me changes
    hasStartedAcceptingRef.current = true;
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

      // Load the shared folder and add it to root.folders if not already present
      if (me?.root?.folders && data.folderId) {
        try {
          // Load the folder CoValue using the ID from the accept response
          const folder = await FolderNode.load(data.folderId as ID<CoMap>, {
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
        {state.type === 'in_app_browser' && <InAppBrowserState browserInfo={browserInfo} />}

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

function InAppBrowserState({ browserInfo }: { browserInfo: InAppBrowserInfo }) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const url = getCurrentUrl();
    const success = await copyToClipboard(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const browserName = browserInfo.browserName || 'this app';

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <div className="rounded-full bg-amber-100 p-3">
          <AlertTriangle className="h-8 w-8 text-amber-600" />
        </div>
      </div>

      <h1 className="mb-2 text-center text-2xl font-bold text-neutral-900">Open in Browser</h1>

      <p className="mb-4 text-center text-neutral-600">
        You're viewing this page in <span className="font-medium">{browserName}</span>'s built-in
        browser, which doesn't support sign-in properly.
      </p>

      <div className="mb-6 rounded-lg bg-white p-4 border border-amber-200">
        <div className="flex items-start gap-3">
          <ExternalLink className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-neutral-700">
            <p className="font-medium mb-1">How to open in your browser:</p>
            <p>{browserInfo.openInBrowserInstructions}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <Button
          className="w-full"
          onClick={handleCopyLink}
          variant={copied ? 'primary' : 'outline'}
        >
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Link Copied!
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copy Link
            </>
          )}
        </Button>

        <p className="text-center text-xs text-neutral-500">
          Copy this link and paste it in Safari, Chrome, or your preferred browser.
        </p>
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
