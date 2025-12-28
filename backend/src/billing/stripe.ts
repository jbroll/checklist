import Stripe from 'stripe';

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

export type TierSlug = 'free' | 'plus' | 'premium' | 'enterprise';

export interface SubscriptionTier {
  slug: TierSlug;
  name: string;
  priceCents: number;
  maxLists: number;
  sessionRetentionDays: number;
  stripePriceId: string | null;
}

export interface UserSubscription {
  userId: string;
  tierSlug: TierSlug;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'beta';
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}
