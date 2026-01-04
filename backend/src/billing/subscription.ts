import type Database from 'better-sqlite3';
import { stripe, isStripeEnabled, type TierSlug, type SubscriptionTier, type UserSubscription } from './stripe.js';

// Default tier limits for when database isn't available
// Uses jbr-jazz generic naming: maxItems, retentionDays
const DEFAULT_TIERS: Record<TierSlug, { maxItems: number; retentionDays: number }> = {
  free: { maxItems: 3, retentionDays: 7 },
  plus: { maxItems: 30, retentionDays: 30 },
  premium: { maxItems: 300, retentionDays: 365 },
  enterprise: { maxItems: -1, retentionDays: -1 },
};

// Get all subscription tiers
export function getSubscriptionTiers(db: Database.Database): SubscriptionTier[] {
  const stmt = db.prepare(`
    SELECT slug, name, price_cents as priceCents, max_items as maxItems,
           retention_days as retentionDays, stripe_price_id as stripePriceId
    FROM subscription_tier
    ORDER BY price_cents ASC
  `);
  return stmt.all() as SubscriptionTier[];
}

// Get a specific tier by slug
export function getTier(db: Database.Database, tierSlug: TierSlug): SubscriptionTier | null {
  const stmt = db.prepare(`
    SELECT slug, name, price_cents as priceCents, max_items as maxItems,
           retention_days as retentionDays, stripe_price_id as stripePriceId
    FROM subscription_tier WHERE slug = ?
  `);
  return (stmt.get(tierSlug) as SubscriptionTier) || null;
}

// Get user's current subscription (creates default if not exists)
export function getUserSubscription(db: Database.Database, userId: string): UserSubscription {
  const stmt = db.prepare(`
    SELECT user_id as userId, tier_slug as tierSlug, stripe_customer_id as stripeCustomerId,
           stripe_subscription_id as stripeSubscriptionId, status,
           current_period_end as currentPeriodEnd, cancel_at_period_end as cancelAtPeriodEnd
    FROM user_subscription WHERE user_id = ?
  `);

  const existing = stmt.get(userId) as UserSubscription | undefined;

  if (existing) {
    return {
      ...existing,
      cancelAtPeriodEnd: Boolean(existing.cancelAtPeriodEnd),
    };
  }

  // Create default free subscription with beta status
  const insertStmt = db.prepare(`
    INSERT INTO user_subscription (user_id, tier_slug, status)
    VALUES (?, 'free', 'beta')
  `);
  insertStmt.run(userId);

  return {
    userId,
    tierSlug: 'free',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    status: 'beta',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
}

// Get subscription with tier details
export function getUserSubscriptionWithTier(db: Database.Database, userId: string) {
  const subscription = getUserSubscription(db, userId);
  const tier = getTier(db, subscription.tierSlug) || {
    slug: 'free' as TierSlug,
    name: 'Free',
    priceCents: 0,
    ...DEFAULT_TIERS.free,
    stripePriceId: null,
  };

  return {
    ...subscription,
    tier,
  };
}

// Update user's subscription
export function updateUserSubscription(
  db: Database.Database,
  userId: string,
  updates: Partial<Omit<UserSubscription, 'userId'>>
): void {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.tierSlug !== undefined) {
    fields.push('tier_slug = ?');
    values.push(updates.tierSlug);
  }
  if (updates.stripeCustomerId !== undefined) {
    fields.push('stripe_customer_id = ?');
    values.push(updates.stripeCustomerId);
  }
  if (updates.stripeSubscriptionId !== undefined) {
    fields.push('stripe_subscription_id = ?');
    values.push(updates.stripeSubscriptionId);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.currentPeriodEnd !== undefined) {
    fields.push('current_period_end = ?');
    values.push(updates.currentPeriodEnd);
  }
  if (updates.cancelAtPeriodEnd !== undefined) {
    fields.push('cancel_at_period_end = ?');
    values.push(updates.cancelAtPeriodEnd ? 1 : 0);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = unixepoch()');
  values.push(userId);

  const stmt = db.prepare(`
    UPDATE user_subscription
    SET ${fields.join(', ')}
    WHERE user_id = ?
  `);
  stmt.run(...values);
}

// Check if user can create more lists
export function canCreateList(db: Database.Database, userId: string, currentListCount: number): boolean {
  const { tier } = getUserSubscriptionWithTier(db, userId);
  if (tier.maxItems === -1) return true; // Unlimited
  return currentListCount < tier.maxItems;
}

// Get lists remaining
export function getListsRemaining(db: Database.Database, userId: string, currentListCount: number): number {
  const { tier } = getUserSubscriptionWithTier(db, userId);
  if (tier.maxItems === -1) return -1; // Unlimited
  return Math.max(0, tier.maxItems - currentListCount);
}

// Create Stripe checkout session
export async function createCheckoutSession(
  db: Database.Database,
  userId: string,
  userEmail: string,
  tierSlug: 'plus' | 'premium',
  successUrl: string,
  cancelUrl: string
): Promise<string | null> {
  if (!isStripeEnabled() || !stripe) {
    throw new Error('Stripe is not configured');
  }

  // Get price ID from database (synced from env vars on startup)
  const tier = getTier(db, tierSlug);
  const priceId = tier?.stripePriceId;
  if (!priceId) {
    throw new Error(`No Stripe price configured for tier: ${tierSlug}. Set STRIPE_PRICE_${tierSlug.toUpperCase()} env var.`);
  }

  // Get or create Stripe customer
  const subscription = getUserSubscription(db, userId);
  let customerId = subscription.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userEmail,
      metadata: { userId },
    });
    customerId = customer.id;
    updateUserSubscription(db, userId, { stripeCustomerId: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId, tierSlug },
    subscription_data: {
      metadata: { userId, tierSlug },
    },
  });

  return session.url;
}

