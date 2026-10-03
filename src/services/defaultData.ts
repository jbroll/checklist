/**
 * Default data seeded for a brand-new user.
 *
 * A starter "Quick Errands" template list is seeded for a brand-new user. The seed
 * runs once at account-init (rowboat.tsx RowboatBridge), alongside `ensureUserSettings` — gated
 * by `shouldSeedDefaultFolders` on the account store having never held any folder row (including
 * tombstones), which also means it does NOT re-seed after a user deletes all their lists.
 *
 * Seed ids are DETERMINISTIC per account (`quick-errands-<createdBy>` for the folder,
 * `<folderId>-item-<index>` for items): two devices signing into the same account before
 * either has pushed converge on one row via id-keyed last-write-wins instead of minting
 * duplicates. Random ids would duplicate on every new-device login that races the first push.
 *
 * The folder is created with all six items + their default-selected flags in ONE write, rather
 * than an addFolder + six createItem calls — the latter would each read-modify-write the same
 * `items` json column and race the async graph propagation (dropping items). NO FALLBACKS.
 */
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { FolderRow, RawFolderRow, schema, TemplateItem } from '@/schema/folder';
import { toOrderedMap } from './folderListHandles';

type Graph = RelationalGraph<typeof schema>;

/** The six starter errands. */
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
 * `default_items`). Top-level items carry `path === name`. Item ids derive from the folder id so
 * concurrent seeds of the same account merge key-by-key instead of doubling the item list.
 */
export function buildQuickErrandsFolder(
  id: string,
  ownerGroupId: string,
  createdBy: string,
  now: number,
): FolderRow {
  const items: TemplateItem[] = QUICK_ERRANDS_ITEMS.map((name, index) => ({
    id: `${id}-item-${index}`,
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
 * Decide whether to seed the default "Quick Errands" list for an account store.
 *
 * Seeding is gated on the account store having NEVER held any folder row —
 * `totalFolderCount` counts every row including soft-deleted tombstones
 * (`__deleted`), which sync like live rows, so a user who deleted all their
 * lists is not re-seeded. The gate is folder-absence, not settings-absence:
 * the anon-claim adopts the anonymous settings row into the account store
 * before provisioning reads, so a fresh signup-after-anon-visit would
 * otherwise read "not a new user" and never seed. Anonymous stores are
 * transient and get claimed into the account on login, so they never seed.
 */
export function shouldSeedDefaultFolders({
  isAnonymous,
  totalFolderCount,
}: {
  isAnonymous: boolean;
  totalFolderCount: number;
}): boolean {
  if (isAnonymous) return false;
  return totalFolderCount === 0;
}

/**
 * Seed the default "Quick Errands" list for a brand-new user. No-op if any folder already exists
 * (a cheap second guard; the caller gates via `shouldSeedDefaultFolders`). One write — never
 * overwrites. Anonymous users never get seeded content: their store is transient and would be
 * claimed into the signed-in account, producing a duplicate "Quick Errands" on every new device
 * login.
 */
export async function seedDefaultFolders(
  g: Graph,
  ownerGroupId: string,
  createdBy: string,
  isAnonymous = false,
): Promise<void> {
  if (isAnonymous) return;
  if (g.folder.all().length > 0) return;
  const folder = buildQuickErrandsFolder(
    `quick-errands-${createdBy}`,
    ownerGroupId,
    createdBy,
    Date.now(),
  );
  await g.folder.create({
    ...folder,
    items: toOrderedMap(folder.items),
    sessions: {},
  } as unknown as RawFolderRow);
}
