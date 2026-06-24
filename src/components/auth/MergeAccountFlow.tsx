import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/jazz';
import {
  adoptFolders,
  clearMergeState,
  finalizeMerge,
  loadMergeState,
  prepareMerge,
  saveMergeState,
  shareTopLevelFoldersTo,
  startMerge,
} from '@/lib/account-merge';
import { betterAuthClient } from '@/lib/auth-client';
import { ACCOUNT_RESOLVE, Account } from '@/schema';

type FlowState =
  | 'entry'
  | 'processing'
  | 'awaiting-source-login'
  | 'awaiting-target-login'
  | 'success'
  | 'error'
  | 'mismatch';

export default function MergeAccountFlow() {
  // biome-ignore lint/suspicious/noExplicitAny: Jazz account passed to merge helpers
  const me = useAccount(Account, { resolve: ACCOUNT_RESOLVE }) as any;
  const hasRun = useRef(false);
  const [flowState, setFlowState] = useState<FlowState>('processing');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mergeNonce, setMergeNonce] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    async function handleMergeFlow() {
      if (!me) {
        // Account not yet loaded — wait
        return;
      }

      if (hasRun.current) return;
      hasRun.current = true;

      const state = loadMergeState();

      if (!state) {
        // No saved merge state — show entry screen
        setFlowState('entry');
        return;
      }

      if (state.phase === 'awaiting-source') {
        // Now signed in as source. Share folders to target, then prompt re-login.
        setFlowState('processing');
        try {
          const ids = await shareTopLevelFoldersTo(me, state.targetJazzId);
          await prepareMerge(state.nonce, ids);
          saveMergeState({
            ...state,
            adoptedFolderIds: ids,
            sourceJazzId: me.$jazz.id,
            phase: 'awaiting-target',
          });
          await betterAuthClient.signOut();
          setMergeNonce(state.nonce);
          setFlowState('awaiting-target-login');
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
          setFlowState('error');
        }
        return;
      }

      if (state.phase === 'awaiting-target') {
        // Signed back in as target. Verify identity.
        if (me.$jazz.id !== state.targetJazzId) {
          setFlowState('mismatch');
          return;
        }
        setFlowState('processing');
        try {
          await adoptFolders(me, state.adoptedFolderIds ?? [], state.sourceJazzId ?? '');
          await finalizeMerge(state.nonce);
          clearMergeState();
          setFlowState('success');
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : 'An error occurred');
          setFlowState('error');
        }
        return;
      }
    }

    handleMergeFlow();
  }, [me]);

  async function handleStartMerge() {
    setFlowState('processing');
    try {
      const { nonce, targetJazzId } = await startMerge();
      saveMergeState({ nonce, targetJazzId, phase: 'awaiting-source' });
      await betterAuthClient.signOut();
      setMergeNonce(nonce);
      setFlowState('awaiting-source-login');
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
      await betterAuthClient.signIn.email({ email, password, callbackURL });
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className="w-full rounded-lg border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full rounded-lg border border-border-default bg-surface-primary px-3 py-2 text-sm text-text-primary"
              />
              <button
                type="submit"
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

        {flowState === 'mismatch' && (
          <div className="text-center">
            <XCircle className="mx-auto h-12 w-12 text-red-500" />
            <h1 className="mt-4 text-xl font-semibold text-text-primary">Account Mismatch</h1>
            <p className="mt-2 text-text-secondary">
              You are signed in as a different account than expected. Please sign in as your main
              account to complete the merge.
            </p>
            <button
              type="button"
              onClick={handleCancel}
              className="mt-6 w-full rounded-lg border border-border-default px-6 py-2 text-sm font-medium text-text-primary hover:bg-surface-secondary"
            >
              Cancel merge
            </button>
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
