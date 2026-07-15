import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useAuthor, useSession } from '@/jazz';
import {
  clearMergeState,
  finalizeMerge,
  loadMergeState,
  mergeInfo,
  prepareMerge,
  saveMergeState,
  startMerge,
} from '@/lib/account-merge';
import { betterAuthClient } from '@/lib/auth-client';

type FlowState =
  | 'entry'
  | 'processing'
  | 'awaiting-source-login'
  | 'awaiting-target-login'
  | 'confirm'
  | 'success'
  | 'error';

export default function MergeAccountFlow() {
  // `useAuthor()` is `null` both while the session hasn't resolved yet AND once it's
  // confirmed there is none (anonymous); `useSession().isPending` is what distinguishes
  // "loading" from "confirmed anonymous/authenticated".
  const author = useAuthor();
  const session = useSession();
  const isAuthenticated = author !== null;

  // Guards the one-shot phase processing so the mount effect runs exactly once per
  // phase once the session has settled, instead of firing before auth resolves.
  const dispatchedRef = useRef<string | null>(null);
  const [flowState, setFlowState] = useState<FlowState>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mergeNonce, setMergeNonce] = useState<string | null>(null);
  const [sourceEmail, setSourceEmail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    async function handleMergeFlow() {
      if (session.isPending) {
        // Session not yet resolved — wait.
        return;
      }

      const urlNonce = new URLSearchParams(window.location.search).get('merge');
      const state = loadMergeState();

      if (!urlNonce || !state) {
        // No merge in progress — show the entry screen (already-authenticated user).
        if (dispatchedRef.current !== 'entry') {
          dispatchedRef.current = 'entry';
          setFlowState('entry');
        }
        return;
      }

      // Both phases act on the just-signed-in identity. Until the session has settled
      // to an authenticated account, leave flowState untouched — we may be showing the
      // 'awaiting-*-login' prompt that a sign-in handler just set, which must not be
      // clobbered, or the user can never sign in as the other account.
      if (!isAuthenticated) return;

      // One-shot per (phase, nonce, authenticated user): run exactly once the real
      // signed-in session has settled.
      const dispatchKey = `${state.phase}:${state.nonce}:${author}`;
      if (dispatchedRef.current === dispatchKey) return;
      dispatchedRef.current = dispatchKey;

      setMergeNonce(state.nonce);

      if (state.phase === 'awaiting-source') {
        // Now signed in as source. Let the server record the source, then prompt
        // signing back in as the target to finish.
        setFlowState('processing');
        try {
          await prepareMerge(state.nonce);
          saveMergeState({ nonce: state.nonce, phase: 'awaiting-target' });
          await betterAuthClient.signOut();
          setFlowState('awaiting-target-login');
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
          setFlowState('error');
        }
        return;
      }

      if (state.phase === 'awaiting-target') {
        // Signed back in as target. Fetch the source account's email so the human
        // can confirm before we finalize — finalize must never run without that
        // explicit confirmation.
        setFlowState('processing');
        try {
          const info = await mergeInfo(state.nonce);
          setSourceEmail(info.sourceEmail);
          setFlowState('confirm');
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
          setFlowState('error');
        }
        return;
      }
    }

    handleMergeFlow();
  }, [author, isAuthenticated, session.isPending]);

  async function handleStartMerge() {
    setFlowState('processing');
    try {
      const { nonce } = await startMerge();
      saveMergeState({ nonce, phase: 'awaiting-source' });
      await betterAuthClient.signOut();
      setMergeNonce(nonce);
      setFlowState('awaiting-source-login');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
      setFlowState('error');
    }
  }

  async function handleConfirm() {
    if (!mergeNonce) return;
    setFlowState('processing');
    try {
      await finalizeMerge(mergeNonce);
      clearMergeState();
      setFlowState('success');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
      setFlowState('error');
    }
  }

  async function handleSocialSignIn(provider: 'google' | 'apple') {
    if (!mergeNonce) return;
    const callbackURL = `${window.location.origin}/?merge=${mergeNonce}`;
    await betterAuthClient.signIn.social({ provider, callbackURL });
  }

  async function handleEmailSignIn(e: FormEvent) {
    e.preventDefault();
    if (!email || !password || !mergeNonce) return;
    const callbackURL = `${window.location.origin}/?merge=${mergeNonce}`;
    setErrorMessage(null);
    try {
      const result = await betterAuthClient.signIn.email({ email, password, callbackURL });
      if (result?.error) {
        setErrorMessage(result.error.message || 'Invalid email or password');
        return;
      }
      // Email+password sign-in returns JSON and does NOT follow callbackURL the
      // way social sign-in does, so navigate to the merge callback ourselves to
      // re-mount MergeAccountFlow as the newly authenticated account.
      window.location.href = callbackURL;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sign in failed');
    }
  }

  function handleCancel() {
    clearMergeState();
    window.location.href = '/';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md rounded-xl border border-border-default bg-surface-primary p-8 shadow-lg">
        {flowState === 'processing' && (
          <div className="text-center">
            <Loader2 className="mx-auto h-12 w-12 animate-spin text-accent-primary" />
            <h1 className="mt-4 text-xl font-semibold text-text-primary">Processing...</h1>
            <p className="mt-2 text-text-secondary">Please wait while we merge your accounts.</p>
          </div>
        )}

        {flowState === 'entry' && (
          <div className="text-center">
            <h1 className="text-xl font-semibold text-text-primary">Combine Another Account</h1>
            <p className="mt-2 text-text-secondary">
              You can merge another account into this one. Your folders from the other account will
              be moved here.
            </p>
            <p className="mt-2 text-sm text-text-tertiary">
              You'll be signed out temporarily to sign in as the other account.
            </p>
            <button
              type="button"
              data-testid="merge-start"
              onClick={handleStartMerge}
              className="mt-6 w-full rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Combine another account
            </button>
          </div>
        )}

        {(flowState === 'awaiting-source-login' || flowState === 'awaiting-target-login') && (
          <div className="text-center">
            <h1 className="text-xl font-semibold text-text-primary">
              {flowState === 'awaiting-source-login'
                ? 'Sign in as the other account'
                : 'Sign back into your main account'}
            </h1>
            <p className="mt-2 text-text-secondary">
              {flowState === 'awaiting-source-login'
                ? 'Sign in as the account whose folders you want to merge.'
                : 'Sign back in as your primary account to complete the merge.'}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => handleSocialSignIn('google')}
                className="w-full rounded-lg border border-border-default px-6 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary"
              >
                Continue with Google
              </button>
              <button
                type="button"
                onClick={() => handleSocialSignIn('apple')}
                className="w-full rounded-lg border border-border-default px-6 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary"
              >
                Continue with Apple
              </button>
            </div>
            <form onSubmit={handleEmailSignIn} className="mt-6 flex flex-col gap-3 text-left">
              <input
                type="email"
                data-testid="merge-login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className="w-full rounded-lg border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
              <input
                type="password"
                data-testid="merge-login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
              <button
                type="submit"
                data-testid="merge-login-submit"
                className="w-full rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
              >
                Sign in with email
              </button>
            </form>
            {errorMessage && <p className="mt-3 text-sm text-red-500">{errorMessage}</p>}
            <button
              type="button"
              onClick={handleCancel}
              className="mt-4 text-sm text-text-tertiary underline"
            >
              Cancel merge
            </button>
          </div>
        )}

        {flowState === 'confirm' && (
          <div className="text-center">
            <h1 className="text-xl font-semibold text-text-primary">Confirm merge</h1>
            <p className="mt-2 text-text-secondary">
              You're combining the account <strong>{sourceEmail ?? 'the other account'}</strong>{' '}
              into this one. This cannot be undone.
            </p>
            <button
              type="button"
              data-testid="merge-confirm"
              onClick={handleConfirm}
              className="mt-6 w-full rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Confirm merge
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="mt-4 text-sm text-text-tertiary underline"
            >
              Cancel merge
            </button>
          </div>
        )}

        {flowState === 'success' && (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <h1 className="mt-4 text-xl font-semibold text-text-primary">Merge complete!</h1>
            <p className="mt-2 text-text-secondary">Your accounts have been combined.</p>
            <a
              href="/"
              className="mt-6 inline-block rounded-lg bg-accent-primary px-6 py-2 text-sm font-medium text-white hover:bg-accent-primary/90"
            >
              Go to App
            </a>
          </div>
        )}

        {flowState === 'error' && (
          <div className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-xl font-semibold text-text-primary">Something went wrong</h1>
            <p className="mt-2 text-text-secondary">{errorMessage}</p>
            <button
              type="button"
              onClick={handleCancel}
              className="mt-6 w-full rounded-lg border border-border-default px-6 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary"
            >
              Cancel merge
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
