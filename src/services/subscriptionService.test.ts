/**
 * SubscriptionService Unit Tests
 *
 * Tests for subscription tier logic and limit checking.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  canCreateList,
  getListsRemaining,
  getMaxLists,
  getSessionRetentionDays,
  getSubscriptionTier,
  getTierDisplayName,
  getTierPrice,
  getUsagePercentage,
  isApproachingLimit,
  isAtListLimit,
  isPaidTier,
  TIER_LIMITS,
} from './subscriptionService';

// Mock account with Jazz structure
const createMockAccount = (settings: Record<string, any> = {}) => {
  const mockUserSettings: any = {
    subscriptionTier: settings.subscriptionTier,
    subscriptionStatus: settings.subscriptionStatus ?? 'active',
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

    it('should have correct limits for premium tier', () => {
      expect(TIER_LIMITS.premium.maxLists).toBe(30);
      expect(TIER_LIMITS.premium.sessionRetentionDays).toBe(30);
    });

    it('should have correct limits for team tier', () => {
      expect(TIER_LIMITS.team.maxLists).toBe(300);
      expect(TIER_LIMITS.team.sessionRetentionDays).toBe(365); // 1 year
    });

    it('should have correct limits for enterprise tier', () => {
      expect(TIER_LIMITS.enterprise.maxLists).toBe(-1); // Unlimited
      expect(TIER_LIMITS.enterprise.sessionRetentionDays).toBe(-1); // Unlimited
    });
  });

  describe('getSubscriptionTier', () => {
    it('should return tier from account settings', () => {
      const account = createMockAccount({ subscriptionTier: 'premium' });

      expect(getSubscriptionTier(account)).toBe('premium');
    });

    it('should default to free when not set', () => {
      const account = createMockAccount({});

      expect(getSubscriptionTier(account)).toBe('free');
    });

    it('should default to free for null account', () => {
      expect(getSubscriptionTier(null as any)).toBe('free');
    });
  });

  describe('getMaxLists', () => {
    it('should return cached maxLists from settings', () => {
      const account = createMockAccount({ maxLists: 50 });

      expect(getMaxLists(account)).toBe(50);
    });

    it('should fall back to tier defaults when not cached', () => {
      const account = createMockAccount({ subscriptionTier: 'team' });

      expect(getMaxLists(account)).toBe(300);
    });

    it('should return free tier limit as default', () => {
      const account = createMockAccount({});

      expect(getMaxLists(account)).toBe(3);
    });
  });

  describe('getSessionRetentionDays', () => {
    it('should return cached retention from settings', () => {
      const account = createMockAccount({ sessionRetentionDays: 180 });

      expect(getSessionRetentionDays(account)).toBe(180);
    });

    it('should fall back to tier defaults when not cached', () => {
      const account = createMockAccount({ subscriptionTier: 'premium' });

      expect(getSessionRetentionDays(account)).toBe(30);
    });
  });

  describe('isAtListLimit', () => {
    it('should return true when at limit', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 5);

      expect(isAtListLimit(account)).toBe(true);
    });

    it('should return true when over limit', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 7);

      expect(isAtListLimit(account)).toBe(true);
    });

    it('should return false when under limit', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 3);

      expect(isAtListLimit(account)).toBe(false);
    });

    it('should return false for unlimited tier', () => {
      const account = createMockAccount({ maxLists: -1 });
      addTemplateFolders(account, 1000);

      expect(isAtListLimit(account)).toBe(false);
    });
  });

  describe('canCreateList', () => {
    it('should return true when under limit', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 4);

      expect(canCreateList(account)).toBe(true);
    });

    it('should return false when at limit', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 5);

      expect(canCreateList(account)).toBe(false);
    });

    it('should return true for unlimited tier', () => {
      const account = createMockAccount({ maxLists: -1 });
      addTemplateFolders(account, 999);

      expect(canCreateList(account)).toBe(true);
    });
  });

  describe('getListsRemaining', () => {
    it('should return correct remaining count', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 3);

      expect(getListsRemaining(account)).toBe(2);
    });

    it('should return 0 when at or over limit', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 6);

      expect(getListsRemaining(account)).toBe(0);
    });

    it('should return -1 for unlimited tier', () => {
      const account = createMockAccount({ maxLists: -1 });

      expect(getListsRemaining(account)).toBe(-1);
    });
  });

  describe('getUsagePercentage', () => {
    it('should return correct percentage', () => {
      const account = createMockAccount({ maxLists: 10 });
      addTemplateFolders(account, 3);

      expect(getUsagePercentage(account)).toBe(30);
    });

    it('should cap at 100%', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 10);

      expect(getUsagePercentage(account)).toBe(100);
    });

    it('should return 0 for unlimited tier', () => {
      const account = createMockAccount({ maxLists: -1 });
      addTemplateFolders(account, 100);

      expect(getUsagePercentage(account)).toBe(0);
    });
  });

  describe('isApproachingLimit', () => {
    it('should return true at 80% usage', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 4); // 80%

      expect(isApproachingLimit(account)).toBe(true);
    });

    it('should return true at 100% usage', () => {
      const account = createMockAccount({ maxLists: 5 });
      addTemplateFolders(account, 5);

      expect(isApproachingLimit(account)).toBe(true);
    });

    it('should return false below 80% usage', () => {
      const account = createMockAccount({ maxLists: 10 });
      addTemplateFolders(account, 7); // 70%

      expect(isApproachingLimit(account)).toBe(false);
    });

    it('should return false for unlimited tier', () => {
      const account = createMockAccount({ maxLists: -1 });
      addTemplateFolders(account, 1000);

      expect(isApproachingLimit(account)).toBe(false);
    });
  });

  describe('getTierDisplayName', () => {
    it('should return display names for all tiers', () => {
      expect(getTierDisplayName('free')).toBe('Free');
      expect(getTierDisplayName('premium')).toBe('Premium');
      expect(getTierDisplayName('team')).toBe('Team');
      expect(getTierDisplayName('enterprise')).toBe('Enterprise');
    });
  });

  describe('getTierPrice', () => {
    it('should return prices for all tiers', () => {
      expect(getTierPrice('free')).toBe('Free');
      expect(getTierPrice('premium')).toBe('$9.99/year');
      expect(getTierPrice('team')).toBe('$19.99/year');
      expect(getTierPrice('enterprise')).toBe('Contact sales');
    });
  });

  describe('isPaidTier', () => {
    it('should return false for free tier', () => {
      expect(isPaidTier('free')).toBe(false);
    });

    it('should return true for paid tiers', () => {
      expect(isPaidTier('premium')).toBe(true);
      expect(isPaidTier('team')).toBe(true);
      expect(isPaidTier('enterprise')).toBe(true);
    });
  });
});
