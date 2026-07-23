# Stripe Integration Plan

*Last updated: April 2026*

## Production Setup (Required)

### Stripe Dashboard Configuration

#### 1. Create Products
1. Go to https://dashboard.stripe.com/products
2. Create "Premium" product - $9.99/year (recurring, yearly) - copy `price_xxx` ID
3. Create "Team" product - $19.99/year (recurring, yearly) - copy `price_xxx` ID

#### 2. Set Environment Variables
```env
# backend/.env
STRIPE_SECRET_KEY=sk_live_xxx     # Dashboard > API Keys
STRIPE_WEBHOOK_SECRET=whsec_xxx   # From webhook setup
STRIPE_PRICE_PREMIUM=price_xxx    # Premium product price ID
STRIPE_PRICE_TEAM=price_xxx       # Team product price ID
FRONTEND_URL=https://your-app.com # For checkout redirect URLs
```

#### 3. Configure Webhook Endpoint
1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

#### 4. Configure Billing Portal
1. Go to https://dashboard.stripe.com/settings/billing/portal
2. Enable customer portal
3. Allow: cancel subscription, update payment method, view invoices

---

## Remaining Work

### Price ID Consolidation (Optional)
Currently Stripe price IDs live in env vars (`STRIPE_PRICES` in `backend/src/billing/stripe.ts`). The database has a `stripe_price_id` column that's unused. Could consolidate by syncing env vars to DB on startup and reading from there. Low priority - current approach works fine.

### UX Polish
- Over-limit banner for downgraded users (e.g., "You have 10 lists but limit is 3")
- Loading states during checkout redirect
- Error handling for failed checkout creation

### Analytics & Monitoring
- Conversion tracking (upgrade dialog -> checkout -> success)
- Webhook failure monitoring
- Payment failure alerting
- Email notifications for subscription events (via Stripe)

---

## Testing

### Local Webhook Testing
```bash
stripe listen --forward-to localhost:3001/api/webhooks/stripe
stripe trigger checkout.session.completed
```

### Test Cards
| Card | Scenario |
|------|----------|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 9995 | Declined |
| 4000 0000 0000 0341 | Requires authentication |

### E2E Test Flow
1. Sign in as free user, create lists until limit
2. Upgrade via UpgradeDialog -> Stripe checkout -> `/billing/success`
3. Verify subscription synced, can create more lists
4. Cancel via billing portal -> verify webhook downgrades user
5. Verify existing lists accessible, new creation blocked

---

## Architecture

```
  User clicks "Upgrade"
         │
         ▼
  ┌──────────────┐     POST /api/billing/checkout
  │UpgradeDialog │ ───────────────────────────────►┌─────────────┐
  └──────────────┘                                 │   Backend   │
         │                                         │ Creates     │
         │◄────────────────────────────────────────│ Stripe      │
         │         { url: "checkout.stripe.com" }  │ Session     │
         ▼                                         └─────────────┘
  ┌──────────────────┐
  │  Stripe Checkout │  (hosted by Stripe)
  └──────────────────┘
         │
    ┌────┴────┐
 Success    Cancel
    │         │
    ▼         ▼
 /billing  /billing
 /success  /cancel
    │
    │ syncSubscriptionFromBackend()
    ▼
 ┌─────────────────┐                           ┌─────────────────┐
 │  Client Cache   │◄── GET /api/billing ──────│    Backend      │
 │ (UserSettings)  │    /subscription          │   (SQLite DB)   │
 └─────────────────┘                           └─────────────────┘
                                                       ▲
                                              Stripe Webhook
                                              (checkout.session.completed)
                                                       │
                                                ┌──────┴──────┐
                                                │   Stripe    │
                                                └─────────────┘
```

### Key Files
- Backend endpoints: `backend/src/billing/routes.ts`
- Subscription logic: `backend/src/billing/subscription.ts`
- Stripe client: `backend/src/billing/stripe.ts`
- Frontend service: `src/services/subscriptionService.ts`
- Upgrade UI: `src/components/billing/UpgradeDialog.tsx`
- Success/cancel pages: `src/components/billing/BillingSuccessPage.tsx`, `BillingCancelPage.tsx`

### Downgrade Behavior
When a user is downgraded (subscription cancelled/expired), existing data is preserved. The user can access all existing lists but cannot create new ones beyond the free tier limit. This is intentional - we never delete user data on downgrade.
