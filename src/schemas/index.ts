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
  .withMigration((account) => {
    // Initialize root for new accounts
    if (!account.$jazz.has('root')) {
      account.$jazz.set('root', {
        nodes: [],
      });
    }
  });

// Wire up the forward reference from tree.ts to GroceriesAccount
setGroceriesAccountReference(GroceriesAccount);

// NOTE: CATEGORIES constant and autoCategorize() function have been removed.
// Templates now use hierarchical TemplateItems with custom categories per template.
// Each template can define its own category structure with custom icons and colors.

// Re-export tree schemas for easy importing
export { FolderNode, TemplateFolderNode, TemplateItem, ShoppingSession, ItemState };
