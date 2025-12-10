/**
 * Subscription Service
 *
 * Manages subscription state between backend (source of truth) and Jazz (cached for offline).
 * Provides limit checking and usage tracking for the freemium model.
 *
 * Tier Limits:
 * - Free: 5 lists, 30-day session history
 * - Premium ($9.99/yr): 100 lists, 1-year session history
 * - Team ($29.99/yr): 500 lists, unlimited session history
 * - Enterprise: Unlimited (contact sales)
 */

import type { InstanceOfSchema } from 'jazz-tools';
import {
  type AccountParam,
  type SubscriptionStatus,
  type SubscriptionTier,
  UserSettings,
} from '../schemas';
import { getAllTemplateFolders } from './folderService';

// ============================================================================
// Types
// ============================================================================

export interface TierLimits {
  maxLists: number;
  sessionRetentionDays: number;
}

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  endsAt: number | null;
  limits: TierLimits;
  syncedAt: number | null;
}

// Default limits per tier (fallback when not synced from backend)
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: { maxLists: 5, sessionRetentionDays: 30 },
  premium: { maxLists: 50, sessionRetentionDays: 365 },
  team: { maxLists: 250, sessionRetentionDays: 1825 }, // 5 years
  enterprise: { maxLists: -1, sessionRetentionDays: -1 }, // -1 = unlimited
};

// Sync interval: 1 hour
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

// ============================================================================
// Subscription State (from Jazz cache)
// ============================================================================

/**
 * Get current subscription tier (from Jazz cache)
 */
export function getSubscriptionTier(account: AccountParam): SubscriptionTier {
  const userSettings = account?.root?.userSettings;
  return (userSettings?.subscriptionTier as SubscriptionTier) ?? 'free';
}

/**
 * Get current subscription status (from Jazz cache)
 */
export function getSubscriptionStatus(account: AccountParam): SubscriptionStatus {
  const userSettings = account?.root?.userSettings;
  return (userSettings?.subscriptionStatus as SubscriptionStatus) ?? 'active';
}

/**
 * Get full subscription info (from Jazz cache)
 */
export function getSubscriptionInfo(account: AccountParam): SubscriptionInfo {
  const userSettings = account?.root?.userSettings;
  const tier = (userSettings?.subscriptionTier as SubscriptionTier) ?? 'free';

  return {
    tier,
    status: (userSettings?.subscriptionStatus as SubscriptionStatus) ?? 'active',
    endsAt: userSettings?.subscriptionEndsAt ?? null,
    limits: {
      maxLists: userSettings?.maxLists ?? TIER_LIMITS[tier].maxLists,
      sessionRetentionDays:
        userSettings?.sessionRetentionDays ?? TIER_LIMITS[tier].sessionRetentionDays,
    },
    syncedAt: userSettings?.subscriptionSyncedAt ?? null,
  };
}

/**
 * Check if subscription needs to be synced from backend
 */
export function needsSubscriptionSync(account: AccountParam): boolean {
  const userSettings = account?.root?.userSettings;
  const syncedAt = userSettings?.subscriptionSyncedAt;

  if (!syncedAt) return true;

  const elapsed = Date.now() - syncedAt;
  return elapsed > SYNC_INTERVAL_MS;
}

// ============================================================================
// Limit Checking
// ============================================================================

/**
 * Get the maximum number of lists allowed for the current tier
 */
export function getMaxLists(account: AccountParam): number {
  const { limits } = getSubscriptionInfo(account);
  return limits.maxLists;
}

/**
 * Get the session retention period in days (-1 = unlimited)
 */
export function getSessionRetentionDays(account: AccountParam): number {
  const { limits } = getSubscriptionInfo(account);
  return limits.sessionRetentionDays;
}

/**
 * Count the total number of template folders (lists) the user has
 */
export function countUserLists(account: AccountParam): number {
  const folders = getAllTemplateFolders(account);
  return folders.length;
}

/**
 * Check if user is at their list limit
 */
export function isAtListLimit(account: AccountParam): boolean {
  const maxLists = getMaxLists(account);
  if (maxLists === -1) return false; // Unlimited

  const currentCount = countUserLists(account);
  return currentCount >= maxLists;
}

/**
 * Check if user can create a new list
 */
export function canCreateList(account: AccountParam): boolean {
  return !isAtListLimit(account);
}

/**
 * Get the number of lists remaining before hitting the limit
 */
export function getListsRemaining(account: AccountParam): number {
  const maxLists = getMaxLists(account);
  if (maxLists === -1) return -1; // Unlimited

  const currentCount = countUserLists(account);
  return Math.max(0, maxLists - currentCount);
}

/**
 * Get usage as a percentage (0-100)
 */
