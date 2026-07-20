# CheckList De-Jazzing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every `@jbr-jazz/*` and `jazz-tools` dependency from CheckList by vendoring the small
surface it actually consumes, so CheckList's jbr-jazz dependency count reaches zero.

**Architecture:** CheckList consumes only ~8 symbols from `@jbr-jazz/billing-shared` (4 of them
types) and 2 utilities from `@jbr-jazz/hierarchy-backend`. None of that surface touches Jazz — the
only Jazz-coupled export in `billing-shared` (`subscriptionSettingsFields`) is unused here. So this
is a vendor-and-delete, not a port. Subscription tier limits are **product policy** and land in
CheckList's own `shared/billing.ts`; the two backend utilities land in `backend/src/lib/`.

**Tech Stack:** TypeScript, React 18, Vite, Express, better-sqlite3, Vitest, Biome, knip.

## Global Constraints

- **NO FALLBACKS.** An unrecognized tier slug is a bug — it throws. Never silently downgrade to
  free-tier limits. The `-1` unlimited sentinel is a *designed* value and stays; anything that is
  neither a known slug nor a known sentinel is a hard error.
- **Subscription limits are per-product.** The tier table lives in CheckList and is not re-shared
  into any rowboat or jbr-jazz package. Rowboat's own `@jbroll/rowboat-enforcement` already models
  this correctly (it takes `getLimits` as an injected callback and owns no policy) — do not add
  CheckList tier policy to rowboat.
- **YAGNI on vendoring.** Copy only what CheckList imports. Do not vendor
  `canCreateItem`, `getItemsRemaining`, `getUsagePercentage`, `shouldPurge`, `getSubscriptionLimits`,
  `normalizeRawLimits`, `SubscriptionLimits`, `UsageSnapshot`, `AuthApi`/`AuthSession`/
  `AuthSessionUser`, `subscriptionSettingsFields`, `PersistentRateLimiter`, or the
  `emailVerificationLimiter`/`shareInviteLimiter`/`tokenValidationLimiter` singletons. CheckList
  imports none of them.
- **Commit hooks may not be bypassed.** `git commit` runs type-check, lint, unit tests and E2E
  (6-10 min). Never pass `--no-verify`.
- **No `jazz-tools` in the frontend** (existing `CLAUDE.md:262` rule) — this plan makes that literally
  true rather than merely conventional.

---

### Task 1: Vendor billing types + constants into `shared/billing.ts`

**Files:**
- Create: `shared/billing.ts`
- Test: `shared/billing.test.ts`

**Model:** `sonnet` — small surface, but the hard-fail semantics are new behaviour, not transcription.

**Interfaces:**
- Produces:
  - `type SubscriptionTier = 'free' | 'plus' | 'premium' | 'enterprise'`
  - `type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'beta'`
  - `interface TierConfig { slug; name; priceCents; maxItems; retentionDays; stripePriceId? }`
  - `interface UserSubscription { userId; tierSlug; stripeCustomerId; stripeSubscriptionId; status; currentPeriodEnd; cancelAtPeriodEnd }`
  - `const DEFAULT_TIER_LIMITS: Record<SubscriptionTier, { maxItems: number; retentionDays: number }>`
  - `function assertTier(tier: string): SubscriptionTier`
  - `function getEffectiveTier(tier: SubscriptionTier, status?: SubscriptionStatus): SubscriptionTier`
  - `function getTierDisplayName(tier: SubscriptionTier): string`
  - `function isPaidTier(tier: SubscriptionTier): boolean`

- [ ] **Step 1: Write the failing test**

