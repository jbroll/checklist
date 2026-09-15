import { fracKey } from '@jbroll/rowboat-client';
import type { ExportFolder, ExportItem, ExportItemState, ExportSession, ExportUser } from '../../../migration/jazz-export/src/format.js';
import { DEFAULT_TIER_LIMITS } from '../../../shared/billing.js';
import type { ItemState, SessionData, TemplateItem, UserSettingsRow } from '../../../shared/schema.js';

export type OrderedMap<T> = Record<string, T & { __order: string }>;

export interface FolderRowDraft {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  sharing_mode: string;
  archived: boolean;
  expanded: boolean;
  created_by: string;
  created_at: number;
  updated_at: number;
  items: OrderedMap<TemplateItem>;
  sessions: OrderedMap<SessionData>;
  default_items: Record<string, boolean>;
  show_zone_headings: boolean;
  auto_categorize_enabled: boolean;
  autocomplete_domain: string;
}

export interface NotCarried {
  siblingOrderParents: number;
  archivedAt: string[];
  foreignFolders: string[];
  ownedUnderForeign: string[];
  duplicateItemIds: number;
  duplicateSessionIds: number;
  defaultedType: number;
  defaultedSharingMode: number;
}

export interface UserPlan {
  userId: string;
  folders: FolderRowDraft[];
  userSettings: UserSettingsRow;
  notCarried: NotCarried;
  counts: { folders: number; items: number; sessions: number };
}

/**
 * Build the rb.ordered keyed-map storage form, minting a fracKey per element in array order.
 * Returns the count of elements lost because a later element shared an earlier one's id.
 */
function toOrderedMap<T extends { id: string }>(items: T[]): { map: OrderedMap<T>; duplicates: number } {
  const map: OrderedMap<T> = {};
  let prev: string | undefined;
  let duplicates = 0;
  for (const item of items) {
    if (item.id in map) duplicates += 1;
    prev = fracKey.between(prev, undefined);
    map[item.id] = { ...item, __order: prev };
  }
  return { map, duplicates };
}

function toTemplateItem(item: ExportItem): TemplateItem {
  const mapped: TemplateItem = {
    id: item.id,
    name: item.name,
    type: item.type,
    path: item.path,
    expanded: item.expanded,
    sortOrder: item.sortOrder,
    archived: item.archived,
    defaultQuantity: item.defaultQuantity,
    createdAt: Date.parse(item.createdAt),
  };
  if (item.notes !== undefined) mapped.notes = item.notes;
  return mapped;
}

function toItemState(state: ExportItemState): ItemState {
  const mapped: ItemState = {
    selected: state.selected,
    checked: state.checked,
  };
  if (state.selectedAt !== undefined) mapped.selectedAt = Date.parse(state.selectedAt);
  if (state.checkedAt !== undefined) mapped.checkedAt = Date.parse(state.checkedAt);
  if (state.notes !== undefined) mapped.notes = state.notes;
  return mapped;
}

function toSessionData(session: ExportSession): SessionData {
  const itemStates: Record<string, ItemState> = {};
  for (const [id, state] of Object.entries(session.itemStates)) {
    itemStates[id] = toItemState(state);
  }
  return {
    id: session.id,
    itemStates,
    archived: session.archived,
    categoryExpanded: session.categoryExpanded,
    viewMode: session.viewMode,
    selectedCount: session.selectedCount,
    checkedCount: session.checkedCount,
    remainingCount: session.remainingCount,
    createdAt: Date.parse(session.createdAt),
    lastActivityAt: Date.parse(session.lastActivityAt),
  };
}

/**
 * Jazz-era default for a folder exported without `type`: a folder is a list ("template-folder")
 * if it has an `items` array, even an empty one, and an organizational folder otherwise.
 * Mirrors `isTemplateFolder` (`folder.type === 'template-folder' || folder.items !== undefined`)
 * at d51a192:src/hooks/useCheckListHierarchy.ts:143.
 */
function resolveFolderType(folder: ExportFolder): { type: string; defaulted: boolean } {
  if (folder.type !== undefined) return { type: folder.type, defaulted: false };
  return { type: folder.items !== undefined ? 'template-folder' : 'folder', defaulted: true };
}

// Every Jazz-era folder-creation site defaults sharingMode to 'private' (e.g.
// d51a192:src/hooks/useCheckListHierarchy.ts:118), so an export missing the field gets the same.
function resolveSharingMode(folder: ExportFolder): { sharingMode: string; defaulted: boolean } {
  if (folder.sharingMode !== undefined) return { sharingMode: folder.sharingMode, defaulted: false };
  return { sharingMode: 'private', defaulted: true };
}

