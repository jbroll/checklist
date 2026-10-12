import { Button } from '@/components/ui/button';

/**
 * Shown while a sign-in claim waits on another tab that still has this browser's signed-out lists
 * open. Nothing has been moved yet; Retry claims again once that tab is closed.
 */
export function ClaimBlockedBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
    >
      <p>
        Your lists from before you signed in are still open in another CheckList tab. Close that
        tab, then retry to move them into your account.
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
