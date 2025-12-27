# Stripe Integration Plan

## Current State Assessment

### What's Already Implemented

#### Backend (Complete)
| Component | File | Status |
|-----------|------|--------|
| Stripe client initialization | `backend/src/billing/stripe.ts` | Done |
| Checkout session creation | `backend/src/billing/subscription.ts` | Done |
| Billing portal session | `backend/src/billing/subscription.ts` | Done |
| Webhook handler | `backend/src/billing/routes.ts` | Done |
| REST endpoints | `backend/src/billing/routes.ts` | Done |
| Database schema | `backend/src/migrations/subscriptions.sql` | Done |
| Migration runner | `backend/src/db.ts` | Done |

**Backend Endpoints:**
- `GET /api/billing/tiers` - Get all subscription tiers
- `GET /api/billing/subscription` - Get current user's subscription
- `GET /api/billing/usage` - Get usage history and limits
- `POST /api/billing/usage` - Record usage snapshot
- `POST /api/billing/checkout` - Create Stripe checkout session
- `POST /api/billing/portal` - Create Stripe billing portal session
- `POST /api/webhooks/stripe` - Handle Stripe webhook events

**Webhook Events Handled:**
- `checkout.session.completed` - Upgrade user after purchase
- `customer.subscription.updated` - Update tier/status on changes
- `customer.subscription.deleted` - Downgrade to free on cancel
- `invoice.payment_failed` - Mark subscription as past_due

#### Frontend (Mostly Complete)
| Component | File | Status |
|-----------|------|--------|
| Subscription service | `src/services/subscriptionService.ts` | Done |
| Tier configuration (TIERS) | `src/services/subscriptionService.ts` | Done |
| UpgradeDialog | `src/components/billing/UpgradeDialog.tsx` | Done |
| UpgradeBanner | `src/components/billing/UpgradeBanner.tsx` | Done |
| Profile upgrade button | `src/components/auth/ProfileDialog.tsx` | Done |
| Jazz cache sync | `src/services/subscriptionService.ts` | Done |
| Checkout redirect | `src/services/subscriptionService.ts` | Done |
| Portal redirect | `src/services/subscriptionService.ts` | Done |

---

## What's Missing

### 1. Frontend Success/Cancel Pages (Required)

**Problem:** After Stripe checkout, users are redirected to `/billing/success` or `/billing/cancel`, but these routes don't exist. Users land on the main app with no feedback.

**Backend sets these URLs in `backend/src/billing/routes.ts:140-141`:**
```typescript
`${frontendUrl}/billing/success`
`${frontendUrl}/billing/cancel`
```

**Solution:** Create two new page components:

#### BillingSuccessPage
- Display "Thank you for upgrading!" message
- Show the tier they upgraded to
- Call `syncSubscriptionFromBackend()` to update Jazz cache
- Auto-redirect to main app after 3-5 seconds (or button click)

#### BillingCancelPage
- Display "Checkout cancelled" message
- Reassure user no charge was made
- Link back to app or upgrade dialog

**Files to create:**
- `src/components/billing/BillingSuccessPage.tsx`
- `src/components/billing/BillingCancelPage.tsx`

**Files to modify:**
- `src/App.tsx` - Add route handling for `/billing/success` and `/billing/cancel`

---

### 2. Subscription Expiration & Downgrade Handling (Needs Review)

**Current State:**
- `subscriptionEndsAt` is stored in Jazz cache but **never checked**
- When subscription ends/cancels, Stripe sends `customer.subscription.deleted` webhook
- Webhook handler calls `handleSubscriptionDeleted()` which downgrades user to `free` tier
- **This works correctly** - Stripe manages the expiration, we just react to webhooks

**What happens when user is downgraded but over the free limit?**

| Scenario | Current Behavior | User Experience |
|----------|------------------|-----------------|
| Premium user (10 lists) → Free (limit 3) | Tier changes to `free` | User keeps all 10 lists |
| User tries to create 11th list | `isAtListLimit()` returns `true` | Upgrade dialog appears |
| User tries to use existing lists | Works normally | No disruption |

**This is the correct behavior** - we don't delete user data, we just prevent new list creation.

**Potential Improvements:**
1. Show a banner: "Your subscription has ended. You have 10 lists but your free limit is 3. Upgrade to add more."
2. Consider adding an `isOverLimit()` helper to detect this state
3. Show which lists would need to be archived if they want to stay on free tier

**Code locations:**
- Limit check: `src/services/subscriptionService.ts:191` (`isAtListLimit`)
- Creation block: `src/services/folderService.ts:197` (`canCreateList` check)
- Webhook downgrade: `backend/src/billing/subscription.ts:280` (`handleSubscriptionDeleted`)

---

### 3. Stripe Price ID Configuration (Single Source of Truth)