function toFolderRowDraft(
  folder: ExportFolder,
  userId: string,
): {
  draft: FolderRowDraft;
  duplicateItemIds: number;
  duplicateSessionIds: number;
  defaultedType: boolean;
  defaultedSharingMode: boolean;
} {
  const items = [...(folder.items ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const sessions = [...(folder.sessions ?? [])].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const items_ = toOrderedMap(items.map(toTemplateItem));
  const sessions_ = toOrderedMap(sessions.map(toSessionData));
  const type = resolveFolderType(folder);
  const sharingMode = resolveSharingMode(folder);
  return {
    draft: {
      id: folder.id,
      name: folder.name,
      type: type.type,
      parent_id: folder.parentId,
      sharing_mode: sharingMode.sharingMode,
      archived: folder.archived ?? false,
      expanded: folder.expanded ?? false,
      created_by: userId,
      created_at: Date.parse(folder.createdAt),
      updated_at: Date.parse(folder.updatedAt),
      items: items_.map,
      sessions: sessions_.map,
      default_items: folder.defaultItems ?? {},
      show_zone_headings: folder.showZoneHeadings ?? false,
      auto_categorize_enabled: folder.autoCategorizeEnabled ?? false,
      autocomplete_domain: folder.autocompleteDomain ?? 'none',
    },
    duplicateItemIds: items_.duplicates,
    duplicateSessionIds: sessions_.duplicates,
    defaultedType: type.defaulted,
    defaultedSharingMode: sharingMode.defaulted,
  };
}

function buildDefaultUserSettings(id: string): UserSettingsRow {
  return {
    id,
    owner_group_id: id,
    default_autocomplete_domain: 'none',
    enable_auto_categorization: true,
    subscription_tier: 'free',
    subscription_status: 'beta',
    subscription_ends_at: 0,
    max_lists: DEFAULT_TIER_LIMITS.free.maxItems,
    session_retention_days: DEFAULT_TIER_LIMITS.free.retentionDays,
    subscription_synced_at: 0,
    view_folder_expanded: {},
    view_template_category_expanded: {},
    view_session_category_expanded: {},
  };
}

function planUserSettings(user: ExportUser): UserSettingsRow {
  const row = buildDefaultUserSettings(user.userId);
  const settings = user.userSettings;
  if (settings) {
    if (settings.defaultAutocompleteDomain !== undefined) {
      row.default_autocomplete_domain = settings.defaultAutocompleteDomain;
    }
    if (settings.enableAutoCategorization !== undefined) {
      row.enable_auto_categorization = settings.enableAutoCategorization;
    }
    if (settings.subscriptionTier !== undefined) row.subscription_tier = settings.subscriptionTier;
    if (settings.subscriptionStatus !== undefined) row.subscription_status = settings.subscriptionStatus;
    if (settings.subscriptionEndsAt !== undefined) row.subscription_ends_at = settings.subscriptionEndsAt;
    if (settings.maxLists !== undefined) row.max_lists = settings.maxLists;
    if (settings.sessionRetentionDays !== undefined) {
      row.session_retention_days = settings.sessionRetentionDays;
    }
    if (settings.subscriptionSyncedAt !== undefined) {
      row.subscription_synced_at = settings.subscriptionSyncedAt;
    }
  }
  const view = user.viewState;
  if (view) {
    row.view_folder_expanded = view.folderExpanded;
    row.view_template_category_expanded = view.templateCategoryExpanded;
    row.view_session_category_expanded = view.sessionCategoryExpanded;
  }
  return row;
}

export function planUser(user: ExportUser): UserPlan {
  const foldersById = new Map(user.folders.map((f) => [f.id, f]));
  const visited = new Set<string>();
  const folders: FolderRowDraft[] = [];
  const notCarried: NotCarried = {
    siblingOrderParents: 0,
    archivedAt: [],
    foreignFolders: [],
    ownedUnderForeign: [],
    duplicateItemIds: 0,
    duplicateSessionIds: 0,
    defaultedType: 0,
    defaultedSharingMode: 0,
  };
  let rootImportedChildren = 0;

  /** Walk a foreign subtree, recording owned descendants without writing anything. */
  function walkForeign(childIds: string[]): void {
    for (const id of childIds) {
      if (visited.has(id)) continue;
      visited.add(id);
      const folder = foldersById.get(id);
      if (!folder) continue;
      if (folder.ownerAccountId === user.accountId) {
        notCarried.ownedUnderForeign.push(id);
      }
      walkForeign(folder.childIds);
    }
  }

  /** Walk owned territory, writing rows and tracking sibling-order and archivedAt findings. */
  function walkOwned(childIds: string[]): number {
    let importedCount = 0;
    for (const id of childIds) {
      if (visited.has(id)) continue;
      visited.add(id);
      const folder = foldersById.get(id);
      if (!folder) continue;
      if (folder.ownerAccountId !== user.accountId) {
        notCarried.foreignFolders.push(id);
        walkForeign(folder.childIds);
        continue;
      }
      importedCount += 1;
      const built = toFolderRowDraft(folder, user.userId);
      folders.push(built.draft);
      notCarried.duplicateItemIds += built.duplicateItemIds;
      notCarried.duplicateSessionIds += built.duplicateSessionIds;
      if (built.defaultedType) notCarried.defaultedType += 1;
      if (built.defaultedSharingMode) notCarried.defaultedSharingMode += 1;
      if (folder.archivedAt !== undefined) notCarried.archivedAt.push(id);
      const childCount = walkOwned(folder.childIds);
      if (childCount >= 2) notCarried.siblingOrderParents += 1;
    }
    return importedCount;
  }

  rootImportedChildren = walkOwned(user.rootFolderIds);
  if (rootImportedChildren >= 2) notCarried.siblingOrderParents += 1;

  const counts = folders.reduce(
    (acc, f) => ({
      folders: acc.folders + 1,
      items: acc.items + Object.keys(f.items).length,
      sessions: acc.sessions + Object.keys(f.sessions).length,
    }),
    { folders: 0, items: 0, sessions: 0 },
  );

  return {
    userId: user.userId,
    folders,
    userSettings: planUserSettings(user),
    notCarried,
    counts,
  };
}
