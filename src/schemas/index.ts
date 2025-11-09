import { co, z } from 'jazz-tools';
import {
  Session,
  Template,
  setAccountReference,
  type ItemState,
  type TemplateItem,
} from './tree';

/**
 * ListsRoot - Root schema for user's templates
 * Flat list of templates with folder structure inferred from paths.
 * UI state for folder tree (which folders are expanded) stored here.
 */
export const ListsRoot = co.map({
  templates: co.list(Template),

  // UI state for folder tree (path → expanded)
  folderExpanded: co.record(z.string(), z.boolean()),
});

/**
 * Account Schema
 * Each user has a root containing their templates and folder UI state.
 */
export const Account = co
  .account({
    root: ListsRoot,
    profile: co.profile(),
  })
  .withMigration(async (account) => {
    // Initialize root for new accounts
    if (!account.$jazz.has('root')) {
      const templates = co.list(Template).create([], { owner: account });
      const folderExpanded = {};
      account.$jazz.set(
        'root',
        ListsRoot.create({ templates, folderExpanded }, { owner: account })
      );
      return;
    }

    // Fix existing accounts with broken root
    const { root } = await account.$jazz.ensureLoaded({ resolve: { root: {} } });
    if (root && !root.$jazz.has('templates')) {
      const templates = co.list(Template).create([], { owner: account });
      root.$jazz.set('templates', templates);
    }
    if (root && !root.$jazz.has('folderExpanded')) {
      root.$jazz.set('folderExpanded', {});
    }
  });

// Wire up the forward reference from tree.ts to Account
setAccountReference(Account);

// Re-export tree schemas and types for easy importing
export { Template, Session, type TemplateItem, type ItemState };
