/**
 * SubscriptionService Unit Tests (rowboat port, slice-2)
 *
 * Subscription/preference state lives in the `user_settings` singleton row; template-folder counts
 * come from the `folder` table. Tests run against an in-memory `makeGraph()` graph — no sync, no
 * React. A brand-new user has NO settings row, which is the DESIGNED default state (→ free/beta).
 */

import type { Row } from '@jbroll/rowboat-schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FolderRow } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import type { UserSettingsRow } from '../../shared/schema.js';
import {
  buildDefaultUserSettings,
  canCreateList,
  createCheckoutSession,
  createPortalSession,
  ensureUserSettings,
  getBetaMessage,
  getEffectiveTier,
  getListsRemaining,
  getMaxLists,
  getSessionRetentionDays,
  getSubscriptionInfo,
  getSubscriptionTier,
  getTierDisplayName,
  getTierPrice,
  getUsagePercentage,
  isApproachingLimit,
  isAtListLimit,
  isBetaUser,
  isPaidTier,
  needsSubscriptionSync,
  recordUsageToBackend,
  redirectToCheckout,
  redirectToPortal,
  syncSubscriptionFromBackend,
  TIER_LIMITS,
} from './subscriptionService';

type Graph = ReturnType<typeof makeGraph>;

/** Fields a test may set on the user_settings singleton (camelCase mirrors the old settings shape). */
interface SettingsInput {
  subscriptionTier?: UserSettingsRow['subscription_tier'];
  subscriptionStatus?: UserSettingsRow['subscription_status'];
  subscriptionEndsAt?: number;
  subscriptionSyncedAt?: number;
  maxLists?: number;
  sessionRetentionDays?: number;
}

/** Build a complete user_settings row from a partial camelCase input (all columns present). */
function settingsRow(input: SettingsInput): UserSettingsRow {
  return {
    id: 'u1',
    owner_group_id: 'g1',
    default_autocomplete_domain: 'none',
    enable_auto_categorization: true,
    subscription_tier: input.subscriptionTier ?? 'free',
    subscription_status: input.subscriptionStatus ?? 'beta',
    subscription_ends_at: input.subscriptionEndsAt ?? 0,
    max_lists: input.maxLists ?? TIER_LIMITS.plus.maxLists,
    session_retention_days: input.sessionRetentionDays ?? TIER_LIMITS.plus.sessionRetentionDays,
    subscription_synced_at: input.subscriptionSyncedAt ?? 0,
  };
}

let nextFolderId = 0;
/** Build a complete non-archived template-folder row (all required Folder columns present). */
function templateFolderRow(): FolderRow {
  nextFolderId += 1;
  const id = `f${nextFolderId}`;
  return {
    id,
    owner_group_id: 'g1',
    name: `Template ${id}`,
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: 0,
    updated_at: 0,
    items: [],
    sessions: [],
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
  };
}

/**
 * Build a graph. Pass `settings` to seed the user_settings singleton (omit for a brand-new user
 * with no row → free/beta defaults). `lists` seeds that many template folders.
 */
function makeAccount(settings?: SettingsInput, lists = 0): Graph {
  const seed: Record<string, Row[]> = {};
  if (settings) seed.user_settings = [settingsRow(settings)];
  if (lists > 0) seed.folder = Array.from({ length: lists }, () => templateFolderRow());
  return makeGraph(seed);
}

/** Read the (single) user_settings row, hard-erroring if absent. */
function readSettings(g: Graph): UserSettingsRow {
  const node = g.user_settings.all()[0];
  if (!node) throw new Error('no user_settings row');
  return node.$data;
}

