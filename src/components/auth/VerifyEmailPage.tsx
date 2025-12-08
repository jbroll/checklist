import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { betterAuthClient } from '@/lib/auth-client';

type VerifyState = 'loading' | 'success' | 'error' | 'not_authenticated';

export function VerifyEmailPage() {
  const [state, setState] = useState<VerifyState>('loading');
  const [email, setEmail] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      // Get token from URL
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setState('error');
        setErrorMessage('No verification token found');
        return;
      }

      // Check if user is authenticated
      const session = await betterAuthClient.getSession();
      if (!session?.data?.user) {
        setState('not_authenticated');
        return;
      }

      // Call backend to confirm verification
      try {
        const response = await fetch('/api/verified-emails/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setState('success');
          setEmail(data.email);
        } else {
          setState('error');
          setErrorMessage(data.error || 'Verification failed');
        }
      } catch (error) {
        console.error('Verification error:', error);
        setState('error');
        setErrorMessage('Network error. Please try again.');
      }
    }

    verify();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-primary p-8 shadow-lg">
        {state === 'loading' && (
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-accent-primary" />
            <h1 className="mt-4 text-xl font-semibold text-text-primary">Verifying email...</h1>
            <p className="mt-2 text-text-secondary">
              Please wait while we verify your email address.
            </p>
          </div>
        )}

        {state === 'success' && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-xl font-semibold text-text-primary">Email Verified!</h1>
            <p className="mt-2 text-text-secondary">
              <strong>{email}</strong> has been added to your account.
            </p>
            <p className="mt-1 text-sm text-text-tertiary">
              You can now receive shares sent to this email address.
            </p>
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Go to App
            </a>
          </div>
        )}

        {state === 'not_authenticated' && (
          <div className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-amber-500" />
            <h1 className="mt-4 text-xl font-semibold text-text-primary">Sign In Required</h1>
            <p className="mt-2 text-text-secondary">Please sign in to verify this email address.</p>
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Sign In
            </a>
          </div>
        )}

        {state === 'error' && (
          <div className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-xl font-semibold text-text-primary">Verification Failed</h1>
            <p className="mt-2 text-text-secondary">{errorMessage}</p>
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Go to App
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
