import { co } from 'jazz-tools';
import {
  FolderNode,
  ItemState,
  ShoppingSession,
  setGroceriesAccountReference,
  TemplateFolderNode,
  TemplateItem,
} from './tree';

// Root Schema for user's lists
// Flat list of folder nodes (both organizational and template folders)
// Template folders contain hierarchical TemplateItems organized by path
export const ListsRoot = co.map({
  nodes: co.list(FolderNode),
});

// Account Schema (must be defined after ListsRoot)
export const GroceriesAccount = co
  .account({
    root: ListsRoot,
    profile: co.profile(),
  })
  .withMigration(async (account) => {
    // Initialize root for new accounts
    if (!account.$jazz.has('root')) {
      const nodes = co.list(FolderNode).create([], { owner: account });
      account.$jazz.set('root', ListsRoot.create({ nodes }, { owner: account }));
      return;
    }

    // Fix existing accounts with broken root.nodes (migration from old initialization)
    const { root } = await account.$jazz.ensureLoaded({ resolve: { root: {} } });
    if (root && !root.$jazz.has('nodes')) {
      const nodes = co.list(FolderNode).create([], { owner: account });
      root.$jazz.set('nodes', nodes);
    }
  });

// Wire up the forward reference from tree.ts to GroceriesAccount
setGroceriesAccountReference(GroceriesAccount);

// NOTE: CATEGORIES constant and autoCategorize() function have been removed.
// Templates now use hierarchical TemplateItems with custom categories per template.
// Each template can define its own category structure with custom icons and colors.

// Re-export tree schemas for easy importing
export { FolderNode, TemplateFolderNode, TemplateItem, ShoppingSession, ItemState };
