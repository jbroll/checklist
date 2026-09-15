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
}

export interface UserPlan {
  userId: string;
  folders: FolderRowDraft[];
  userSettings: UserSettingsRow;
  notCarried: NotCarried;
  counts: { folders: number; items: number; sessions: number };
}

/** Build the rb.ordered keyed-map storage form, minting a fracKey per element in array order. */
function toOrderedMap<T extends { id: string }>(items: T[]): OrderedMap<T> {
  const map: OrderedMap<T> = {};
  let prev: string | undefined;
  for (const item of items) {
    prev = fracKey.between(prev, undefined);
    map[item.id] = { ...item, __order: prev };
  }
  return map;
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

function toFolderRowDraft(folder: ExportFolder, userId: string): FolderRowDraft {
  const items = [...(folder.items ?? [])].sort(
    (a, b) => a.sortOrder - b.sortOrder || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const sessions = [...(folder.sessions ?? [])].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  return {
    id: folder.id,
    name: folder.name,
    type: folder.type,
    parent_id: folder.parentId,
    sharing_mode: folder.sharingMode,
    archived: folder.archived ?? false,
    expanded: folder.expanded ?? false,
    created_by: userId,
    created_at: Date.parse(folder.createdAt),
    updated_at: Date.parse(folder.updatedAt),
    items: toOrderedMap(items.map(toTemplateItem)),
    sessions: toOrderedMap(sessions.map(toSessionData)),
    default_items: folder.defaultItems ?? {},
    show_zone_headings: folder.showZoneHeadings ?? false,
    auto_categorize_enabled: folder.autoCategorizeEnabled ?? false,
    autocomplete_domain: folder.autocompleteDomain ?? 'none',
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
      folders.push(toFolderRowDraft(folder, user.userId));
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
