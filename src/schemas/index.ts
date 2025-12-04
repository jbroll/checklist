import { co, z } from 'jazz-tools';
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
 * UserSettings - Global user preferences
 *
 * Controls autocomplete and auto-categorization behavior.
 * These are defaults that can be overridden per-template.
 */
export const UserSettings = co.map({
  // Default autocomplete domain for new templates: 'none' | 'grocery' | 'hardware' | 'all'
  defaultAutocompleteDomain: z.optional(z.enum(['none', 'grocery', 'hardware', 'all'])),

  // @deprecated - use defaultAutocompleteDomain instead
  enableAutocomplete: z.optional(z.boolean()),

  // Enable auto-categorization when selecting from autocomplete (default: true)
  enableAutoCategorization: z.optional(z.boolean()),
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
          enableAutocomplete: true,
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
          enableAutocomplete: true,
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