export function getUsagePercentage(account: AccountParam): number {
  const maxLists = getMaxLists(account);
  if (maxLists === -1) return 0; // Unlimited = 0%

  const currentCount = countUserLists(account);
  return Math.min(100, Math.round((currentCount / maxLists) * 100));
}

/**
 * Check if user is approaching their limit (80%+ usage)
 */
export function isApproachingLimit(account: AccountParam): boolean {
  return getUsagePercentage(account) >= 80;
}

// ============================================================================
// Backend Sync
// ============================================================================

/**
 * Sync subscription status from backend to Jazz cache
 */
export async function syncSubscriptionFromBackend(account: AccountParam): Promise<void> {
  try {
    const response = await fetch('/api/billing/subscription', {
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn('[subscription] Failed to fetch subscription from backend:', response.status);
      return;
    }

    const data = await response.json();
    const { subscription } = data;

    if (!subscription) {
      console.warn('[subscription] No subscription data in response');
      return;
    }

    // Update Jazz cache
    const userSettings = ensureUserSettings(account);
    userSettings.$jazz.set('subscriptionTier', subscription.tierSlug);
    userSettings.$jazz.set('subscriptionStatus', subscription.status);
    userSettings.$jazz.set(
      'subscriptionEndsAt',
      subscription.currentPeriodEnd ? subscription.currentPeriodEnd * 1000 : undefined,
    );
    userSettings.$jazz.set('maxLists', subscription.tier?.maxLists ?? TIER_LIMITS.free.maxLists);
    userSettings.$jazz.set(
      'sessionRetentionDays',
      subscription.tier?.sessionRetentionDays ?? TIER_LIMITS.free.sessionRetentionDays,
    );
    userSettings.$jazz.set('subscriptionSyncedAt', Date.now());

    console.log('[subscription] Synced from backend:', subscription.tierSlug);
  } catch (error) {
    console.error('[subscription] Error syncing from backend:', error);
  }
}

/**
 * Record current usage to backend (for analytics)
 */
export async function recordUsageToBackend(account: AccountParam): Promise<void> {
  try {
    const listCount = countUserLists(account);

    await fetch('/api/billing/usage', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listCount }),
    });
  } catch {
    // Non-critical, don't log errors
  }
}

// ============================================================================
// Checkout & Portal
// ============================================================================

/**
 * Create a Stripe checkout session for upgrading
 */
export async function createCheckoutSession(tierSlug: 'premium' | 'team'): Promise<string | null> {
  try {
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierSlug }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[subscription] Checkout error:', error);
      return null;
    }

    const { url } = await response.json();
    return url;
  } catch (error) {
    console.error('[subscription] Error creating checkout session:', error);
    return null;
  }
}

/**
 * Create a Stripe billing portal session for managing subscription
 */
export async function createPortalSession(): Promise<string | null> {
  try {
    const response = await fetch('/api/billing/portal', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('[subscription] Portal error:', error);
      return null;
    }

    const { url } = await response.json();
    return url;
  } catch (error) {
    console.error('[subscription] Error creating portal session:', error);
    return null;
  }
}

/**
 * Redirect to Stripe checkout for upgrading
 */
export async function redirectToCheckout(tierSlug: 'premium' | 'team'): Promise<void> {
  const url = await createCheckoutSession(tierSlug);
  if (url) {
    window.location.href = url;
  }
}

/**
 * Redirect to Stripe billing portal
 */
export async function redirectToPortal(): Promise<void> {
  const url = await createPortalSession();
  if (url) {
    window.location.href = url;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Ensure userSettings exists on the account
 */
function ensureUserSettings(account: AccountParam): InstanceOfSchema<typeof UserSettings> {
  if (!account?.root) {
    throw new Error('Account root not initialized');
  }

  if (!account.root.userSettings) {
    const userSettings = UserSettings.create(
      {
        enableAutoCategorization: true,
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
        maxLists: TIER_LIMITS.free.maxLists,
        sessionRetentionDays: TIER_LIMITS.free.sessionRetentionDays,
      },
      { owner: account },
    );
    account.root.$jazz.set('userSettings', userSettings);
    return userSettings;
  }

  return account.root.userSettings;
}

// ============================================================================
// Display Helpers
// ============================================================================

/**
 * Get human-readable tier name
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  const names: Record<SubscriptionTier, string> = {
    free: 'Free',
    premium: 'Premium',
    team: 'Team',
    enterprise: 'Enterprise',
  };
  return names[tier];
}

/**
 * Get tier price display
 */
export function getTierPrice(tier: SubscriptionTier): string {
  const prices: Record<SubscriptionTier, string> = {
    free: 'Free',
    premium: '$9.99/year',
    team: '$19.99/year',
    enterprise: 'Contact sales',
  };
  return prices[tier];
}

/**
 * Check if tier is a paid tier
 */
export function isPaidTier(tier: SubscriptionTier): boolean {
  return tier !== 'free';
}
