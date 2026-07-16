/**
 * Subscription Service — headless functions over the rowboat graph. Subscription/preference state
 * lives in the `user_settings` singleton row (cached from the backend source of truth for offline);
 * list counts come from the `folder` table. Beta status grants Plus-tier limits. The `?? 'free'` /
 * `?? 'beta'` defaults for a missing settings row are the DESIGNED new-user defaults, not fallbacks.
 */

import {
  DEFAULT_TIER_LIMITS,
  getEffectiveTier as getEffectiveTierFromBilling,
  getTierDisplayName,
  isPaidTier,
  type SubscriptionStatus,
  type SubscriptionTier,
} from '@jbr-jazz/billing-shared';
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { schema } from '@/schema/folder';
import type { UserSettingsRow } from '../../shared/schema.js';

type Graph = RelationalGraph<typeof schema>;

// Re-export display helpers from billing-shared
export { getTierDisplayName, isPaidTier };

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

// ============================================================================
// Tier Configuration (Single Source of Truth)
// ============================================================================

export interface TierConfig {
  slug: SubscriptionTier;
  name: string;
  priceCents: number;
  priceDisplay: string;
  maxLists: number;
  maxListsDisplay: string;
  sessionRetentionDays: number;
  sessionRetentionDisplay: string;
}

export const TIERS: Record<SubscriptionTier, TierConfig> = {
  free: {
    slug: 'free',
    name: 'Free',
    priceCents: 0,
    priceDisplay: 'Free',
    maxLists: 3,
    maxListsDisplay: '3',
    sessionRetentionDays: 7,
    sessionRetentionDisplay: '7 days',
  },
  plus: {
    slug: 'plus',
    name: 'Plus',
    priceCents: 999,
    priceDisplay: '$9.99/year',
    maxLists: 30,
    maxListsDisplay: '30',
    sessionRetentionDays: 30,
    sessionRetentionDisplay: '30 days',
  },
  premium: {
    slug: 'premium',
    name: 'Premium',
    priceCents: 1999,
    priceDisplay: '$19.99/year',
    maxLists: 300,
    maxListsDisplay: '300',
    sessionRetentionDays: 365,
    sessionRetentionDisplay: '1 year',
  },
  enterprise: {
    slug: 'enterprise',
    name: 'Enterprise',
    priceCents: 0,
    priceDisplay: 'Contact sales',
    maxLists: -1,
    maxListsDisplay: 'Unlimited',
    sessionRetentionDays: -1,
    sessionRetentionDisplay: 'Unlimited',
  },
};

// Enforcement limits come from billing-shared (single source of truth for the
// numbers); TIERS above keeps only CheckList's display strings and pricing.
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = Object.fromEntries(
  Object.entries(DEFAULT_TIER_LIMITS).map(([key, raw]) => [
    key,
    { maxLists: raw.maxItems, sessionRetentionDays: raw.retentionDays },
  ]),
) as Record<SubscriptionTier, TierLimits>;

// Sync interval: 1 hour
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

// ============================================================================
// Subscription State (from the user_settings cache)
// ============================================================================

/** Read the per-user singleton settings row, or `undefined` for a brand-new user with no row yet. */
function readSettings(g: Graph): UserSettingsRow | undefined {
  return g.user_settings.all()[0]?.$data;
}

/**
 * Build a brand-new `user_settings` singleton row with the designed defaults (free tier / beta
 * status — the same defaults the read paths fall back to, made concrete). The write paths need a
 * real row to update, so the app provisions one at account-init via {@link ensureUserSettings}.
 */
export function buildDefaultUserSettings(id: string, ownerGroupId: string): UserSettingsRow {
  return {
    id,
    owner_group_id: ownerGroupId,
    default_autocomplete_domain: 'none',
    enable_auto_categorization: true,
    subscription_tier: 'free',
    subscription_status: 'beta',
    subscription_ends_at: 0,
    max_lists: TIER_LIMITS.free.maxLists,
    session_retention_days: TIER_LIMITS.free.sessionRetentionDays,
    subscription_synced_at: 0,
    view_folder_expanded: {},
    view_template_category_expanded: {},
    view_session_category_expanded: {},
  };
}

