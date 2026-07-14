/**
 * Default data seeded for a brand-new user.
 *
 * The Jazz app seeded a starter "Quick Errands" template list in its account `withMigration` hook
 * (schema/index.ts "Step 6"). The rowboat port has no account migration, so the equivalent seed
 * runs once at account-init (jazz.tsx RowboatBridge), alongside `ensureUserSettings` — gated on the
 * user being genuinely new (no pre-existing `user_settings` row), which also means it does NOT
 * re-seed after a user deletes all their lists (an improvement over the Jazz `folders.length === 0`
 * check).
 *
 * The folder is created with all six items + their default-selected flags in ONE write, rather
 * than an addFolder + six createItem calls — the latter would each read-modify-write the same
 * `items` json column and race the async graph propagation (dropping items). NO FALLBACKS.
 */
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { FolderRow, schema } from '@/schema/folder';
import type { TemplateItem } from '../../shared/schema.js';

type Graph = RelationalGraph<typeof schema>;

/** The six starter errands, matching the Jazz seed (schema/index.ts Step 6). */
const QUICK_ERRANDS_ITEMS = [
  'Bank',
  'Dry cleaning',
  'Grocery store',
  'Post office',
  'Gas station',
  'Pharmacy',
] as const;

/**
 * Build the "Quick Errands" template folder row with all six items pre-selected (every item id in
 * `default_items`), mirroring the Jazz seed. Top-level items carry `path === name`.
 */
export function buildQuickErrandsFolder(
  id: string,
  ownerGroupId: string,
  createdBy: string,
  now: number,
): FolderRow {
  const items: TemplateItem[] = QUICK_ERRANDS_ITEMS.map((name, index) => ({
    id: crypto.randomUUID(),
    name,
    type: 'item',
    path: name,
    expanded: false,
    sortOrder: index,
    archived: false,
    defaultQuantity: '',
    createdAt: now,
  }));
  const default_items: Record<string, boolean> = {};
  for (const item of items) default_items[item.id] = true;

  return {
    id,
    owner_group_id: ownerGroupId,
    name: 'Quick Errands',
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: createdBy,
    created_at: now,
    updated_at: now,
    items,
    sessions: [],
    default_items,
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
  };
}

/**
 * Seed the default "Quick Errands" list for a brand-new user. No-op if any folder already exists
 * (a cheap second guard; the caller gates on the user being new). One write — never overwrites.
 */
export async function seedDefaultFolders(
  g: Graph,
  ownerGroupId: string,
  createdBy: string,
): Promise<void> {
  if (g.folder.all().length > 0) return;
  await g.folder.create(
    buildQuickErrandsFolder(crypto.randomUUID(), ownerGroupId, createdBy, Date.now()),
  );
}
