/**
 * BillingSuccessPage - Shown after successful Stripe checkout
 *
 * Syncs subscription from backend and redirects to main app.
 */

import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRowboat } from '@/rowboat';
import {
  getSubscriptionTier,
  getTierDisplayName,
  syncSubscriptionFromBackend,
} from '@/services/subscriptionService';
import { Button } from '../ui/button';

type PageState =
  | { type: 'syncing' }
  | { type: 'success'; tierName: string }
  | { type: 'error'; message: string };

export function BillingSuccessPage() {
  const g = useRowboat();
  const [state, setState] = useState<PageState>({ type: 'syncing' });

  useEffect(() => {
    async function syncAndRedirect() {
      try {
        // Sync subscription from the backend into the local user_settings cache
        await syncSubscriptionFromBackend(g);

        // Get the updated tier
        const tier = getSubscriptionTier(g);
        const tierName = getTierDisplayName(tier);

        setState({ type: 'success', tierName });

        // Auto-redirect after 3 seconds
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      } catch (error) {
        console.error('Failed to sync subscription:', error);
        setState({
          type: 'error',
          message: 'Failed to activate subscription. Please refresh the page.',
        });
      }
    }

    syncAndRedirect();
  }, [g]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md">
        {state.type === 'syncing' && <SyncingState />}
        {state.type === 'success' && <SuccessState tierName={state.tierName} />}
        {state.type === 'error' && <ErrorState message={state.message} />}
      </div>
    </div>
  );
}

function SyncingState() {
  return (
    <div className="rounded-lg border border-divider-primary bg-surface-elevated p-8 shadow-sm">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-12 w-12 animate-spin text-green-600" />
        <p className="text-content-secondary">Activating your subscription...</p>
      </div>
    </div>
  );
}

function SuccessState({ tierName }: { tierName: string }) {
  return (
    <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <div className="rounded-full bg-green-600 p-3">
          <Check className="h-8 w-8 text-white" />
        </div>
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-green-900 dark:text-green-100">
        Thank you for upgrading!
      </h1>
      <p className="mb-6 text-center text-green-700 dark:text-green-300">
        Your <span className="font-semibold">{tierName}</span> subscription is now active.
      </p>
      <p className="mb-4 text-center text-sm text-green-600 dark:text-green-400">
        Redirecting to your lists...
      </p>
      <Button
        variant="outline"
        className="w-full border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800/30"
        onClick={() => {
          window.location.href = '/';
        }}
      >
        Go to Dashboard Now
      </Button>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-8 shadow-sm">
      <div className="mb-6 flex justify-center">
        <Loader2 className="h-12 w-12 text-amber-600" />
      </div>
      <h1 className="mb-2 text-center text-2xl font-bold text-amber-900 dark:text-amber-100">
        Almost There
      </h1>
      <p className="mb-6 text-center text-amber-700 dark:text-amber-300">{message}</p>
      <div className="flex flex-col gap-3">
        <Button
          className="w-full"
          onClick={() => {
            window.location.reload();
          }}
        >
          Refresh Page
        </Button>
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
    </div>
  );
}
