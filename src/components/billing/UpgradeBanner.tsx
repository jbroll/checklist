/**
 * UpgradeBanner - Subtle banner shown when user is approaching their list limit
 *
 * Only shows when:
 * - User is on free tier
 * - Usage is at 80%+ of limit
 * - User hasn't dismissed it recently
 */

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { storageKey } from '../../lib/brand';
import type { AccountParam } from '../../schemas';
import {
  countUserLists,
  getListsRemaining,
  getMaxLists,
  getSubscriptionTier,
  isApproachingLimit,
} from '../../services/subscriptionService';
import { Button } from '../ui/button';

interface UpgradeBannerProps {
  account: AccountParam;
  onUpgradeClick: () => void;
}

// Key for localStorage to track dismissal
const DISMISS_KEY = storageKey('upgrade_banner_dismissed');
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function UpgradeBanner({ account, onUpgradeClick }: UpgradeBannerProps) {
  const [dismissed, setDismissed] = useState(true); // Start hidden, show after check

  useEffect(() => {
    // Check if banner was recently dismissed
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const elapsed = Date.now() - parseInt(dismissedAt, 10);
      if (elapsed < DISMISS_DURATION_MS) {
        setDismissed(true);
        return;
      }
    }
    setDismissed(false);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setDismissed(true);
  };

  // Don't show if dismissed
  if (dismissed) return null;

  // Only show for free tier users approaching their limit
  const tier = getSubscriptionTier(account);
  if (tier !== 'free') return null;

  if (!isApproachingLimit(account)) return null;

  const currentCount = countUserLists(account);
  const maxLists = getMaxLists(account);
  const remaining = getListsRemaining(account);

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
          <span>
            You're using {currentCount} of {maxLists} lists.{' '}
            {remaining === 0 ? (
              <span className="font-medium">Upgrade to create more.</span>
            ) : (
              <span>{remaining} remaining.</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="link"
            size="sm"
            className="text-amber-700 dark:text-amber-300 h-auto py-1 px-2"
            onClick={onUpgradeClick}
          >
            Upgrade
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-1 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