describe('SubscriptionService', () => {
  describe('TIER_LIMITS', () => {
    it('should have correct limits for free tier', () => {
      expect(TIER_LIMITS.free.maxLists).toBe(3);
      expect(TIER_LIMITS.free.sessionRetentionDays).toBe(7);
    });

    it('should have correct limits for plus tier', () => {
      expect(TIER_LIMITS.plus.maxLists).toBe(30);
      expect(TIER_LIMITS.plus.sessionRetentionDays).toBe(30);
    });

    it('should have correct limits for premium tier', () => {
      expect(TIER_LIMITS.premium.maxLists).toBe(300);
      expect(TIER_LIMITS.premium.sessionRetentionDays).toBe(365); // 1 year
    });

    it('should have correct limits for enterprise tier', () => {
      expect(TIER_LIMITS.enterprise.maxLists).toBe(-1); // Unlimited
      expect(TIER_LIMITS.enterprise.sessionRetentionDays).toBe(-1); // Unlimited
    });
  });

  describe('getSubscriptionTier', () => {
    it('should return tier from settings row', () => {
      expect(getSubscriptionTier(makeAccount({ subscriptionTier: 'plus' }))).toBe('plus');
    });

    it('should default to free when no settings row exists', () => {
      expect(getSubscriptionTier(makeAccount())).toBe('free');
    });
  });

  describe('isBetaUser', () => {
    it('should return true when status is beta', () => {
      expect(isBetaUser(makeAccount({ subscriptionStatus: 'beta' }))).toBe(true);
    });

    it('should return false when status is active', () => {
      expect(isBetaUser(makeAccount({ subscriptionStatus: 'active' }))).toBe(false);
    });

    it('should default to beta when no settings row exists', () => {
      expect(isBetaUser(makeAccount())).toBe(true);
    });
  });

  describe('getEffectiveTier', () => {
    it('should return plus for beta users regardless of tier', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      expect(getEffectiveTier(g)).toBe('plus');
    });

    it('should return actual tier for non-beta users', () => {
      const g = makeAccount({ subscriptionTier: 'premium', subscriptionStatus: 'active' });
      expect(getEffectiveTier(g)).toBe('premium');
    });

    it('should return free tier for non-beta free users', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      expect(getEffectiveTier(g)).toBe('free');
    });
  });

  describe('getMaxLists', () => {
    it('should return maxLists based on effective tier (beta gets plus limits)', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      expect(getMaxLists(g)).toBe(30); // Plus tier limit
    });

    it('should return premium tier maxLists for active premium user', () => {
      const g = makeAccount({ subscriptionTier: 'premium', subscriptionStatus: 'active' });
      expect(getMaxLists(g)).toBe(300);
    });

    it('should return plus tier limit for a brand-new user by default (beta)', () => {
      expect(getMaxLists(makeAccount())).toBe(30); // Plus tier limit (beta default)
    });

    it('should return free tier limit for active free users', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      expect(getMaxLists(g)).toBe(3);
    });
  });

  describe('getSessionRetentionDays', () => {
    it('should return retention based on effective tier', () => {
      const g = makeAccount({ subscriptionTier: 'premium', subscriptionStatus: 'active' });
      expect(getSessionRetentionDays(g)).toBe(365);
    });

    it('should return plus tier retention for beta users', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      expect(getSessionRetentionDays(g)).toBe(30); // Plus tier retention
    });
  });

  describe('isAtListLimit', () => {
    it('should return true when at limit (non-beta free user)', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 3);
      expect(isAtListLimit(g)).toBe(true);
    });

    it('should return true when over limit', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 5);
      expect(isAtListLimit(g)).toBe(true);
    });

    it('should return false when under limit', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 2);
      expect(isAtListLimit(g)).toBe(false);
    });

    it('should return false for unlimited tier', () => {
      const g = makeAccount({ subscriptionTier: 'enterprise', subscriptionStatus: 'active' }, 1000);
      expect(isAtListLimit(g)).toBe(false);
    });

    it('should use plus limits for beta users', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' }, 3);
      expect(isAtListLimit(g)).toBe(false); // Beta gets plus limits (30)
    });
  });

  describe('canCreateList', () => {
    it('should return true when under limit', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 2);
      expect(canCreateList(g)).toBe(true);
    });

    it('should return false when at limit', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 3);
      expect(canCreateList(g)).toBe(false);
    });

    it('should return true for unlimited tier', () => {
      const g = makeAccount({ subscriptionTier: 'enterprise', subscriptionStatus: 'active' }, 999);
      expect(canCreateList(g)).toBe(true);
    });

    it('should allow more lists for beta users', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' }, 29);
      expect(canCreateList(g)).toBe(true); // Under plus limit of 30
    });
  });

  describe('getListsRemaining', () => {
    it('should return correct remaining count', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 1);
      expect(getListsRemaining(g)).toBe(2); // 3 - 1 = 2
    });

    it('should return 0 when at or over limit', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 5);
      expect(getListsRemaining(g)).toBe(0);
    });

    it('should return -1 for unlimited tier', () => {
      const g = makeAccount({ subscriptionTier: 'enterprise', subscriptionStatus: 'active' });
      expect(getListsRemaining(g)).toBe(-1);
    });
  });

  describe('getUsagePercentage', () => {
    it('should return correct percentage', () => {
      const g = makeAccount({ subscriptionTier: 'plus', subscriptionStatus: 'active' }, 9); // 30 max
      expect(getUsagePercentage(g)).toBe(30);
    });

    it('should cap at 100%', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 10); // 3 max
      expect(getUsagePercentage(g)).toBe(100);
    });

    it('should return 0 for unlimited tier', () => {
      const g = makeAccount({ subscriptionTier: 'enterprise', subscriptionStatus: 'active' }, 100);
      expect(getUsagePercentage(g)).toBe(0);
    });
  });

  describe('isApproachingLimit', () => {
    it('should return true at 80% usage', () => {
      const g = makeAccount({ subscriptionTier: 'plus', subscriptionStatus: 'active' }, 24); // 80%
      expect(isApproachingLimit(g)).toBe(true);
    });

    it('should return true at 100% usage', () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 3);
      expect(isApproachingLimit(g)).toBe(true);
    });

    it('should return false below 80% usage', () => {
      const g = makeAccount({ subscriptionTier: 'plus', subscriptionStatus: 'active' }, 21); // 70%
      expect(isApproachingLimit(g)).toBe(false);
    });

    it('should return false for unlimited tier', () => {
      const g = makeAccount({ subscriptionTier: 'enterprise', subscriptionStatus: 'active' }, 1000);
      expect(isApproachingLimit(g)).toBe(false);
    });
  });

  describe('getTierDisplayName', () => {
    it('should return display names for all tiers', () => {
      expect(getTierDisplayName('free')).toBe('Free');
      expect(getTierDisplayName('plus')).toBe('Plus');
      expect(getTierDisplayName('premium')).toBe('Premium');
      expect(getTierDisplayName('enterprise')).toBe('Enterprise');
    });
  });

  describe('getTierPrice', () => {
    it('should return prices for all tiers', () => {
      expect(getTierPrice('free')).toBe('Free');
      expect(getTierPrice('plus')).toBe('$9.99/year');
      expect(getTierPrice('premium')).toBe('$19.99/year');
      expect(getTierPrice('enterprise')).toBe('Contact sales');
    });
  });

  describe('isPaidTier', () => {
    it('should return false for free tier', () => {
      expect(isPaidTier('free')).toBe(false);
    });

    it('should return true for paid tiers', () => {
      expect(isPaidTier('plus')).toBe(true);
      expect(isPaidTier('premium')).toBe(true);
      expect(isPaidTier('enterprise')).toBe(true);
    });
  });

  describe('getBetaMessage', () => {
    it('should return the beta message', () => {
      expect(getBetaMessage()).toBe('During beta, all users have Plus features free!');
    });
  });

  describe('getSubscriptionInfo', () => {
    it('should return subscription info with defaults (no settings row)', () => {
      const info = getSubscriptionInfo(makeAccount());

      expect(info.tier).toBe('free');
      expect(info.status).toBe('beta');
      expect(info.limits).toEqual(TIER_LIMITS.plus); // Beta gets plus limits
      expect(info.endsAt).toBeNull();
      expect(info.syncedAt).toBeNull();
    });

    it('should return subscription info for active user', () => {
      const g = makeAccount({ subscriptionTier: 'premium', subscriptionStatus: 'active' });
      const info = getSubscriptionInfo(g);

      expect(info.tier).toBe('premium');
      expect(info.status).toBe('active');
      expect(info.limits).toEqual(TIER_LIMITS.premium);
    });

    it('should include endsAt and syncedAt when available', () => {
      const endsAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
      const syncedAt = Date.now();
      const g = makeAccount({
        subscriptionTier: 'plus',
        subscriptionStatus: 'active',
        subscriptionEndsAt: endsAt,
        subscriptionSyncedAt: syncedAt,
      });
      const info = getSubscriptionInfo(g);

      expect(info.endsAt).toBe(endsAt);
      expect(info.syncedAt).toBe(syncedAt);
    });
  });

  describe('needsSubscriptionSync', () => {
    it('should return true if never synced (no settings row)', () => {
      expect(needsSubscriptionSync(makeAccount())).toBe(true);
    });

    it('should return true if synced more than an hour ago', () => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      expect(needsSubscriptionSync(makeAccount({ subscriptionSyncedAt: twoHoursAgo }))).toBe(true);
    });

    it('should return false if synced recently', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      expect(needsSubscriptionSync(makeAccount({ subscriptionSyncedAt: fiveMinutesAgo }))).toBe(
        false,
      );
    });
  });
});

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