**Current State - 3 Sources:**
| Location | What | Stripe Price ID |
|----------|------|-----------------|
| `src/services/subscriptionService.ts` | Frontend TIERS | ❌ Not included |
| `backend/src/migrations/subscriptions.sql` | Database table | Column exists but `NULL` |
| `backend/src/billing/stripe.ts` | STRIPE_PRICES | ✅ From env vars |

**Problem:**
- `subscription.ts:160` reads from `STRIPE_PRICES[tierSlug]` (env vars)
- Database `stripe_price_id` column is never populated or used
- Tier limits are duplicated between frontend and database

**Proposed Solution - Database as Single Source of Truth:**

#### Step 1: Populate database on startup
Add to `backend/src/db.ts`:
```typescript
export function initDb(sqliteDb: Database.Database) {
  // ... existing migrations ...

  // Sync Stripe price IDs from env vars to database
  const updatePriceId = sqliteDb.prepare(
    'UPDATE subscription_tier SET stripe_price_id = ? WHERE slug = ?'
  );
  if (process.env.STRIPE_PRICE_PREMIUM) {
    updatePriceId.run(process.env.STRIPE_PRICE_PREMIUM, 'premium');
  }
  if (process.env.STRIPE_PRICE_TEAM) {
    updatePriceId.run(process.env.STRIPE_PRICE_TEAM, 'team');
  }
}
```

#### Step 2: Read from database instead of env
Change `backend/src/billing/subscription.ts:160`:
```typescript
// Before:
const priceId = STRIPE_PRICES[tierSlug];

// After:
const tier = getTierBySlug(db, tierSlug);
const priceId = tier.stripePriceId;
if (!priceId) {
  throw new Error(`No Stripe price configured for tier: ${tierSlug}`);
}
```

#### Step 3: Remove STRIPE_PRICES export
Delete from `backend/src/billing/stripe.ts`:
```typescript
// Remove this:
export const STRIPE_PRICES = {
  premium: process.env.STRIPE_PRICE_PREMIUM || '',
  team: process.env.STRIPE_PRICE_TEAM || '',
} as const;
```

**Benefits:**
- Stripe price IDs in one place (database)
- Env vars only used for initial seeding
- Can update Stripe prices via database without code change

**Important: Keep Frontend TIERS Hardcoded**

The frontend `TIERS` in `subscriptionService.ts` should remain hardcoded for offline support:
- UpgradeDialog displays pricing without network
- Limit enforcement works offline
- Usage percentage display works offline

This means tier limits are duplicated (frontend + database), but that's an acceptable trade-off for offline-first architecture. Stripe price IDs are backend-only since checkout requires connectivity anyway.

---

### 4. Stripe Dashboard Configuration (Required for Production)

You must create products and prices in the Stripe Dashboard:

#### Step 1: Create Products
1. Go to https://dashboard.stripe.com/products
2. Create "Premium" product
   - Price: $9.99/year (recurring, yearly)
   - Copy the `price_xxx` ID
3. Create "Team" product
   - Price: $19.99/year (recurring, yearly)
   - Copy the `price_xxx` ID

#### Step 2: Set Environment Variables
Add to `backend/.env`:
```env
STRIPE_SECRET_KEY=sk_live_xxx     # From Dashboard > API Keys
STRIPE_WEBHOOK_SECRET=whsec_xxx   # From webhook setup
STRIPE_PRICE_PREMIUM=price_xxx    # Premium product price ID
STRIPE_PRICE_TEAM=price_xxx       # Team product price ID
```

#### Step 3: Configure Webhook Endpoint
1. Go to https://dashboard.stripe.com/webhooks
2. Add endpoint: `https://your-domain.com/api/webhooks/stripe`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the signing secret to `STRIPE_WEBHOOK_SECRET`

#### Step 4: Configure Billing Portal
1. Go to https://dashboard.stripe.com/settings/billing/portal
2. Enable customer portal
3. Configure allowed actions:
   - Cancel subscription
   - Update payment method
   - View invoices

---

### 5. Testing Checklist

