import type { Express, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import express from 'express';
import { stripe, isStripeEnabled, type TierSlug } from './stripe.js';
import {
  getSubscriptionTiers,
  getUserSubscriptionWithTier,
  createCheckoutSession,
  createPortalSession,
  handleCheckoutCompleted,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  recordUsage,
  getUsageHistory,
} from './subscription.js';
import { ApiErrors } from '../lib/api-error.js';
import { RateLimiter } from '../lib/rate-limiter.js';

// Rate limiter for billing endpoints (10 requests per hour per user)
// Exported for testing purposes
export const billingLimiter = new RateLimiter(10, 60 * 60 * 1000);

// Auth session type
interface AuthSession {
  user: {
    id: string;
    email: string;
    name: string;
  };
}

// Get auth session helper
async function getAuthSession(
  req: Request,
  auth: { api: { getSession: (opts: { headers: Record<string, string> }) => Promise<AuthSession | null> } }
): Promise<AuthSession | null> {
  try {
    return await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    });
  } catch {
    return null;
  }
}

export function setupBillingRoutes(
  app: Express,
  db: Database.Database,
  auth: { api: { getSession: (opts: { headers: Record<string, string> }) => Promise<AuthSession | null> } }
): void {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  // Get available subscription tiers
  app.get('/api/billing/tiers', (req: Request, res: Response) => {
    try {
      const tiers = getSubscriptionTiers(db);
      res.json({ tiers });
    } catch (error) {
      console.error('[billing] Error fetching tiers:', error);
      return ApiErrors.serverError(res, 'Failed to fetch subscription tiers');
    }
  });

  // Get current user's subscription
  app.get('/api/billing/subscription', async (req: Request, res: Response) => {
    try {
      const session = await getAuthSession(req, auth);
      if (!session?.user?.id) {
        return ApiErrors.unauthorized(res);
      }

      const subscription = getUserSubscriptionWithTier(db, session.user.id);
      res.json({ subscription });
    } catch (error) {
      console.error('[billing] Error fetching subscription:', error);
      return ApiErrors.serverError(res, 'Failed to fetch subscription');
    }
  });

  // Get usage info
  app.get('/api/billing/usage', async (req: Request, res: Response) => {
    try {
      const session = await getAuthSession(req, auth);
      if (!session?.user?.id) {
        return ApiErrors.unauthorized(res);
      }

      const subscription = getUserSubscriptionWithTier(db, session.user.id);
      const history = getUsageHistory(db, session.user.id, 30);

      res.json({
        tier: subscription.tier,
        maxItems: subscription.tier.maxItems,
        retentionDays: subscription.tier.retentionDays,
        history,
      });
    } catch (error) {
      console.error('[billing] Error fetching usage:', error);
      return ApiErrors.serverError(res, 'Failed to fetch usage');
    }
  });

  // Record usage (called by frontend periodically)
  app.post('/api/billing/usage', async (req: Request, res: Response) => {
    try {
      const session = await getAuthSession(req, auth);
      if (!session?.user?.id) {
        return ApiErrors.unauthorized(res);
      }

      const { listCount, itemCount } = req.body;
      // Support both old (listCount) and new (itemCount) field names for backward compatibility
      const count = itemCount ?? listCount;
      if (typeof count !== 'number' || count < 0 || count > 10000) {
        return ApiErrors.badRequest(res, 'Invalid count');
      }

      recordUsage(db, session.user.id, count);
      res.json({ success: true });
    } catch (error) {
      console.error('[billing] Error recording usage:', error);
      return ApiErrors.serverError(res, 'Failed to record usage');
    }
  });

  // Create checkout session
  app.post('/api/billing/checkout', async (req: Request, res: Response) => {
    try {
      if (!isStripeEnabled()) {
        return ApiErrors.serviceUnavailable(res, 'Billing is not configured');
      }

      const session = await getAuthSession(req, auth);
      if (!session?.user?.id) {
        return ApiErrors.unauthorized(res);
      }

      // Rate limit billing requests
      if (!billingLimiter.check(session.user.id)) {
        return ApiErrors.rateLimited(res);
      }

      const { tierSlug } = req.body as { tierSlug?: string };
      if (!tierSlug || !['plus', 'premium'].includes(tierSlug)) {
        return ApiErrors.badRequest(res, 'Invalid tier');
      }

      const checkoutUrl = await createCheckoutSession(
        db,
        session.user.id,
        session.user.email,
        tierSlug as 'plus' | 'premium',
        `${frontendUrl}/billing/success`,
        `${frontendUrl}/billing/cancel`
      );

      if (!checkoutUrl) {
        return ApiErrors.serverError(res, 'Failed to create checkout session');
      }

      res.json({ url: checkoutUrl });
    } catch (error) {
      console.error('[billing] Error creating checkout:', error);
      return ApiErrors.serverError(res, 'Failed to create checkout session');
    }
  });

  // Create billing portal session
  app.post('/api/billing/portal', async (req: Request, res: Response) => {
    try {
      if (!isStripeEnabled()) {
        return ApiErrors.serviceUnavailable(res, 'Billing is not configured');
      }

      const session = await getAuthSession(req, auth);
      if (!session?.user?.id) {
        return ApiErrors.unauthorized(res);
      }

      // Rate limit billing requests
      if (!billingLimiter.check(session.user.id)) {
        return ApiErrors.rateLimited(res);
      }

      const portalUrl = await createPortalSession(
        db,
        session.user.id,
        `${frontendUrl}/settings`
      );

      if (!portalUrl) {
        return ApiErrors.serverError(res, 'Failed to create portal session');
      }

      res.json({ url: portalUrl });
    } catch (error) {
      console.error('[billing] Error creating portal session:', error);
      return ApiErrors.serverError(res, 'Failed to create portal session');
    }
  });
}

