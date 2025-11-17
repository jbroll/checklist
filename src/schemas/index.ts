import { co } from 'jazz-tools';
import {
  FolderNode,
  type ItemState,
  type SessionData,
  setAccountReference,
  Template,
  type TemplateItem,
} from './tree';

/**
 * ListsRoot - Root schema with hierarchical folder tree
 *
 * New structure:
 * - folders: Hierarchical tree of FolderNode CoValues
 */
export const ListsRoot = co.map({
  // Hierarchical folder tree - each FolderNode is a CoValue
  folders: co.list(FolderNode),
});

/**
 * Account Schema
 * Each user has a root containing their folder tree.
 */
export const Account = co
  .account({
    root: ListsRoot,
    profile: co.profile(),
  })
  .withMigration(async (account) => {
    // Initialize root for new accounts
    if (!account.$jazz.has('root')) {
      const folders = co.list(FolderNode).create([], { owner: account });
      account.$jazz.set('root', ListsRoot.create({ folders }, { owner: account }));
      return;
    }

    // Fix existing accounts with broken root
    const { root } = await account.$jazz.ensureLoaded({ resolve: { root: {} } });
    if (root && !root.$jazz.has('folders')) {
      const folders = co.list(FolderNode).create([], { owner: account });
      root.$jazz.set('folders', folders);
    }
  });

// Wire up the forward reference from tree.ts to Account
setAccountReference(Account);

// Re-export tree schemas and types for easy importing
export { FolderNode, Template, type SessionData, type TemplateItem, type ItemState };

// Alias for backwards compatibility
export type Session = SessionData;
