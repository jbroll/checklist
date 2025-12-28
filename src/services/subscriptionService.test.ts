/**
 * SubscriptionService Unit Tests
 *
 * Tests for subscription tier logic and limit checking.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  canCreateList,
  getEffectiveTier,
  getListsRemaining,
  getMaxLists,
  getSessionRetentionDays,
  getSubscriptionTier,
  getTierDisplayName,
  getTierPrice,
  getUsagePercentage,
  isApproachingLimit,
  isAtListLimit,
  isBetaUser,
  isPaidTier,
  TIER_LIMITS,
} from './subscriptionService';

// Mock account with Jazz structure
const createMockAccount = (settings: Record<string, any> = {}) => {
  const mockUserSettings: any = {
    subscriptionTier: settings.subscriptionTier,
    // Don't default to 'active' - let the service code provide the default
    subscriptionStatus: settings.subscriptionStatus,
    maxLists: settings.maxLists,
    sessionRetentionDays: settings.sessionRetentionDays,
    subscriptionSyncedAt: settings.subscriptionSyncedAt,
    $jazz: { set: vi.fn() },
  };

  const folders: any[] = [];
  folders.$jazz = { push: vi.fn() };

  return {
    root: {
      userSettings: mockUserSettings,
      folders,
      $jazz: { set: vi.fn() },
    },
    $jazz: { id: 'test-account' },
  } as any;
};

// Helper to add mock template folders
const addTemplateFolders = (account: any, count: number) => {
  for (let i = 0; i < count; i++) {
    account.root.folders.push({
      name: `Template ${i}`,
      items: [], // Has items = template folder
      archived: false,
    });
  }
};

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
    it('should return tier from account settings', () => {
      const account = createMockAccount({ subscriptionTier: 'plus' });

      expect(getSubscriptionTier(account)).toBe('plus');
    });

    it('should default to free when not set', () => {
      const account = createMockAccount({});

      expect(getSubscriptionTier(account)).toBe('free');
    });

    it('should default to free for null account', () => {
      expect(getSubscriptionTier(null as any)).toBe('free');
    });
  });

  describe('isBetaUser', () => {
    it('should return true when status is beta', () => {
      const account = createMockAccount({ subscriptionStatus: 'beta' });

      expect(isBetaUser(account)).toBe(true);
    });

    it('should return false when status is active', () => {
      const account = createMockAccount({ subscriptionStatus: 'active' });

      expect(isBetaUser(account)).toBe(false);
    });

    it('should default to beta when status is not set', () => {
      const account = createMockAccount({});

      expect(isBetaUser(account)).toBe(true);
    });
  });

  describe('getEffectiveTier', () => {
    it('should return plus for beta users regardless of tier', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });

      expect(getEffectiveTier(account)).toBe('plus');
    });

    it('should return actual tier for non-beta users', () => {
      const account = createMockAccount({
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
      });

      expect(getEffectiveTier(account)).toBe('premium');
    });

    it('should return free tier for non-beta free users', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });

      expect(getEffectiveTier(account)).toBe('free');
    });
  });

  describe('getMaxLists', () => {
    it('should return maxLists based on effective tier (beta gets plus limits)', () => {
      // Beta user with free tier gets plus limits
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });

      expect(getMaxLists(account)).toBe(30); // Plus tier limit
    });

    it('should return premium tier maxLists for active premium user', () => {
      const account = createMockAccount({
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
      });

      expect(getMaxLists(account)).toBe(300);
    });

    it('should return plus tier limit for beta users by default', () => {
      // Default status is beta, so free tier users get plus limits
      const account = createMockAccount({});

      expect(getMaxLists(account)).toBe(30); // Plus tier limit (beta default)
    });

    it('should return free tier limit for active free users', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });

      expect(getMaxLists(account)).toBe(3);
    });
  });

  describe('getSessionRetentionDays', () => {
    it('should return retention based on effective tier', () => {
      const account = createMockAccount({
        subscriptionTier: 'premium',
        subscriptionStatus: 'active',
      });

      expect(getSessionRetentionDays(account)).toBe(365);
    });

    it('should return plus tier retention for beta users', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });

      expect(getSessionRetentionDays(account)).toBe(30); // Plus tier retention
    });
  });

  describe('isAtListLimit', () => {
    it('should return true when at limit (non-beta free user)', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      addTemplateFolders(account, 3); // free tier limit is 3

      expect(isAtListLimit(account)).toBe(true);
    });

    it('should return true when over limit', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      addTemplateFolders(account, 5);

      expect(isAtListLimit(account)).toBe(true);
    });

    it('should return false when under limit', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      addTemplateFolders(account, 2);

      expect(isAtListLimit(account)).toBe(false);
    });

    it('should return false for unlimited tier', () => {
      const account = createMockAccount({
        subscriptionTier: 'enterprise',
        subscriptionStatus: 'active',
      });
      addTemplateFolders(account, 1000);

      expect(isAtListLimit(account)).toBe(false);
    });

    it('should use plus limits for beta users', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      addTemplateFolders(account, 3); // Would be at limit for free, but not for plus

      expect(isAtListLimit(account)).toBe(false); // Beta gets plus limits (30)
    });
  });

  describe('canCreateList', () => {
    it('should return true when under limit', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      addTemplateFolders(account, 2);

      expect(canCreateList(account)).toBe(true);
    });

    it('should return false when at limit', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      addTemplateFolders(account, 3);

      expect(canCreateList(account)).toBe(false);
    });

    it('should return true for unlimited tier', () => {
      const account = createMockAccount({
        subscriptionTier: 'enterprise',
        subscriptionStatus: 'active',
      });
      addTemplateFolders(account, 999);

      expect(canCreateList(account)).toBe(true);
    });

    it('should allow more lists for beta users', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'beta' });
      addTemplateFolders(account, 29); // Under plus limit of 30

      expect(canCreateList(account)).toBe(true);
    });
  });

  describe('getListsRemaining', () => {
    it('should return correct remaining count', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      addTemplateFolders(account, 1);

      expect(getListsRemaining(account)).toBe(2); // 3 - 1 = 2
    });

    it('should return 0 when at or over limit', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' });
      addTemplateFolders(account, 5);

      expect(getListsRemaining(account)).toBe(0);
    });

    it('should return -1 for unlimited tier', () => {
      const account = createMockAccount({
        subscriptionTier: 'enterprise',
        subscriptionStatus: 'active',
      });

      expect(getListsRemaining(account)).toBe(-1);
    });
  });

  describe('getUsagePercentage', () => {
    it('should return correct percentage', () => {
      const account = createMockAccount({ subscriptionTier: 'plus', subscriptionStatus: 'active' }); // 30 lists
      addTemplateFolders(account, 9); // 30%

      expect(getUsagePercentage(account)).toBe(30);
    });

    it('should cap at 100%', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }); // 3 lists
      addTemplateFolders(account, 10);

      expect(getUsagePercentage(account)).toBe(100);
    });

    it('should return 0 for unlimited tier', () => {
      const account = createMockAccount({
        subscriptionTier: 'enterprise',
        subscriptionStatus: 'active',
      });
      addTemplateFolders(account, 100);

      expect(getUsagePercentage(account)).toBe(0);
    });
  });

  describe('isApproachingLimit', () => {
    it('should return true at 80% usage', () => {
      const account = createMockAccount({ subscriptionTier: 'plus', subscriptionStatus: 'active' }); // 30 lists
      addTemplateFolders(account, 24); // 80%

      expect(isApproachingLimit(account)).toBe(true);
    });

    it('should return true at 100% usage', () => {
      const account = createMockAccount({ subscriptionTier: 'free', subscriptionStatus: 'active' }); // 3 lists
      addTemplateFolders(account, 3);

      expect(isApproachingLimit(account)).toBe(true);
    });

    it('should return false below 80% usage', () => {
      const account = createMockAccount({ subscriptionTier: 'plus', subscriptionStatus: 'active' }); // 30 lists
      addTemplateFolders(account, 21); // 70%

      expect(isApproachingLimit(account)).toBe(false);
    });

    it('should return false for unlimited tier', () => {
      const account = createMockAccount({
        subscriptionTier: 'enterprise',
        subscriptionStatus: 'active',
      });
      addTemplateFolders(account, 1000);

      expect(isApproachingLimit(account)).toBe(false);
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
});
