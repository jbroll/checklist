import Stripe from 'stripe';
import type {
  SubscriptionTier as BaseTier,
  SubscriptionStatus,
  UserSubscription as BaseUserSubscription,
} from '@jbr-jazz/billing-shared';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY not set. Billing features will be disabled.');
}

export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export function isStripeEnabled(): boolean {
  return stripe !== null;
}

// Note: Stripe price IDs are now stored in the database (subscription_tier.stripe_price_id)
// They are synced from STRIPE_PRICE_PLUS and STRIPE_PRICE_PREMIUM env vars on startup
// See: backend/src/db.ts syncStripePriceIds()

// Re-export base types from billing-shared
export type TierSlug = BaseTier;
export type { SubscriptionStatus };

// CheckList-specific tier interface (uses maxLists instead of generic maxItems)
export interface SubscriptionTier {
  slug: TierSlug;
  name: string;
  priceCents: number;
  maxLists: number;
  sessionRetentionDays: number;
  stripePriceId: string | null;
}

// CheckList uses the same UserSubscription structure as billing-shared
export type UserSubscription = BaseUserSubscription;