/**
 * Provision the per-user `user_settings` singleton if it does not already exist. Idempotent: a row
 * already present (a reload's hydrated row, or an anon row adopted on sign-in) means we do nothing —
 * we NEVER overwrite an existing row, so a persisted subscription cache survives.
 *
 * The singleton is deterministic: `id` and `ownerGroupId` are the identity (for a signed-in user
 * that is `user.id`, whose root scope group is also `user.id` — auto-provisioned at signup — so the
 * row converges across the user's devices with no minted group). Callers MUST have already confirmed
 * (via an authoritative read of the persisted store, past initial hydration/pull) that no row
 * exists; the in-memory `all()` check here is a cheap second guard, not the hydration barrier.
 */
export async function ensureUserSettings(
  g: Graph,
  id: string,
  ownerGroupId: string,
): Promise<void> {
  if (g.user_settings.all().length > 0) return;
  await g.user_settings.create(buildDefaultUserSettings(id, ownerGroupId));
}

/**
 * Get current subscription tier (from the user_settings cache).
 * Note: This returns the user's actual tier, not the effective tier.
 * Use getEffectiveTier() for limit calculations during beta.
 */
export function getSubscriptionTier(g: Graph): SubscriptionTier {
  return (readSettings(g)?.subscription_tier as SubscriptionTier | undefined) ?? 'free';
}

/**
 * Get current subscription status (from the user_settings cache)
 */
export function getSubscriptionStatus(g: Graph): SubscriptionStatus {
  return (readSettings(g)?.subscription_status as SubscriptionStatus | undefined) ?? 'beta';
}

/**
 * Check if user is in beta mode
 */
export function isBetaUser(g: Graph): boolean {
  return getSubscriptionStatus(g) === 'beta';
}

/**
 * Get effective tier for limit calculations.
 * During beta, all users get Plus tier limits regardless of actual tier.
 * Uses billing-shared getEffectiveTier logic.
 */
export function getEffectiveTier(g: Graph): SubscriptionTier {
  const tier = getSubscriptionTier(g);
  const status = getSubscriptionStatus(g);
  return getEffectiveTierFromBilling(tier, status);
}

/**
 * Get beta status message for display
 */
export function getBetaMessage(): string {
  return 'During beta, all users have Plus features free!';
}

/**
 * Get full subscription info (from the user_settings cache).
 * Note: Limits are derived from effective tier (respects beta status).
 */
export function getSubscriptionInfo(g: Graph): SubscriptionInfo {
  const settings = readSettings(g);
  const tier = (settings?.subscription_tier as SubscriptionTier | undefined) ?? 'free';
  const status = (settings?.subscription_status as SubscriptionStatus | undefined) ?? 'beta';
  const effectiveTier = status === 'beta' ? 'plus' : tier;

  return {
    tier,
    status,
    endsAt: settings?.subscription_ends_at ? settings.subscription_ends_at : null,
    limits: TIER_LIMITS[effectiveTier],
    syncedAt: settings?.subscription_synced_at ? settings.subscription_synced_at : null,
  };
}

/**
 * Check if subscription needs to be synced from backend
 */
export function needsSubscriptionSync(g: Graph): boolean {
  const syncedAt = readSettings(g)?.subscription_synced_at;

  // 0 (never synced) or absent row → needs a sync.
  if (!syncedAt) return true;

  const elapsed = Date.now() - syncedAt;
  return elapsed > SYNC_INTERVAL_MS;
}

// ============================================================================
// Limit Checking
// ============================================================================

/**
 * Get the maximum number of lists allowed for the effective tier
 * (respects beta status)
 */
export function getMaxLists(g: Graph): number {
  const effectiveTier = getEffectiveTier(g);
  return TIER_LIMITS[effectiveTier].maxLists;
}

/**
 * Get the session retention period in days (-1 = unlimited)
 * (respects beta status)
 */
export function getSessionRetentionDays(g: Graph): number {
  const effectiveTier = getEffectiveTier(g);
  return TIER_LIMITS[effectiveTier].sessionRetentionDays;
}

/**
 * Count the total number of template folders (lists) the user has.
 * A list = a non-archived template folder in the graph.
 */
