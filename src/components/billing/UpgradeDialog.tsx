/**
 * UpgradeDialog - Modal for upgrading subscription tier
 *
 * Shows tier comparison and redirects to Stripe checkout.
 * Tier data is dynamically pulled from subscriptionService.
 */

import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { brand } from '../../lib/brand';
import type { AccountParam } from '../../schemas';
import {
  getBetaMessage,
  getSubscriptionTier,
  isBetaUser,
  redirectToCheckout,
  TIERS,
} from '../../services/subscriptionService';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountParam;
  /** Optional message to show at the top (e.g., "You've hit your limit") */
  message?: string;
}

interface TierFeature {
  name: string;
  free: string | boolean;
  plus: string | boolean;
  premium: string | boolean;
}

// Dynamic features derived from tier configuration
const FEATURES: TierFeature[] = [
  {
    name: 'Lists',
    free: TIERS.free.maxListsDisplay,
    plus: TIERS.plus.maxListsDisplay,
    premium: TIERS.premium.maxListsDisplay,
  },
  {
    name: 'Session history',
    free: TIERS.free.sessionRetentionDisplay,
    plus: TIERS.plus.sessionRetentionDisplay,
    premium: TIERS.premium.sessionRetentionDisplay,
  },
  { name: 'Real-time sync', free: true, plus: true, premium: true },
  { name: 'Offline support', free: true, plus: true, premium: true },
  { name: 'Sharing', free: true, plus: true, premium: true },
  { name: 'Encrypted data', free: true, plus: true, premium: true },
];

export function UpgradeDialog({ open, onOpenChange, account, message }: UpgradeDialogProps) {
  const [loading, setLoading] = useState<'plus' | 'premium' | null>(null);
  const currentTier = getSubscriptionTier(account);
  const isBeta = isBetaUser(account);

  const handleUpgrade = async (tier: 'plus' | 'premium') => {
    setLoading(tier);
    try {
      await redirectToCheckout(tier);
    } catch (error) {
      console.error('Upgrade error:', error);
      setLoading(null);
    }
  };

  const renderFeatureValue = (value: string | boolean) => {
    if (typeof value === 'boolean') {
      return value ? (
        <Check className="h-5 w-5 text-green-600" />
      ) : (
        <X className="h-5 w-5 text-content-tertiary" />
      );
    }
    return <span className="text-sm">{value}</span>;
  };

  const renderTierButton = (tier: 'plus' | 'premium') => {
    const isCurrent = currentTier === tier;
    const isDowngrade =
      (currentTier === 'premium' && tier === 'plus') || currentTier === 'enterprise';

    if (isCurrent) {
      return (
        <Button variant="secondary" disabled className="w-full">
          Current plan
        </Button>
      );
    }

    if (isDowngrade) {
      return (
        <Button variant="ghost" disabled className="w-full text-content-tertiary">
          —
        </Button>
      );
    }

    // Disable upgrade buttons during beta (checkout not configured)
    if (isBeta) {
      return (
        <Button variant="outline" disabled className="w-full text-content-tertiary">
          Coming soon
        </Button>
      );
    }

    return (
      <Button
        variant={tier === 'plus' ? 'primary' : 'outline'}
        className="w-full"
        isLoading={loading === tier}
        onClick={() => handleUpgrade(tier)}
      >
        Upgrade
      </Button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogClose asChild>
          <button
            type="button"
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-surface-elevated transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-neutral-950 focus:ring-offset-2"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogClose>
        <DialogHeader>
          <DialogTitle>Upgrade your plan</DialogTitle>
          {message && (
            <DialogDescription className="text-amber-600 dark:text-amber-400">
              {message}
            </DialogDescription>
          )}
          {isBeta && (
            <div className="mt-2 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-3 py-2">
              <p className="text-sm text-green-700 dark:text-green-300">{getBetaMessage()}</p>
            </div>
          )}
        </DialogHeader>

        <div className="mt-4">
          {/* Tier comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-divider-primary">
                  <th className="py-3 text-left text-sm font-medium text-content-secondary">
                    Feature
                  </th>
                  <th className="py-3 text-center text-sm font-medium text-content-secondary">
                    <div>{TIERS.free.name}</div>
                    <div className="text-xs font-normal text-content-tertiary">
                      {TIERS.free.priceDisplay}
                    </div>
                  </th>
                  <th className="py-3 text-center text-sm font-medium text-content-secondary">
                    <div className="text-green-600">{TIERS.plus.name}</div>
                    <div className="text-xs font-normal text-content-tertiary">
                      {TIERS.plus.priceDisplay}
                    </div>
                  </th>
                  <th className="py-3 text-center text-sm font-medium text-content-secondary">
                    <div>{TIERS.premium.name}</div>
                    <div className="text-xs font-normal text-content-tertiary">
                      {TIERS.premium.priceDisplay}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((feature) => (
                  <tr key={feature.name} className="border-b border-divider-secondary">
                    <td className="py-3 text-sm text-content-primary">{feature.name}</td>
                    <td className="py-3 text-center">{renderFeatureValue(feature.free)}</td>
                    <td className="py-3 text-center">{renderFeatureValue(feature.plus)}</td>
                    <td className="py-3 text-center">{renderFeatureValue(feature.premium)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="pt-4" />
                  <td className="pt-4 px-2">
                    {currentTier === 'free' ? (
                      <Button variant="ghost" disabled className="w-full text-content-tertiary">
                        Current
                      </Button>
                    ) : (
                      <span />
                    )}
                  </td>
                  <td className="pt-4 px-2">{renderTierButton('plus')}</td>
                  <td className="pt-4 px-2">{renderTierButton('premium')}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Enterprise callout */}
          <div className="mt-6 rounded-lg border border-divider-primary bg-surface-secondary p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-content-primary">Need more?</div>
                <div className="text-sm text-content-secondary">
                  Enterprise plans with unlimited lists and custom features.
                </div>
              </div>
              <a
                href={`mailto:${brand.salesEmail}`}
                className="text-sm font-medium text-green-600 hover:text-green-700"
              >
                Contact sales
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
