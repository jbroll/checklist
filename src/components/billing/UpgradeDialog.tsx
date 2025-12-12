/**
 * UpgradeDialog - Modal for upgrading subscription tier
 *
 * Shows tier comparison and redirects to Stripe checkout.
 */

import { Check, X } from 'lucide-react';
import { useState } from 'react';
import { brand } from '../../lib/brand';
import type { AccountParam, SubscriptionTier } from '../../schemas';
import { getSubscriptionTier, redirectToCheckout } from '../../services/subscriptionService';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

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
  premium: string | boolean;
  team: string | boolean;
}

const FEATURES: TierFeature[] = [
  { name: 'Lists', free: '5', premium: '50', team: '250' },
  { name: 'Session history', free: '30 days', premium: '1 year', team: '5 years' },
  { name: 'Real-time sync', free: true, premium: true, team: true },
  { name: 'Offline support', free: true, premium: true, team: true },
  { name: 'Sharing', free: true, premium: true, team: true },
  { name: 'Encrypted data', free: true, premium: true, team: true },
];

const TIER_PRICES: Record<Exclude<SubscriptionTier, 'enterprise'>, string> = {
  free: '$0',
  premium: '$9.99/year',
  team: '$19.99/year',
};

export function UpgradeDialog({ open, onOpenChange, account, message }: UpgradeDialogProps) {
  const [loading, setLoading] = useState<'premium' | 'team' | null>(null);
  const currentTier = getSubscriptionTier(account);

  const handleUpgrade = async (tier: 'premium' | 'team') => {
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

  const renderTierButton = (tier: 'premium' | 'team') => {
    const isCurrent = currentTier === tier;
    const isDowngrade =
      (currentTier === 'team' && tier === 'premium') || currentTier === 'enterprise';

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

    return (
      <Button
        variant={tier === 'premium' ? 'primary' : 'outline'}
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
        <DialogHeader>
          <DialogTitle>Upgrade your plan</DialogTitle>
          {message && (
            <DialogDescription className="text-amber-600 dark:text-amber-400">
              {message}
            </DialogDescription>
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
                    <div>Free</div>
                    <div className="text-xs font-normal text-content-tertiary">
                      {TIER_PRICES.free}
                    </div>
                  </th>
                  <th className="py-3 text-center text-sm font-medium text-content-secondary">
                    <div className="text-green-600">Premium</div>
                    <div className="text-xs font-normal text-content-tertiary">
                      {TIER_PRICES.premium}
                    </div>
                  </th>
                  <th className="py-3 text-center text-sm font-medium text-content-secondary">
                    <div>Team</div>
                    <div className="text-xs font-normal text-content-tertiary">
                      {TIER_PRICES.team}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {FEATURES.map((feature) => (
                  <tr key={feature.name} className="border-b border-divider-secondary">
                    <td className="py-3 text-sm text-content-primary">{feature.name}</td>
                    <td className="py-3 text-center">{renderFeatureValue(feature.free)}</td>
                    <td className="py-3 text-center">{renderFeatureValue(feature.premium)}</td>
                    <td className="py-3 text-center">{renderFeatureValue(feature.team)}</td>
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
                  <td className="pt-4 px-2">{renderTierButton('premium')}</td>
                  <td className="pt-4 px-2">{renderTierButton('team')}</td>
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