describe('SubscriptionService - Backend Integration', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;
  const originalLocation = window.location;

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockReset();
    // Mock window.location
    // biome-ignore lint/suspicious/noExplicitAny: test-only teardown of a read-only DOM global
    delete (window as any).location;
    window.location = { href: '' } as Location;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    window.location = originalLocation;
  });

  describe('syncSubscriptionFromBackend', () => {
    it('should sync subscription data into the user_settings row on success', async () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            subscription: {
              tierSlug: 'plus',
              status: 'active',
              currentPeriodEnd: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
              tier: { maxLists: 30, sessionRetentionDays: 30 },
            },
          }),
      });

      await syncSubscriptionFromBackend(g);

      expect(mockFetch).toHaveBeenCalledWith('/api/billing/subscription', {
        credentials: 'include',
      });
      const settings = readSettings(g);
      expect(settings.subscription_tier).toBe('plus');
      expect(settings.subscription_status).toBe('active');
      expect(settings.max_lists).toBe(30);
      expect(settings.session_retention_days).toBe(30);
      expect(settings.subscription_synced_at).toBeGreaterThan(0);
    });

    it('should not write on a failed response', async () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await syncSubscriptionFromBackend(g);

      const settings = readSettings(g);
      expect(settings.subscription_tier).toBe('free');
      expect(settings.subscription_synced_at).toBe(0);
    });

    it('should not write when subscription data is missing', async () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      await syncSubscriptionFromBackend(g);

      expect(readSettings(g).subscription_synced_at).toBe(0);
    });

    it('should not write on a network error', async () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await syncSubscriptionFromBackend(g);

      expect(readSettings(g).subscription_synced_at).toBe(0);
    });
  });

  describe('recordUsageToBackend', () => {
    it('should send usage data to backend', async () => {
      const g = makeAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }, 5);
      mockFetch.mockResolvedValueOnce({ ok: true });

      await recordUsageToBackend(g);

      expect(mockFetch).toHaveBeenCalledWith('/api/billing/usage', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ listCount: 5 }),
      });
    });

    it('should handle errors silently', async () => {
      const g = makeAccount();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      // Should not throw
      await recordUsageToBackend(g);
    });
  });

  describe('createCheckoutSession', () => {
    it('should return checkout URL on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://checkout.stripe.com/session123' }),
      });

      const url = await createCheckoutSession('plus');

      expect(url).toBe('https://checkout.stripe.com/session123');
      expect(mockFetch).toHaveBeenCalledWith('/api/billing/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        body: JSON.stringify({ tierSlug: 'plus' }),
      });
    });

    it('should return null on failed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Payment failed' }),
      });

      expect(await createCheckoutSession('premium')).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      expect(await createCheckoutSession('plus')).toBeNull();
    });
  });

  describe('createPortalSession', () => {
    it('should return portal URL on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://billing.stripe.com/portal123' }),
      });

      const url = await createPortalSession();

      expect(url).toBe('https://billing.stripe.com/portal123');
      expect(mockFetch).toHaveBeenCalledWith('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
    });

    it('should return null on failed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Session expired' }),
      });

      expect(await createPortalSession()).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      expect(await createPortalSession()).toBeNull();
    });
  });

  describe('redirectToCheckout', () => {
    it('should redirect to checkout URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://checkout.stripe.com/session123' }),
      });

      await redirectToCheckout('plus');

      expect(window.location.href).toBe('https://checkout.stripe.com/session123');
    });

    it('should not redirect if URL is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed' }),
      });

      await redirectToCheckout('plus');

      expect(window.location.href).toBe('');
    });
  });

  describe('redirectToPortal', () => {
    it('should redirect to portal URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ url: 'https://billing.stripe.com/portal123' }),
      });

      await redirectToPortal();

      expect(window.location.href).toBe('https://billing.stripe.com/portal123');
    });

    it('should not redirect if URL is null', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed' }),
      });

      await redirectToPortal();

      expect(window.location.href).toBe('');
    });
  });

  describe('ensureUserSettings', () => {
    it('creates the singleton row (designed free/beta defaults) when none exists', async () => {
      const g = makeGraph({});
      expect(g.user_settings.all()).toHaveLength(0);

      await ensureUserSettings(g, 'u1', 'g1');

      const rows = g.user_settings.all();
      expect(rows).toHaveLength(1);
      expect(rows[0].$data.id).toBe('u1');
      expect(rows[0].$data.owner_group_id).toBe('g1');
      expect(rows[0].$data.subscription_tier).toBe('free');
      expect(rows[0].$data.subscription_status).toBe('beta');
    });

    it('is idempotent — a second call does not create a second row', async () => {
      const g = makeGraph({});
      await ensureUserSettings(g, 'u1', 'g1');
      await ensureUserSettings(g, 'u1', 'g1');
      expect(g.user_settings.all()).toHaveLength(1);
    });

    it('never overwrites an existing row (persisted cache survives)', async () => {
      const g = makeAccount({ subscriptionTier: 'premium', subscriptionStatus: 'active' });
      await ensureUserSettings(g, 'u1', 'g1');
      expect(g.user_settings.all()).toHaveLength(1);
      expect(getSubscriptionTier(g)).toBe('premium');
    });

    it('buildDefaultUserSettings carries every column, including the view-state maps', () => {
      const row = buildDefaultUserSettings('u1', 'g1');
      expect(row.view_folder_expanded).toEqual({});
      expect(row.view_template_category_expanded).toEqual({});
      expect(row.view_session_category_expanded).toEqual({});
      expect(row.max_lists).toBe(TIER_LIMITS.free.maxLists);
    });
  });
});
