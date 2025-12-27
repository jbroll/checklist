/**
 * BillingCancelPage - Shown when user cancels Stripe checkout
 *
 * Reassures user that no charge was made and provides navigation options.
 */

import { ArrowLeft, XCircle } from 'lucide-react';
import { Button } from '../ui/button';

export function BillingCancelPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-secondary p-4">
      <div className="w-full max-w-md">
        <div className="rounded-lg border border-divider-primary bg-surface-elevated p-8 shadow-sm">
          <div className="mb-6 flex justify-center">
            <div className="rounded-full bg-neutral-100 dark:bg-neutral-800 p-3">
              <XCircle className="h-8 w-8 text-neutral-500" />
            </div>
          </div>
          <h1 className="mb-2 text-center text-2xl font-bold text-content-primary">
            Checkout Cancelled
          </h1>
          <p className="mb-6 text-center text-content-secondary">
            No worries! Your card was not charged. You can upgrade anytime from your profile.
          </p>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => {
                window.location.href = '/';
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
