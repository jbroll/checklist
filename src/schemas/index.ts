import { co, z } from 'jazz-tools';
import {
  type DirectoryEntry,
  type ItemState,
  Session,
  setAccountReference,
  Template,
  type TemplateItem,
} from './tree';

/**
 * ListsRoot - Root schema with directory + templates
 *
 * Like a filesystem:
 * - directory: Lightweight entries (dentries) with folder structure and template IDs
 * - templates: Template "inodes" loaded on-demand
 */
export const ListsRoot = co.map({
  // Lightweight directory - fast loading tree structure
  directory: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(['folder', 'template-ref']),
      path: z.string(),
      expanded: z.boolean(),
      archived: z.boolean(),
      templateId: z.optional(z.string()),
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
  ),

  // Template "inodes" - loaded on-demand when editing/using
  templates: co.list(Template),
});

/**
 * Account Schema
 * Each user has a root containing their directory and templates.
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
      const directory: DirectoryEntry[] = [];
      account.$jazz.set('root', ListsRoot.create({ directory, templates }, { owner: account }));
      return;
    }

    // Fix existing accounts with broken root
    const { root } = await account.$jazz.ensureLoaded({ resolve: { root: {} } });
    if (root && !root.$jazz.has('templates')) {
      const templates = co.list(Template).create([], { owner: account });
      root.$jazz.set('templates', templates);
    }
    if (root && !root.$jazz.has('directory')) {
      root.$jazz.set('directory', []);
    }
  });

// Wire up the forward reference from tree.ts to Account
setAccountReference(Account);

// Re-export tree schemas and types for easy importing
export { Template, Session, type DirectoryEntry, type TemplateItem, type ItemState };
