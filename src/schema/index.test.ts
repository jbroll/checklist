/**
 * Unit tests for schemas/index.ts
 *
 * Tests type exports, schema definitions, and re-exports.
 * Note: Jazz CoValue migration behavior is tested via integration/E2E tests.
 */

import { describe, expect, it } from 'vitest';
import {
  Account,
  type AccountParam,
  FolderNode,
  type ItemState,
  ListsRoot,
  type Session,
  type SessionData,
  type SubscriptionStatus,
  type SubscriptionTier,
  Template,
  type TemplateItem,
  UserSettings,
  ViewState,
} from './index';

describe('schemas/index', () => {
  describe('CoValue schema exports', () => {
    it('should export ViewState schema', () => {
      expect(ViewState).toBeDefined();
    });

    it('should export UserSettings schema', () => {
      expect(UserSettings).toBeDefined();
    });

    it('should export ListsRoot schema', () => {
      expect(ListsRoot).toBeDefined();
    });

    it('should export Account schema', () => {
      expect(Account).toBeDefined();
    });

    it('should export FolderNode schema from tree.ts', () => {
      expect(FolderNode).toBeDefined();
    });

    it('should export Template schema from tree.ts', () => {
      expect(Template).toBeDefined();
    });
  });

  describe('type exports', () => {
    it('should export TemplateItem type', () => {
      const item: TemplateItem = {
        id: 'item-1',
        name: 'Test',
        type: 'item',
        path: 'test',
        expanded: false,
        sortOrder: 0,
        archived: false,
        defaultQuantity: '',
        createdAt: new Date(),
      };
      expect(item.id).toBe('item-1');
    });

    it('should export ItemState type', () => {
      const state: ItemState = {
        selected: true,
        checked: false,
      };
      expect(state.selected).toBe(true);
    });

    it('should export SessionData type', () => {
      const session: SessionData = {
        id: 'session-1',
        itemStates: {},
        archived: false,
        categoryExpanded: {},
        viewMode: 'zone-in-hierarchy',
        selectedCount: 0,
        checkedCount: 0,
        remainingCount: 0,
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };
      expect(session.id).toBe('session-1');
    });

    it('should export Session alias for SessionData', () => {
      const session: Session = {
        id: 'session-1',
        itemStates: {},
        archived: false,
        categoryExpanded: {},
        viewMode: 'flat',
        selectedCount: 0,
        checkedCount: 0,
        remainingCount: 0,
        createdAt: new Date(),
        lastActivityAt: new Date(),
      };
      expect(session.viewMode).toBe('flat');
    });
  });

  describe('subscription types', () => {
    it('should support free subscription tier', () => {
      const tier: SubscriptionTier = 'free';
      expect(tier).toBe('free');
    });

    it('should support plus subscription tier', () => {
      const tier: SubscriptionTier = 'plus';
      expect(tier).toBe('plus');
    });

    it('should support premium subscription tier', () => {
      const tier: SubscriptionTier = 'premium';
      expect(tier).toBe('premium');
    });

    it('should support enterprise subscription tier', () => {
      const tier: SubscriptionTier = 'enterprise';
      expect(tier).toBe('enterprise');
    });

    it('should support active subscription status', () => {
      const status: SubscriptionStatus = 'active';
      expect(status).toBe('active');
    });

    it('should support past_due subscription status', () => {
      const status: SubscriptionStatus = 'past_due';
      expect(status).toBe('past_due');
    });

    it('should support cancelled subscription status', () => {
      const status: SubscriptionStatus = 'cancelled';
      expect(status).toBe('cancelled');
    });

    it('should support trialing subscription status', () => {
      const status: SubscriptionStatus = 'trialing';
      expect(status).toBe('trialing');
    });

    it('should support beta subscription status', () => {
      const status: SubscriptionStatus = 'beta';
      expect(status).toBe('beta');
    });
  });

  describe('AccountParam type', () => {
    it('should accept account-like objects', () => {
      // AccountParam is a flexible type that accepts any account-like object
      const account: AccountParam = {
        id: 'test-account',
        root: { folders: [] },
      };
      expect(account.id).toBe('test-account');
    });
  });
});