Create `shared/billing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  assertTier,
  DEFAULT_TIER_LIMITS,
  getEffectiveTier,
  getTierDisplayName,
  isPaidTier,
} from './billing.js';

describe('assertTier', () => {
  it('returns known slugs unchanged', () => {
    expect(assertTier('free')).toBe('free');
    expect(assertTier('enterprise')).toBe('enterprise');
  });

  it('THROWS on an unrecognized slug rather than downgrading to free', () => {
    expect(() => assertTier('gold')).toThrow(/unknown subscription tier: gold/i);
    expect(() => assertTier('')).toThrow(/unknown subscription tier/i);
  });
});

describe('getEffectiveTier', () => {
  it('grants Plus limits to beta users regardless of tier', () => {
    expect(getEffectiveTier('free', 'beta')).toBe('plus');
    expect(getEffectiveTier('premium', 'beta')).toBe('plus');
  });

  it('drops past_due and cancelled to free', () => {
    expect(getEffectiveTier('premium', 'past_due')).toBe('free');
    expect(getEffectiveTier('premium', 'cancelled')).toBe('free');
  });

  it('passes an active tier through', () => {
    expect(getEffectiveTier('premium', 'active')).toBe('premium');
    expect(getEffectiveTier('plus', undefined)).toBe('plus');
  });

  it('THROWS on an unrecognized tier', () => {
    expect(() => getEffectiveTier('gold' as never, 'active')).toThrow(/unknown subscription tier/i);
  });
});

describe('DEFAULT_TIER_LIMITS', () => {
  it('keeps -1 as the designed unlimited sentinel for enterprise', () => {
    expect(DEFAULT_TIER_LIMITS.enterprise).toEqual({ maxItems: -1, retentionDays: -1 });
  });

  it('preserves the pre-port numbers for every tier', () => {
    expect(DEFAULT_TIER_LIMITS.free).toEqual({ maxItems: 3, retentionDays: 7 });
    expect(DEFAULT_TIER_LIMITS.plus).toEqual({ maxItems: 30, retentionDays: 30 });
    expect(DEFAULT_TIER_LIMITS.premium).toEqual({ maxItems: 300, retentionDays: 365 });
  });
});

describe('display helpers', () => {
  it('names every tier', () => {
    expect(getTierDisplayName('free')).toBe('Free');
    expect(getTierDisplayName('plus')).toBe('Plus');
    expect(getTierDisplayName('premium')).toBe('Premium');
    expect(getTierDisplayName('enterprise')).toBe('Enterprise');
  });

  it('treats every non-free tier as paid', () => {
    expect(isPaidTier('free')).toBe(false);
    expect(isPaidTier('plus')).toBe(true);
  });

  it('THROWS naming an unrecognized tier', () => {
    expect(() => getTierDisplayName('gold' as never)).toThrow(/unknown subscription tier/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/src/checklist && npx vitest run shared/billing.test.ts`
Expected: FAIL — `Failed to resolve import "./billing.js"`

- [ ] **Step 3: Write the implementation**

Create `shared/billing.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/src/checklist && npx vitest run shared/billing.test.ts`
Expected: PASS — 10 tests

- [ ] **Step 5: Commit**

```bash
cd ~/src/checklist
git add shared/billing.ts shared/billing.test.ts
git commit -m "feat(billing): vendor CheckList tier policy into shared/billing.ts

Tier limits are product policy and belong to CheckList, not a shared package.
assertTier throws on an unrecognized slug instead of downgrading to free."
```

---

### Task 2: Repoint the frontend, and fix the divergent effective-tier logic

**Files:**
- Modify: `src/services/subscriptionService.ts` (imports at 8-15; `TIER_LIMITS` at ~102; `getSubscriptionInfo` at ~215)
- Modify: `src/components/auth/ProfileDialog.tsx:1`
- Test: `src/services/subscriptionService.test.ts`

**Model:** `sonnet` — a real behavioural bug fix alongside the import swap.

**Interfaces:**
- Consumes: everything Task 1 produces, imported from `@/../shared/billing.js` via the existing
  `shared/` import style already used for `UserSettingsRow` (`'../../shared/schema.js'`).
- Produces: no signature changes. `getSubscriptionInfo(g)` keeps its shape; only the `limits` it
  returns for a past_due/cancelled user changes.

**Context — the bug being fixed.** `getSubscriptionInfo` computes
`const effectiveTier = status === 'beta' ? 'plus' : tier;`, which is a hand-inlined copy of
`getEffectiveTier` that **omits the past_due/cancelled → free arm**. So a past_due user sees their
paid tier's limits through `getSubscriptionInfo` but free limits through `getMaxLists`, which reads
the same state through the real helper. Two answers to one question. Replace the inline copy with
the shared helper.

- [ ] **Step 1: Write the failing test**

Append to `src/services/subscriptionService.test.ts`. The file already has a `makeAccount(settings?,
lists?)` helper taking camelCase `SettingsInput` (`subscriptionTier`, `subscriptionStatus`, …) —
reuse it; everything below is already imported at the top of that file.