#### Local Testing with Stripe CLI
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3001/api/webhooks/stripe

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger invoice.payment_failed
```

#### Test Cards
| Card Number | Scenario |
|-------------|----------|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 9995 | Declined (insufficient funds) |
| 4000 0000 0000 0341 | Requires authentication |

#### End-to-End Test Flow
1. [ ] Sign in as free user
2. [ ] Create 3 lists (hit limit)
3. [ ] Try to create 4th list → UpgradeDialog appears
4. [ ] Click "Upgrade" on Premium
5. [ ] Complete Stripe checkout with test card
6. [ ] Verify redirect to `/billing/success`
7. [ ] Verify subscription synced (can create more lists)
8. [ ] Create 7 more lists (total 10)
9. [ ] Verify "Manage Billing" button appears in profile
10. [ ] Click "Manage Billing" → Stripe portal opens
11. [ ] Cancel subscription in portal
12. [ ] Verify webhook received, user downgraded to free
13. [ ] Verify user can still access all 10 lists
14. [ ] Verify user cannot create 11th list (shows upgrade dialog)

---

## Implementation Priority

### Phase 1: Critical Path (Required for Launch)
1. Create `BillingSuccessPage` and `BillingCancelPage` components
2. Add routes to `App.tsx` for `/billing/success` and `/billing/cancel`
3. Configure Stripe Dashboard (products, prices, webhook)
4. Set production environment variables

### Phase 2: Configuration Improvements
1. Move Stripe price IDs to database (use existing `stripe_price_id` column)
2. Update backend to read price IDs from database instead of env vars
3. Add startup script to sync env vars → database

### Phase 3: UX Polish
1. Add "over limit" banner for downgraded users (e.g., "You have 10 lists but limit is 3")
2. Add `isOverLimit()` helper function
3. Add loading states during checkout redirect
4. Add error handling for failed checkout creation

### Phase 4: Analytics & Monitoring
1. Track conversion rates (upgrade dialog → checkout → success)
2. Monitor webhook failures
3. Add alerting for payment failures
4. Add email notifications for subscription events (via Stripe)

---

## Environment Variables Summary

### Frontend (`.env`)
```env
# No Stripe-specific vars needed - all handled by backend
```

### Backend (`backend/.env`)
```env
# Required for Stripe
STRIPE_SECRET_KEY=sk_xxx          # API secret key
STRIPE_WEBHOOK_SECRET=whsec_xxx   # Webhook signing secret

# Stripe Price IDs (synced to database on startup)
# After Phase 2, these will be stored in subscription_tier.stripe_price_id
STRIPE_PRICE_PREMIUM=price_xxx    # Premium tier price ID
STRIPE_PRICE_TEAM=price_xxx       # Team tier price ID

# Required for redirect URLs
FRONTEND_URL=https://your-app.com
```

**Note:** After implementing Phase 2 (Configuration Improvements), the `STRIPE_PRICE_*` variables will be synced to the database on startup and read from there. This allows updating prices without code deployment.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           USER FLOW                                  │
└─────────────────────────────────────────────────────────────────────┘

  User clicks "Upgrade"
         │
         ▼
  ┌──────────────┐     POST /api/billing/checkout
  │UpgradeDialog │ ────────────────────────────────►┌─────────────┐
  └──────────────┘                                  │   Backend   │
         │                                          │             │
         │                                          │ Creates     │
         │                                          │ Stripe      │
         │                                          │ Session     │
         │◄─────────────────────────────────────────│             │
         │         { url: "checkout.stripe.com" }   └─────────────┘
         │
         ▼
  ┌──────────────────┐
  │  Stripe Checkout │  (hosted by Stripe)
  └──────────────────┘
         │
    ┌────┴────┐
    │         │
 Success    Cancel
    │         │
    ▼         ▼
┌────────┐ ┌────────┐
│/billing│ │/billing│
│/success│ │/cancel │
└────────┘ └────────┘
    │
    │ syncSubscriptionFromBackend()
    │
    ▼
┌─────────────────┐                              ┌─────────────────┐
│   Jazz Cache    │◄─────── GET /api/billing ────│    Backend      │
│ (UserSettings)  │         /subscription        │   (SQLite DB)   │
└─────────────────┘                              └─────────────────┘
                                                        ▲
                                                        │
                                               Stripe Webhook
                                               (checkout.session.completed)
                                                        │
                                                 ┌──────┴──────┐
                                                 │   Stripe    │
                                                 └─────────────┘
```

---

## Code Snippets for Missing Components

### BillingSuccessPage (skeleton)
```tsx
// src/components/billing/BillingSuccessPage.tsx
export function BillingSuccessPage() {
  const { me } = useAccount(GroceriesAccount);
  const [syncing, setSyncing] = useState(true);

  useEffect(() => {
    // Sync subscription from backend
    syncSubscriptionFromBackend(me).then(() => {
      setSyncing(false);
      // Auto-redirect after 3 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 3000);
    });
  }, [me]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
        <h1>Thank you for upgrading!</h1>
        {syncing ? (
          <p>Activating your subscription...</p>
        ) : (
          <p>Redirecting to your lists...</p>
        )}
      </div>
    </div>
  );
}
```

### App.tsx route addition
```tsx
// Add to App.tsx
const isBillingSuccess = pathname === '/billing/success';
const isBillingCancel = pathname === '/billing/cancel';

// In render:
{isBillingSuccess ? (
  <Suspense fallback={<LoadingScreen />}>
    <BillingSuccessPage />
  </Suspense>
) : isBillingCancel ? (
  <Suspense fallback={<LoadingScreen />}>
    <BillingCancelPage />
  </Suspense>
) : // ... rest of routes
```