// Create Stripe billing portal session
export async function createPortalSession(
  db: Database.Database,
  userId: string,
  returnUrl: string
): Promise<string | null> {
  if (!isStripeEnabled() || !stripe) {
    throw new Error('Stripe is not configured');
  }

  const subscription = getUserSubscription(db, userId);
  if (!subscription.stripeCustomerId) {
    throw new Error('User has no Stripe customer record');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: returnUrl,
  });

  return session.url;
}

// Handle successful checkout
export function handleCheckoutCompleted(
  db: Database.Database,
  userId: string,
  tierSlug: TierSlug,
  stripeSubscriptionId: string,
  currentPeriodEnd: number
): void {
  updateUserSubscription(db, userId, {
    tierSlug,
    stripeSubscriptionId,
    status: 'active',
    currentPeriodEnd,
    cancelAtPeriodEnd: false,
  });
}

// Handle subscription update from Stripe
export function handleSubscriptionUpdated(
  db: Database.Database,
  stripeSubscriptionId: string,
  status: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'beta',
  tierSlug: TierSlug | null,
  currentPeriodEnd: number,
  cancelAtPeriodEnd: boolean
): void {
  // Find user by subscription ID
  const stmt = db.prepare(`
    SELECT user_id FROM user_subscription WHERE stripe_subscription_id = ?
  `);
  const result = stmt.get(stripeSubscriptionId) as { user_id: string } | undefined;

  if (!result) {
    console.warn(`No user found for subscription: ${stripeSubscriptionId}`);
    return;
  }

  const updates: Partial<UserSubscription> = {
    status,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  };

  if (tierSlug) {
    updates.tierSlug = tierSlug;
  }

  updateUserSubscription(db, result.user_id, updates);
}

// Handle subscription deletion (downgrade to free)
export function handleSubscriptionDeleted(
  db: Database.Database,
  stripeSubscriptionId: string
): void {
  const stmt = db.prepare(`
    SELECT user_id FROM user_subscription WHERE stripe_subscription_id = ?
  `);
  const result = stmt.get(stripeSubscriptionId) as { user_id: string } | undefined;

  if (!result) {
    console.warn(`No user found for subscription: ${stripeSubscriptionId}`);
    return;
  }

  updateUserSubscription(db, result.user_id, {
    tierSlug: 'free',
    stripeSubscriptionId: null,
    status: 'active',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

// Record usage snapshot
export function recordUsage(db: Database.Database, userId: string, itemCount: number): void {
  const stmt = db.prepare(`
    INSERT INTO usage_snapshot (user_id, item_count) VALUES (?, ?)
  `);
  stmt.run(userId, itemCount);
}

// Get usage history
export function getUsageHistory(
  db: Database.Database,
  userId: string,
  limit = 30
): Array<{ itemCount: number; recordedAt: number }> {
  const stmt = db.prepare(`
    SELECT item_count as itemCount, recorded_at as recordedAt
    FROM usage_snapshot
    WHERE user_id = ?
    ORDER BY recorded_at DESC
    LIMIT ?
  `);
  return stmt.all(userId, limit) as Array<{ itemCount: number; recordedAt: number }>;
}