```ts
describe('getSubscriptionInfo effective-tier consistency', () => {
  it('reports free limits for a past_due paid user, matching getMaxLists', () => {
    const g = makeAccount({ subscriptionTier: 'premium', subscriptionStatus: 'past_due' });

    expect(getSubscriptionInfo(g).limits.maxLists).toBe(TIER_LIMITS.free.maxLists);
    expect(getMaxLists(g)).toBe(TIER_LIMITS.free.maxLists);
  });

  it('reports free limits for a cancelled paid user', () => {
    const g = makeAccount({ subscriptionTier: 'premium', subscriptionStatus: 'cancelled' });

    expect(getSubscriptionInfo(g).limits.maxLists).toBe(TIER_LIMITS.free.maxLists);
  });

  it('still grants Plus limits during beta', () => {
    const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });

    expect(getSubscriptionInfo(g).limits.maxLists).toBe(TIER_LIMITS.plus.maxLists);
  });

  it('passes an active premium tier through', () => {
    const g = makeAccount({ subscriptionTier: 'premium', subscriptionStatus: 'active' });

    expect(getSubscriptionInfo(g).limits.maxLists).toBe(TIER_LIMITS.premium.maxLists);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/src/checklist && npx vitest run src/services/subscriptionService.test.ts`
Expected: FAIL — the past_due case reports `TIER_LIMITS.premium.maxLists` (300), not free's 3

- [ ] **Step 3: Swap the imports**

In `src/services/subscriptionService.ts`, replace the `@jbr-jazz/billing-shared` import block
(lines 8-15) with:

```ts
import {
  DEFAULT_TIER_LIMITS,
  getEffectiveTier as getEffectiveTierFromBilling,
  getTierDisplayName,
  isPaidTier,
  type SubscriptionStatus,
  type SubscriptionTier,
} from '../../shared/billing.js';
```

Update the comment at ~line 100 — it currently claims the numbers come from billing-shared:

```ts
// Enforcement limits come from shared/billing.ts (CheckList's own tier policy); TIERS above keeps
// only CheckList's display strings and pricing.
```

In `src/components/auth/ProfileDialog.tsx`, replace line 1:

```ts
import type { SubscriptionTier } from '../../../shared/billing.js';
```

- [ ] **Step 4: Fix the divergent effective-tier logic**

In `getSubscriptionInfo`, delete the inline ternary and use the helper:

```ts
export function getSubscriptionInfo(g: Graph): SubscriptionInfo {
  const settings = readSettings(g);
  const tier = (settings?.subscription_tier as SubscriptionTier | undefined) ?? 'free';
  const status = (settings?.subscription_status as SubscriptionStatus | undefined) ?? 'beta';
  const effectiveTier = getEffectiveTierFromBilling(tier, status);

  return {
    tier,
    status,
    endsAt: settings?.subscription_ends_at ? settings.subscription_ends_at : null,
    limits: TIER_LIMITS[effectiveTier],
    syncedAt: settings?.subscription_synced_at ? settings.subscription_synced_at : null,
  };
}
```

Leave the `?? 'free'` / `?? 'beta'` defaults alone — `subscriptionService.ts:1-5` documents them as
the **designed new-user defaults** for a user with no settings row yet, not fallbacks.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/src/checklist && npx vitest run src/services/subscriptionService.test.ts src/components/billing`
Expected: PASS — all suites, including the three new cases

- [ ] **Step 6: Commit**

```bash
cd ~/src/checklist
git add src/services/subscriptionService.ts src/services/subscriptionService.test.ts src/components/auth/ProfileDialog.tsx
git commit -m "fix(billing): one effective-tier rule for the frontend