// Stripe webhook handler - needs raw body, so must be set up separately
export function setupStripeWebhook(app: Express, db: Database.Database): void {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('[billing] STRIPE_WEBHOOK_SECRET not set, webhook endpoint disabled');
    return;
  }

  if (!stripe) {
    console.warn('[billing] Stripe not configured, webhook endpoint disabled');
    return;
  }

  // Use raw body parser for webhook signature verification
  app.post(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      const sig = req.headers['stripe-signature'];

      if (!sig || typeof sig !== 'string') {
        console.warn('[webhook] Missing stripe-signature header');
        return res.status(400).send('Missing signature');
      }

      let event;
      try {
        // stripe is guaranteed non-null here due to early return above
        event = stripe!.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('[webhook] Signature verification failed:', message);
        // Don't expose internal error details to client
        return res.status(400).json({
          error: 'webhook_error',
          message: 'Invalid webhook signature'
        });
      }

      console.log(`[webhook] Received event: ${event.type}`);

      // Check for duplicate event (idempotency)
      const existingEvent = db.prepare(
        'SELECT event_id FROM processed_webhook_events WHERE event_id = ?'
      ).get(event.id);

      if (existingEvent) {
        console.log(`[webhook] Skipping duplicate event: ${event.id}`);
        return res.json({ received: true, skipped: 'duplicate' });
      }

      try {
        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object;
            const userId = session.metadata?.userId;
            const tierSlug = session.metadata?.tierSlug as TierSlug;
            const subscriptionId = session.subscription as string;

            if (userId && tierSlug && subscriptionId) {
              // Get subscription details for period end
              const subscription = await stripe!.subscriptions.retrieve(subscriptionId);
              const periodEnd = (subscription as unknown as { current_period_end: number })
                .current_period_end;
              handleCheckoutCompleted(db, userId, tierSlug, subscriptionId, periodEnd);
              console.log(`[webhook] Checkout completed for user ${userId}, tier: ${tierSlug}`);
            }
            break;
          }

          case 'customer.subscription.updated': {
            const subscription = event.data.object as unknown as {
              id: string;
              metadata?: Record<string, string>;
              status: string;
              current_period_end: number;
              cancel_at_period_end: boolean;
            };
            const tierSlug = subscription.metadata?.tierSlug as TierSlug | undefined;

            // Map Stripe status to our status
            let status: 'active' | 'past_due' | 'cancelled' | 'trialing' = 'active';
            if (subscription.status === 'past_due') status = 'past_due';
            else if (subscription.status === 'canceled') status = 'cancelled';
            else if (subscription.status === 'trialing') status = 'trialing';

            handleSubscriptionUpdated(
              db,
              subscription.id,
              status,
              tierSlug || null,
              subscription.current_period_end,
              subscription.cancel_at_period_end
            );
            console.log(`[webhook] Subscription updated: ${subscription.id}, status: ${status}`);
            break;
          }

          case 'customer.subscription.deleted': {
            const subscription = event.data.object as { id: string };
            handleSubscriptionDeleted(db, subscription.id);
            console.log(`[webhook] Subscription deleted: ${subscription.id}`);
            break;
          }

          case 'invoice.payment_failed': {
            const invoice = event.data.object as { subscription?: string };
            const subscriptionId = invoice.subscription;
            if (subscriptionId) {
              handleSubscriptionUpdated(
                db,
                subscriptionId,
                'past_due',
                null,
                0,
                false
              );
              console.log(`[webhook] Payment failed for subscription: ${subscriptionId}`);
            }
            break;
          }

          default:
            console.log(`[webhook] Unhandled event type: ${event.type}`);
        }

        // Record event as processed (idempotency)
        db.prepare(
          'INSERT INTO processed_webhook_events (event_id, processed_at) VALUES (?, ?)'
        ).run(event.id, new Date().toISOString());

        res.json({ received: true });
      } catch (error) {
        console.error('[webhook] Error processing event:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
      }
    }
  );

  console.log('[billing] Stripe webhook endpoint configured at /api/webhooks/stripe');
}