export function countUserLists(g: Graph): number {
  return g.folder.all().filter((f) => {
    const row = f.$data;
    return !row.archived && row.type === 'template-folder';
  }).length;
}

/**
 * Check if user is at their list limit
 */
export function isAtListLimit(g: Graph): boolean {
  const maxLists = getMaxLists(g);
  if (maxLists === -1) return false; // Unlimited

  const currentCount = countUserLists(g);
  return currentCount >= maxLists;
}

/**
 * Check if user can create a new list
 */
export function canCreateList(g: Graph): boolean {
  return !isAtListLimit(g);
}

/**
 * Get the number of lists remaining before hitting the limit
 */
export function getListsRemaining(g: Graph): number {
  const maxLists = getMaxLists(g);
  if (maxLists === -1) return -1; // Unlimited

  const currentCount = countUserLists(g);
  return Math.max(0, maxLists - currentCount);
}

/**
 * Get usage as a percentage (0-100)
 */
export function getUsagePercentage(g: Graph): number {
  const maxLists = getMaxLists(g);
  if (maxLists === -1) return 0; // Unlimited = 0%

  const currentCount = countUserLists(g);
  return Math.min(100, Math.round((currentCount / maxLists) * 100));
}

/**
 * Check if user is approaching their limit (80%+ usage)
 */
export function isApproachingLimit(g: Graph): boolean {
  return getUsagePercentage(g) >= 80;
}

// ============================================================================
// Backend Sync
// ============================================================================

/** Shape of the backend `/api/billing/subscription` response we consume. */
interface BackendSubscriptionResponse {
  subscription?: {
    tierSlug: SubscriptionTier;
    status: SubscriptionStatus;
    currentPeriodEnd?: number;
    tier?: { maxLists?: number; sessionRetentionDays?: number };
  };
}

/**
 * Sync subscription status from backend into the user_settings cache
 */
export async function syncSubscriptionFromBackend(g: Graph): Promise<void> {
  try {
    const response = await fetch('/api/billing/subscription', {
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn('[subscription] Failed to fetch subscription from backend:', response.status);
      return;
    }

    const data = (await response.json()) as BackendSubscriptionResponse;
    const { subscription } = data;

    if (!subscription) {
      console.warn('[subscription] No subscription data in response');
      return;
    }

    // Update the user_settings cache row. On the anon->sign-in adopt path the row may not be visible
    // in this graph's snapshot yet (adopt writes it via a separate connection, refreshed async), so
    // skip rather than hard-error — a later sync re-runs this. Never clobber a real tier over a race.
    const settings = readSettings(g);
    if (!settings) {
      if (import.meta.env.DEV)
        console.warn('[subscription] user_settings not visible yet — skipping re-sync');
      return;
    }
    const changes: Partial<UserSettingsRow> = {
      subscription_tier: subscription.tierSlug,
      subscription_status: subscription.status,
      subscription_ends_at: subscription.currentPeriodEnd
        ? subscription.currentPeriodEnd * 1000
        : 0,
      max_lists: subscription.tier?.maxLists ?? TIER_LIMITS.free.maxLists,
      session_retention_days:
        subscription.tier?.sessionRetentionDays ?? TIER_LIMITS.free.sessionRetentionDays,
      subscription_synced_at: Date.now(),
    };
    await g.user_settings.update(settings.id, changes);

    if (import.meta.env.DEV)
      console.log('[subscription] Synced from backend:', subscription.tierSlug);
  } catch (error) {
    if (import.meta.env.DEV) console.error('[subscription] Error syncing from backend:', error);
  }
}

/**
 * Record current usage to backend (for analytics)
 */
export async function recordUsageToBackend(g: Graph): Promise<void> {
  try {
    const listCount = countUserLists(g);

    await fetch('/api/billing/usage', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
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
export async function createCheckoutSession(tierSlug: 'plus' | 'premium'): Promise<string | null> {
  try {
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
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
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
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
export async function redirectToCheckout(tierSlug: 'plus' | 'premium'): Promise<void> {
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
// Display Helpers (CheckList-specific)
// ============================================================================

/**
 * Get tier price display (CheckList-specific, uses local TIERS config)
 */
export function getTierPrice(tier: SubscriptionTier): string {
  return TIERS[tier].priceDisplay;
}