getSubscriptionInfo inlined a copy of getEffectiveTier missing the
past_due/cancelled arm, so a past_due user saw paid limits there and free
limits via getMaxLists. Use the shared helper. Repoints off billing-shared."
```

---

### Task 3: Repoint the backend billing types

**Files:**
- Modify: `backend/src/billing/stripe.ts:2-7`
- Test: `backend/test/billing.test.ts` (existing — must stay green)

**Model:** `haiku` — a mechanical import swap; the replacement text is given verbatim.

**Interfaces:**
- Consumes: `SubscriptionTier`, `SubscriptionStatus`, `TierConfig`, `UserSubscription` from Task 1.
- Produces: no change — `stripe.ts` keeps re-exporting `TierSlug`, `SubscriptionStatus`,
  `SubscriptionTier` (= `TierConfig`) and `UserSubscription` exactly as before.

- [ ] **Step 1: Swap the import**

In `backend/src/billing/stripe.ts`, replace lines 2-7 with:

```ts
import type {
  SubscriptionTier as BaseTier,
  SubscriptionStatus,
  TierConfig,
  UserSubscription as BaseUserSubscription,
} from '../../../shared/billing.js';
```

Update the stale comment at ~line 24 and ~line 30:

```ts
// Re-export base types from shared/billing
```

```ts
// Use the shared TierConfig for tier structure (uses maxItems, retentionDays)
```

- [ ] **Step 2: Verify the backend type-checks and tests pass**

Run: `cd ~/src/checklist && npx tsc --noEmit -p backend/tsconfig.json && cd backend && npx vitest run test/billing`
Expected: type-check clean; billing suites PASS

If `tsc` reports that `shared/billing.ts` is outside the backend `rootDir`, confirm how
`backend/tsconfig.json` already resolves `shared/schema.ts` (the backend imports it today) and
follow that same arrangement — do not add a new path alias.

- [ ] **Step 3: Commit**

```bash
cd ~/src/checklist
git add backend/src/billing/stripe.ts
git commit -m "refactor(billing): backend types from shared/billing"
```

---

### Task 4: Vendor `ApiErrors` + `RateLimiter` into the backend

**Files:**
- Create: `backend/src/lib/api-error.ts`
- Create: `backend/src/lib/rate-limiter.ts`
- Create: `backend/test/lib/rate-limiter.test.ts`
- Modify: `backend/src/billing/routes.ts:16`
- Modify: `backend/src/db.ts:11` (stale comment only)

**Model:** `sonnet` — two new files plus a comment that is now factually wrong.

**Interfaces:**
- Produces:
  - `class RateLimiter { constructor(maxRequests?: number, windowMs?: number); check(key: string, now?: number): boolean; getRemaining(key: string, now?: number): number; reset(key: string): void; clear(): void; destroy(): void }`
  - `const ApiErrors` with `unauthorized`, `forbidden`, `notFound`, `badRequest`, `rateLimited`,
    `serverError`, `serviceUnavailable`
  - `function sendError<T extends MinimalResponse>(res, status, error, message?): T`

- [ ] **Step 1: Write the failing test**

Create `backend/test/lib/rate-limiter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/lib/rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to maxRequests then blocks', () => {
    const limiter = new RateLimiter(3, 60_000);

    expect(limiter.check('user-1', 1000)).toBe(true);
    expect(limiter.check('user-1', 1000)).toBe(true);
    expect(limiter.check('user-1', 1000)).toBe(true);
    expect(limiter.check('user-1', 1000)).toBe(false);

    limiter.destroy();
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiter(1, 60_000);

    expect(limiter.check('a', 1000)).toBe(true);
    expect(limiter.check('a', 1000)).toBe(false);
    expect(limiter.check('b', 1000)).toBe(true);

    limiter.destroy();
  });

  it('starts a fresh window once the old one expires', () => {
    const limiter = new RateLimiter(1, 60_000);

    expect(limiter.check('user-1', 1000)).toBe(true);
    expect(limiter.check('user-1', 1000)).toBe(false);
    expect(limiter.check('user-1', 62_000)).toBe(true);

    limiter.destroy();
  });

  it('reports remaining requests', () => {
    const limiter = new RateLimiter(3, 60_000);

    expect(limiter.getRemaining('user-1', 1000)).toBe(3);
    limiter.check('user-1', 1000);
    expect(limiter.getRemaining('user-1', 1000)).toBe(2);

    limiter.destroy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/src/checklist/backend && npx vitest run test/lib/rate-limiter.test.ts`
Expected: FAIL — cannot resolve `../../src/lib/rate-limiter.js`

- [ ] **Step 3: Create `backend/src/lib/rate-limiter.ts`**

Only the in-memory limiter is vendored — `PersistentRateLimiter` and the
`emailVerificationLimiter`/`shareInviteLimiter`/`tokenValidationLimiter` singletons exist in
jbr-jazz for other consumers and CheckList imports none of them.

```ts
/**
 * Simple in-memory rate limiter with automatic cleanup. Resets on server restart.
 * Vendored from @jbr-jazz/hierarchy-backend during the de-jazzing.
 */
export class RateLimiter {
  private limits: Map<string, { count: number; resetAt: number }>;
  private maxRequests: number;
  private windowMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(maxRequests: number = 3, windowMs: number = 60 * 60 * 1000) {
    this.limits = new Map();
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    // Don't block process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.limits.entries()) {
      if (value.resetAt < now) {
        this.limits.delete(key);
      }
    }
  }

  /** Stop the cleanup interval and clear all entries. */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.limits.clear();
  }

  /** Returns true if the request is allowed, false if rate limited. */
  check(key: string, now: number = Date.now()): boolean {
    const limit = this.limits.get(key);

    if (!limit || limit.resetAt < now) {
      this.limits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (limit.count >= this.maxRequests) {
      return false;
    }

    limit.count++;
    return true;
  }

  /** Remaining requests for a key; `maxRequests` if no window is open. */
  getRemaining(key: string, now: number = Date.now()): number {
    const limit = this.limits.get(key);

    if (!limit || limit.resetAt < now) {
      return this.maxRequests;
    }

    return Math.max(0, this.maxRequests - limit.count);
  }

  reset(key: string): void {
    this.limits.delete(key);
  }

  clear(): void {
    this.limits.clear();
  }
}
```

- [ ] **Step 4: Create `backend/src/lib/api-error.ts`**

```ts
/**
 * Standardized API error responses for Express routes.
 * Vendored from @jbr-jazz/hierarchy-backend during the de-jazzing.
 *
 * Generic over the response type so it stays compatible across @types/express versions.
 */

/** Minimal Response shape, for compatibility across express versions. */
export interface MinimalResponse {
  req?: { id?: string } | null;
  status(code: number): this;
  json(body: unknown): this;
}

export interface RequestWithId {
  id?: string;
}

export interface ApiErrorResponse {
  error: string;
  message?: string;
  requestId?: string;
}

/** Send a standardized error response. All API errors go through here. */
export function sendError<T extends MinimalResponse>(
  res: T,
  status: number,
  error: string,
  message?: string,
): T {
  const requestId = (res.req as RequestWithId | undefined)?.id;

  const response: ApiErrorResponse = { error };

  if (message) {
    response.message = message;
  }

  if (requestId) {
    response.requestId = requestId;
  }

  return res.status(status).json(response);
}

export const ApiErrors = {
  unauthorized: <T extends MinimalResponse>(res: T) =>
    sendError(res, 401, 'unauthorized', 'Authentication required'),

  forbidden: <T extends MinimalResponse>(res: T, message = 'Access denied') =>
    sendError(res, 403, 'forbidden', message),

  notFound: <T extends MinimalResponse>(res: T, resource = 'Resource') =>
    sendError(res, 404, 'not_found', `${resource} not found`),

  badRequest: <T extends MinimalResponse>(res: T, message: string) =>
    sendError(res, 400, 'bad_request', message),

  rateLimited: <T extends MinimalResponse>(res: T) =>
    sendError(res, 429, 'rate_limited', 'Too many requests. Please try again later.'),

  serverError: <T extends MinimalResponse>(res: T, message = 'An unexpected error occurred') =>
    sendError(res, 500, 'server_error', message),

  serviceUnavailable: <T extends MinimalResponse>(
    res: T,
    message = 'Service temporarily unavailable',
  ) => sendError(res, 503, 'service_unavailable', message),
} as const;
```

- [ ] **Step 5: Repoint `routes.ts` and fix the stale `db.ts` comment**

In `backend/src/billing/routes.ts`, replace line 16:

```ts
import { ApiErrors } from '../lib/api-error.js';
import { RateLimiter } from '../lib/rate-limiter.js';
```

In `backend/src/db.ts`, line 11 currently reads "Sharing + verified-email tables are owned by
@jbr-jazz/hierarchy-backend's initDb." That package is being removed and rowboat's
`@jbroll/rowboat-auth-betterauth` owns the `verified_email` schema now. Replace it with:

```ts
 * Sharing + verified-email tables are owned by @jbroll/rowboat-auth-betterauth and
 * @jbroll/rowboat-sharing.
```

Verify that claim before writing it: `grep -rn "verified_email\|CREATE TABLE" backend/src/db.ts
backend/src/migrations/` and confirm CheckList does not create those tables itself. If CheckList
*does* own them, describe what is actually true instead — do not copy this line blindly.

- [ ] **Step 6: Run the backend tests**

Run: `cd ~/src/checklist/backend && npx vitest run`
Expected: PASS — including `test/lib/rate-limiter.test.ts` (4 tests) and the billing route suites

- [ ] **Step 7: Commit**

```bash
cd ~/src/checklist
git add backend/src/lib backend/test/lib backend/src/billing/routes.ts backend/src/db.ts
git commit -m "refactor(backend): vendor ApiErrors + RateLimiter from hierarchy-backend

Both are app concerns, not engine concerns. Only the in-memory limiter is
vendored; CheckList imports none of the other exports."
```

---

### Task 5: Drop the dependencies

**Files:**
- Modify: `backend/package.json` — remove `@jbr-jazz/billing-shared`, `@jbr-jazz/hierarchy-backend`, `jazz-tools`
- Modify: `knip.json` — remove **both** `"@jbr-jazz/billing-shared"` (added by Task 3) and
  `"@jbr-jazz/hierarchy-backend"` (added by Task 4) from the **backend** `ignoreDependencies` list.
  Each was a temporary bridge so the gate would pass while the `backend/package.json` entry still
  existed. Once the dependencies are gone both ignores are dead and **must** come out in the same
  commit, or the bridges silently become permanent. After this task, the backend
  `ignoreDependencies` list must contain no `@jbr-jazz/*` entry at all — check it explicitly.

**Already done — do NOT redo (Task 2 pulled this forward):** the root `package.json` cleanup
(`@jbr-jazz/billing-shared`, `jazz-tools`, `better-sqlite3`, `jazz-mock` all removed), the
`vite.config.ts` changes (`vendor-jazz` chunk dropped, `jazz-tools` dropped from `dedupe`), the
`jazz-mock` knip ignore removal, and the lockfile regeneration.

**`better-auth` is NOT to be removed.** No CheckList source imports it, so knip reports it unused —
but the file:-linked `@jbroll/rowboat-auth-betterauth-react` dist imports `better-auth/react` and
resolves it from the app's `node_modules`. Removing it fails `npm run build` with "Rollup failed to
resolve import". It is intentionally retained with a root `knip.json` `ignoreDependencies` entry.

**Model:** `sonnet` — config edits whose blast radius is the whole build; needs judgment if install or bundling complains.

**Interfaces:**
- Consumes: Tasks 1-4 must all be committed first — nothing may still import `@jbr-jazz/*`.
- Produces: a tree with zero jbr-jazz and zero jazz-tools dependencies.

- [ ] **Step 1: Verify nothing imports jbr-jazz or jazz-tools any more**

Run:
```bash
cd ~/src/checklist
grep -rn "@jbr-jazz\|jazz-tools" --include="*.ts" --include="*.tsx" src backend/src shared e2e test-helpers 2>/dev/null
```
Expected: **no output.** If anything prints, that import was missed — go fix it before continuing.

- [ ] **Step 2: Remove the dependency entries**

Delete these lines:
- `package.json`: `"@jbr-jazz/billing-shared": "file:../jbr-jazz/packages/billing/shared",` and `"jazz-tools": "0.20.18",`
- `backend/package.json`: `"@jbr-jazz/billing-shared": "file:../../jbr-jazz/packages/billing/shared",`, `"@jbr-jazz/hierarchy-backend": "file:../../jbr-jazz/packages/hierarchy/backend",` and `"jazz-tools": "0.20.18",`

- [ ] **Step 3: Clean up `vite.config.ts`**

Delete the `'vendor-jazz': ['jazz-tools'],` line from the manual chunks at line 87.

Replace the dedupe block at lines 212-217 with:

```ts
    // Force a SINGLE better-auth instance in the bundle.
    dedupe: ['better-auth', 'react', 'react-dom'],
```

- [ ] **Step 4: Reinstall and confirm the lockfiles drop the packages**

Run:
```bash
cd ~/src/checklist && npm install && cd backend && npm install
cd ~/src/checklist && grep -c "jazz" package-lock.json backend/package-lock.json
```
Expected: install succeeds; both counts are `0`. A non-zero count means something still pulls
jazz transitively — find it with `npm ls jazz-tools` before proceeding.

- [ ] **Step 5: Run the full check**

Run: `cd ~/src/checklist && npm run check && npm run knip`
Expected: type-check clean, lint clean, all unit tests PASS, knip reports no unused/unlisted
dependencies. If knip now flags `jazz-mock` as an unused entry in `ignoreDependencies`, remove that
entry from `knip.json`.

- [ ] **Step 6: Verify the production build still bundles**

Run: `cd ~/src/checklist && npm run build`
Expected: build succeeds with no `vendor-jazz` chunk in the output listing.

- [ ] **Step 7: Commit**

```bash
cd ~/src/checklist
git add package.json package-lock.json backend/package.json backend/package-lock.json vite.config.ts knip.json
git commit -m "chore: drop all @jbr-jazz and jazz-tools dependencies

CheckList's jbr-jazz dependency count is now zero. jazz-tools was already a
phantom — declared in both manifests with no direct import anywhere."
```

---

### Task 6: Stop CI linking and building the jbr-jazz siblings

**Files:**
- Modify: `ci/setup.sh` — remove `link_sibling jbr-jazz`, `link_sibling jazz-mock` (~lines 52-55),
  the jbr-jazz build block (~line 77 onward), and the stale references in the header comments
  (~lines 9, 24)
- Modify: `e2e/error-handling.spec.ts:557` — `window.indexedDB.deleteDatabase('jazz-tools')` deletes
  a database this app no longer creates

**Model:** `sonnet` — shell infrastructure whose failure mode is a broken CI run, not a typo.

**Why this is functional, not cosmetic:** `ci/setup.sh` currently links the `jbr-jazz` and
`jazz-mock` sibling directories into every CI worktree and then builds the jbr-jazz packages.
Nothing consumes them any more, so that is pure wasted work today — and it becomes a hard CI
failure the moment `~/src/jbr-jazz` is retired, which is exactly what this branch unblocks. Leave
the `rowboat` linking and its dist check completely alone; that is live and load-bearing.

**Leave `lefthook.yml` alone.** Its `ts-jazz-waist: skip: true` and the comment above it are still
accurate. Re-enabling that gate as a permanent anti-regression guard is a separate decision with its
own risk, not part of this cleanup.

**Interfaces:**
- Consumes: Task 5 complete — no dependency on jbr-jazz remains, so nothing needs the siblings.

- [ ] **Step 1: Remove the sibling linking and the jbr-jazz build block from `ci/setup.sh`**

Delete the two `link_sibling` calls and the comment above them:

```sh
# jbr-jazz/jazz-mock are legacy siblings still imported by not-yet-ported code;
# they get a fresh node_modules from their own build step below.
link_sibling jbr-jazz
link_sibling jazz-mock
```

Then delete the whole jbr-jazz build block that begins:

```sh
# jbr-jazz packages are consumed as built dist; ensure they're built in CI (legacy,
# for not-yet-ported code still importing @jbr-jazz/*).
JBR="$(dirname "$WORKTREE")/jbr-jazz"
if [ -d "$JBR" ]; then
```

Read to the end of that `if` block and remove all of it, including any `JBR`-derived variables that
become unused. Then fix the header comments at ~lines 9 and 24, which describe checklist as
depending on `@jbr-jazz/*` and `jazz-mock` — it no longer does.

**Do not touch the `rowboat` linking, `ROWBOAT` variable, or the rowboat dist check.** Those are live.

- [ ] **Step 2: Verify the script is still valid shell and has no dangling references**

Run:
```bash
cd /home/john/src/checklist
bash -n ci/setup.sh && echo "SYNTAX OK"
grep -n "jbr-jazz\|jazz-mock\|JBR" ci/setup.sh
```
Expected: `SYNTAX OK`, and the grep prints **nothing**. A surviving `JBR` reference means the build
block was only partly removed.

- [ ] **Step 3: Remove the stale IndexedDB cleanup in the e2e test**

In `e2e/error-handling.spec.ts`, line ~557 calls
`window.indexedDB.deleteDatabase('jazz-tools')`. This app no longer creates that database. Remove
that single line, leaving every other database cleanup in the same block intact.

- [ ] **Step 4: Verify and commit**

Run: `cd /home/john/src/checklist && npm run check`
Expected: type-check clean, lint clean, all unit tests pass.

```bash
git add ci/setup.sh e2e/error-handling.spec.ts
git commit -m "chore(ci): stop linking and building the jbr-jazz siblings

Nothing imports them any more. Linking them was wasted work on every CI run
and would become a hard failure once ~/src/jbr-jazz is retired. Also drops a
stale IndexedDB cleanup for a database the app no longer creates."
```

---

### Task 7: Update the docs and stale prose

**Files:**
- Modify: `CLAUDE.md:10-12` (the ported-off-Jazz note), `CLAUDE.md:262` (the no-jazz-tools rule)
- Modify: `ARCHITECTURE.md:7`, `ARCHITECTURE.md:77`
- Modify: `README.md` — the remaining "Jazz.tools provides..." architecture prose
- Modify: `backend/src/migrate-auth.ts:28` and its header comment — both still describe the Jazz
  hierarchy backend and "jazz-tools plugin columns"
- Modify: `src/rowboat/index.ts:5`, `src/hooks/useCheckListHierarchy.ts` (header + the comments at
  ~229 and ~239), `src/tokens.css:27`, `e2e/deploy-smoke.spec.ts:25,50`
- Modify: `docs/DEFERRED.md`

**Model:** `sonnet` — prose that must stay accurate about a system the writer has to understand.

**Do NOT touch:** `docs/archive/**` (historical record), any `*.retired` file, or the provenance
comments in `shared/billing.ts`, `backend/src/lib/api-error.ts` and `backend/src/lib/rate-limiter.ts`
that say "Vendored from @jbr-jazz/..." — those are true and useful.

**Interfaces:**
- Consumes: Tasks 5 and 6 complete — the docs must describe the tree as it now is.

- [ ] **Step 1: Update `CLAUDE.md`**

Replace the blockquote at lines 10-12 with:

```markdown
> CheckList was originally built on Jazz.tools and has been ported off it entirely — there is no
> `jazz-tools` or `@jbr-jazz/*` dependency anywhere in the tree. The rowboat provider lives in
> `src/lib/rowboat.tsx`; the narrow waist the app imports auth + graph hooks from is `src/rowboat/`
> (`@/rowboat`). Subscription tier policy is CheckList's own, in `shared/billing.ts`.
```

Replace line 262 with:

```markdown
- **No `jazz-tools`** anywhere — the dependency is gone, not merely unused. Only `src/rowboat/**`
  (the narrow waist) may touch the underlying
```

(keep whatever the original line's continuation says)

- [ ] **Step 2: Update `ARCHITECTURE.md`**

Line 7 — replace with:

```markdown
> `jazz-tools` is not a dependency at all. The rowboat provider lives in `src/lib/rowboat.tsx`
```

Line 77 mentions "Jazz/jbr-jazz sync service" — read the surrounding sentence and reword so it
describes the rowboat backend that actually serves this today. Do not leave "Jazz/jbr-jazz" in a
sentence describing current behaviour.

- [ ] **Step 3: Record the outcome in `docs/DEFERRED.md`**

The roadmap in `~/src/rowboat/docs/roadmap.md` flagged the billing dependency as "tracked nowhere."
It is now resolved rather than deferred, so record it as closed. Append:

```markdown
## Resolved: jbr-jazz dependency removal (2026-07-20)

CheckList had two undeclared-in-any-tracker dependencies on `~/src/jbr-jazz`:
`@jbr-jazz/billing-shared` (subscription types/limits) and `@jbr-jazz/hierarchy-backend`
(`ApiErrors`, `RateLimiter`). Both are removed.

- Tier policy now lives in `shared/billing.ts` — **per product, by design.** A limit table shared
  across products makes one product's pricing change a breaking change for another.
- `assertTier` throws on an unrecognized slug. The previous shared helper silently downgraded to
  free-tier limits, which would clamp a paying customer with no signal.
- `getSubscriptionInfo` had inlined a copy of the effective-tier rule that omitted the
  past_due/cancelled arm, disagreeing with `getMaxLists` on the same user. Fixed.
- `jazz-tools` was a phantom dependency — declared in both manifests, imported nowhere.

This clears CheckList's half of rowboat roadmap Phase 4 ("retire jbr-jazz"); `wicketmap` remains.
```

- [ ] **Step 4: Commit**

```bash
cd ~/src/checklist
git add CLAUDE.md ARCHITECTURE.md docs/DEFERRED.md
git commit -m "docs: CheckList is fully de-jazzed"
```

---

## Verification

After Task 6, confirm the whole thing from a clean state:

```bash
cd ~/src/checklist
grep -rn "@jbr-jazz\|jazz-tools" --include="*.ts" --include="*.tsx" --include="*.json" \
  src backend/src shared vite.config.ts package.json backend/package.json
npm run check
```

Expected: the grep prints nothing, and `check` is fully green. `DEPLOY.md:198-200` will still
mention a historical "jbr-jazz Schema Alignment" migration — that is a **changelog entry about the
past** and should stay.
