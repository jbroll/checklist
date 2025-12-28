import { co, type InstanceOfSchema, z } from 'jazz-tools';
import {
  FolderNode,
  type ItemState,
  type SessionData,
  setAccountReference,
  Template,
  type TemplateItem,
} from './tree';

/**
 * ViewState - Per-user UI state (not shared with collaborators)
 *
 * Stores expand/collapse state separately from shared CoValues so each user
 * can have their own view preferences without affecting others.
 */
export const ViewState = co.map({
  // Which folders are expanded in the tree (folderId -> expanded)
  folderExpanded: z.record(z.string(), z.boolean()),

  // Which categories are expanded in template editor (templateId -> categoryId -> expanded)
  templateCategoryExpanded: z.record(z.string(), z.record(z.string(), z.boolean())),

  // Which categories are expanded per session (sessionId -> categoryKey -> expanded)
  sessionCategoryExpanded: z.record(z.string(), z.record(z.string(), z.boolean())),
});

/**
 * Subscription tier type
 * - free: Basic tier (3 lists, 7-day retention)
 * - plus: Mid tier (30 lists, 30-day retention) - $9.99/yr
 * - premium: High tier (300 lists, 1-year retention) - $19.99/yr
 * - enterprise: Unlimited (contact sales)
 */
export type SubscriptionTier = 'free' | 'plus' | 'premium' | 'enterprise';

/**
 * Subscription status
 * - beta: Beta period - gets Plus tier limits regardless of actual tier
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'trialing' | 'beta';

/**
 * UserSettings - Global user preferences
 *
 * Controls autocomplete, auto-categorization behavior, and cached subscription status.
 * These are defaults that can be overridden per-template.
 */
export const UserSettings = co.map({
  // Default autocomplete domain for new templates: 'none' | 'grocery' | 'hardware' | 'outdoor' | 'all'
  defaultAutocompleteDomain: z.optional(z.enum(['none', 'grocery', 'hardware', 'outdoor', 'all'])),

  // Enable auto-categorization when selecting from autocomplete (default: true)
  enableAutoCategorization: z.optional(z.boolean()),

  // === Subscription fields (cached from backend, source of truth is server) ===

  // Current subscription tier
  subscriptionTier: z.optional(z.enum(['free', 'plus', 'premium', 'enterprise'])),

  // Subscription status
  subscriptionStatus: z.optional(z.enum(['active', 'past_due', 'cancelled', 'trialing', 'beta'])),

  // When the current subscription period ends (Unix timestamp)
  subscriptionEndsAt: z.optional(z.number()),

  // Cached limits for offline display
  maxLists: z.optional(z.number()),
  sessionRetentionDays: z.optional(z.number()),

  // Last time subscription was synced from backend
  subscriptionSyncedAt: z.optional(z.number()),
});

/**
 * ListsRoot - Root schema with hierarchical folder tree
 *
 * Structure:
 * - folders: Hierarchical tree of FolderNode CoValues
 * - viewState: Per-user UI state (expand/collapse preferences)
 * - userSettings: Global user preferences (autocomplete, auto-categorization)
 */
export const ListsRoot = co.map({
  // Hierarchical folder tree - each FolderNode is a CoValue
  folders: co.list(FolderNode),

  // Per-user view state (not shared with collaborators)
  viewState: co.optional(ViewState),

  // Global user preferences
  userSettings: co.optional(UserSettings),
});

/**
 * Account Schema
 * Each user has a root containing their folder tree.
 *
 * Migration pattern follows Jazz best practices:
 * 1. Initialize root if never set (creates placeholder for new accounts)
 * 2. Load from cloud (replaces placeholder if cloud data exists)
 * 3. Fix any broken structures in the loaded root
 *
 * This prevents data loss when logging in from private/incognito tabs.
 */
export const Account = co
  .account({
    root: ListsRoot,
    profile: co.profile(),
  })
  .withMigration(async (account) => {
    // Step 1: Initialize root if never set (for truly new accounts)
    // This creates a local placeholder that will be replaced if cloud data exists
    if (!account.$jazz.has('root')) {
      const folders = co.list(FolderNode).create([], { owner: account });
      const viewState = ViewState.create(
        {
          folderExpanded: {},
          templateCategoryExpanded: {},
          sessionCategoryExpanded: {},
        },
        { owner: account },
      );
      const userSettings = UserSettings.create(
        {
          enableAutoCategorization: true,
        },
        { owner: account },
      );
      account.$jazz.set(
        'root',
        ListsRoot.create({ folders, viewState, userSettings }, { owner: account }),
      );
    }

    // Step 2: Load from cloud - this will replace the placeholder if cloud data exists
    // ensureLoaded() updates the account reference to point to cloud version when available
    const { root } = await account.$jazz.ensureLoaded({
      resolve: { root: { folders: true, viewState: true, userSettings: true } },
    });

    // Step 3: Fix structure if needed (for broken existing accounts)
    if (!root.$jazz.has('folders')) {
      const folders = co.list(FolderNode).create([], { owner: account });
      root.$jazz.set('folders', folders);
    }

    // Step 4: Initialize viewState for existing accounts that don't have it
    if (!root.$jazz.has('viewState')) {
      const viewState = ViewState.create(
        {
          folderExpanded: {},
          templateCategoryExpanded: {},
          sessionCategoryExpanded: {},
        },
        { owner: account },
      );
      root.$jazz.set('viewState', viewState);
    }

    // Step 5: Initialize userSettings for existing accounts that don't have it
    if (!root.$jazz.has('userSettings')) {
      const userSettings = UserSettings.create(
        {
          enableAutoCategorization: true,
        },
        { owner: account },
      );
      root.$jazz.set('userSettings', userSettings);
    }
  });

// Wire up the forward reference from tree.ts to Account
setAccountReference(Account);

// Re-export tree schemas and types for easy importing
export { FolderNode, Template, type SessionData, type TemplateItem, type ItemState };

// Alias for backwards compatibility
export type Session = SessionData;

/**
 * Type alias for Account instances used in service functions.
 *
 * Jazz v0.18.x has TypeScript inference issues where:
 * - useAccount<typeof Account>() returns a slightly different type
 * - InstanceOfSchema<typeof Account> doesn't match the runtime type
 *
 * This alias allows service functions to accept the account from useAccount()
 * without requiring `as any` casts at every call site.
 *
 * Usage in services:
 *   function myService(account: AccountParam, ...) { ... }
 *
 * The `any` is isolated here rather than scattered across the codebase.
 * When Jazz fixes these inference issues, we can update this single type.
 */
// biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference workaround - isolated here
export type AccountParam = InstanceOfSchema<typeof Account> | any;
