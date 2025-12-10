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

export const STRIPE_PRICES = {
  premium: process.env.STRIPE_PRICE_PREMIUM || '',
  team: process.env.STRIPE_PRICE_TEAM || '',
} as const;

export type TierSlug = 'free' | 'premium' | 'team' | 'enterprise';

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
  status: 'active' | 'past_due' | 'cancelled' | 'trialing';
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
}
