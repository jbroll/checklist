/**
 * CheckList subscription policy — tiers, limits, and display.
 *
 * These numbers are CheckList's product policy and deliberately live here rather than in a shared
 * package: a limit table shared across products makes one product's pricing change a breaking
 * change for another. Vendored from @jbr-jazz/billing-shared during the de-jazzing.
 *
 * `-1` is the designed unlimited sentinel. An unrecognized tier slug is a BUG and throws — a
 * silent downgrade to free limits would clamp a paying customer and surface only as a complaint.
 */

export type SubscriptionTier = 'free' | 'plus' | 'premium' | 'enterprise';

export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'beta';

/** Tier configuration with pricing, as stored in the `subscription_tier` table. */
export interface TierConfig {
  slug: SubscriptionTier;
  name: string;
  /** Price in cents (0 for free) */
  priceCents: number;
  /** Maximum items allowed (-1 for unlimited) */
  maxItems: number;
  /** Days to retain archived items (-1 for unlimited) */
  retentionDays: number;
  stripePriceId?: string | null;
}

/** User subscription record, mirrored from Stripe. */
export interface UserSubscription {
  userId: string;
  tierSlug: SubscriptionTier;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: SubscriptionStatus;
  /** Unix timestamp when the current period ends */
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}

/**
 * Enforcement limits per tier. `-1` means unlimited.
 * CheckList maps `maxItems` → lists and `retentionDays` → session retention.
 */
export const DEFAULT_TIER_LIMITS: Record<
  SubscriptionTier,
  { maxItems: number; retentionDays: number }
> = {
  free: { maxItems: 3, retentionDays: 7 },
  plus: { maxItems: 30, retentionDays: 30 },
  premium: { maxItems: 300, retentionDays: 365 },
  enterprise: { maxItems: -1, retentionDays: -1 },
} as const;

/**
 * Narrow an untrusted string to a known tier slug, or throw.
 *
 * Use at every boundary where a tier arrives from outside TypeScript's knowledge — the database,
 * a Stripe webhook, a request body. There is no default: an unknown slug means the tier table and
 * the code have diverged, and that must be loud.
 */
export function assertTier(tier: string): SubscriptionTier {
  if (!Object.hasOwn(DEFAULT_TIER_LIMITS, tier)) {
    throw new Error(
      `unknown subscription tier: ${tier} (known: ${Object.keys(DEFAULT_TIER_LIMITS).join(', ')})`,
    );
  }
  return tier as SubscriptionTier;
}

/**
 * Resolve the tier whose limits actually apply.
 * Beta users get Plus; past_due and cancelled fall to free. Both are product policy, not fallbacks.
 */
export function getEffectiveTier(
  tier: SubscriptionTier,
  status?: SubscriptionStatus,
): SubscriptionTier {
  assertTier(tier);
  if (status === 'beta') return 'plus';
  if (status === 'past_due' || status === 'cancelled') return 'free';
  return tier;
}

const TIER_DISPLAY_NAMES: Record<SubscriptionTier, string> = {
  free: 'Free',
  plus: 'Plus',
  premium: 'Premium',
  enterprise: 'Enterprise',
};

export function getTierDisplayName(tier: SubscriptionTier): string {
  return TIER_DISPLAY_NAMES[assertTier(tier)];
}

export function isPaidTier(tier: SubscriptionTier): boolean {
  return assertTier(tier) !== 'free';
}
