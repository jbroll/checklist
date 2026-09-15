import type {
  AutocompleteDomain,
  ExportFolder,
  ExportItem,
  ExportItemState,
  ExportSession,
  ExportUserSettings,
  ExportViewState,
} from './format.js';

export interface LoadedItem {
  id: string;
  name: string;
  type: 'category' | 'item';
  path: string;
  expanded: boolean;
  sortOrder: number;
  archived: boolean;
  defaultQuantity: string;
  notes?: string;
  createdAt: Date;
}

export interface LoadedItemState {
  selected: boolean;
  checked: boolean;
  selectedAt?: Date;
  checkedAt?: Date;
  notes?: string;
}

export interface LoadedSession {
  id: string;
  itemStates: Record<string, LoadedItemState>;
  archived: boolean;
  categoryExpanded: Record<string, boolean>;
  viewMode: 'zone-in-hierarchy' | 'flat';
  selectedCount: number;
  checkedCount: number;
  remainingCount: number;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface LoadedFolder {
  id: string;
  name: string;
  type: 'folder' | 'template-folder';
  sharingMode: 'private' | 'shared' | 'public';
  expanded?: boolean;
  archived?: boolean;
  archivedAt?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  items?: LoadedItem[];
  sessions?: LoadedSession[];
  defaultItems?: Record<string, boolean>;
  showZoneHeadings?: boolean;
  autocompleteDomain?: AutocompleteDomain;
  autoCategorizeEnabled?: boolean;
}

export interface LoadedSettings {
  defaultAutocompleteDomain?: AutocompleteDomain;
  enableAutoCategorization?: boolean;
  subscriptionTier?: 'free' | 'plus' | 'premium' | 'enterprise';
  subscriptionStatus?: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'beta';
  subscriptionEndsAt?: number;
  maxLists?: number;
  sessionRetentionDays?: number;
  subscriptionSyncedAt?: number;
}

function put<T extends object, K extends keyof T>(out: T, key: K, value: T[K] | undefined): void {
  if (value !== undefined) out[key] = value as T[K];
}

const iso = (d: Date) => d.toISOString();
const isoOpt = (d: Date | undefined) => (d === undefined ? undefined : d.toISOString());

function serializeItem(item: LoadedItem): ExportItem {
  const out = {
    id: item.id,
    name: item.name,
    type: item.type,
    path: item.path,
    expanded: item.expanded,
    sortOrder: item.sortOrder,
    archived: item.archived,
    defaultQuantity: item.defaultQuantity,
    createdAt: iso(item.createdAt),
  } as ExportItem;
  put(out, 'notes', item.notes);
  return out;
}

function serializeItemState(state: LoadedItemState): ExportItemState {
  const out = {
    selected: state.selected,
    checked: state.checked,
  } as ExportItemState;
  put(out, 'selectedAt', isoOpt(state.selectedAt));
  put(out, 'checkedAt', isoOpt(state.checkedAt));
  put(out, 'notes', state.notes);
  return out;
}

function serializeSession(session: LoadedSession): ExportSession {
  return {
    id: session.id,
    itemStates: Object.fromEntries(
      Object.entries(session.itemStates).map(([id, state]) => [id, serializeItemState(state)]),
    ),
    archived: session.archived,
    categoryExpanded: { ...session.categoryExpanded },
    viewMode: session.viewMode,
    selectedCount: session.selectedCount,
    checkedCount: session.checkedCount,
    remainingCount: session.remainingCount,
    createdAt: iso(session.createdAt),
    lastActivityAt: iso(session.lastActivityAt),
  };
}

export function serializeFolder(
  node: LoadedFolder,
  parentId: string | null,
  childIds: string[],
  ownerAccountId: string,
  groupId: string,
): ExportFolder {
  const out = {
    id: node.id,
    parentId,
    childIds,
    ownerAccountId,
    groupId,
    name: node.name,
    type: node.type,
    sharingMode: node.sharingMode,
    createdBy: node.createdBy,
    createdAt: iso(node.createdAt),
    updatedAt: iso(node.updatedAt),
  } as ExportFolder;
  put(out, 'expanded', node.expanded);
  put(out, 'archived', node.archived);
  put(out, 'archivedAt', isoOpt(node.archivedAt));
  put(out, 'items', node.items?.map(serializeItem));
  put(out, 'sessions', node.sessions?.map(serializeSession));
  put(out, 'defaultItems', node.defaultItems ? { ...node.defaultItems } : undefined);
  put(out, 'showZoneHeadings', node.showZoneHeadings);
  put(out, 'autocompleteDomain', node.autocompleteDomain);
  put(out, 'autoCategorizeEnabled', node.autoCategorizeEnabled);
  return out;
}

export function serializeSettings(s: LoadedSettings | null): ExportUserSettings | null {
  if (s === null) return null;
  const out = {} as ExportUserSettings;
  put(out, 'defaultAutocompleteDomain', s.defaultAutocompleteDomain);
  put(out, 'enableAutoCategorization', s.enableAutoCategorization);
  put(out, 'subscriptionTier', s.subscriptionTier);
  put(out, 'subscriptionStatus', s.subscriptionStatus);
  put(out, 'subscriptionEndsAt', s.subscriptionEndsAt);
  put(out, 'maxLists', s.maxLists);
  put(out, 'sessionRetentionDays', s.sessionRetentionDays);
  put(out, 'subscriptionSyncedAt', s.subscriptionSyncedAt);
  return out;
}

export function serializeViewState(v: ExportViewState | null): ExportViewState | null {
  if (v === null) return null;
  return {
    folderExpanded: { ...v.folderExpanded },
    templateCategoryExpanded: Object.fromEntries(
      Object.entries(v.templateCategoryExpanded).map(([id, m]) => [id, { ...m }]),
    ),
    sessionCategoryExpanded: Object.fromEntries(
      Object.entries(v.sessionCategoryExpanded).map(([id, m]) => [id, { ...m }]),
    ),
  };
}

export function countFolders(folders: ExportFolder[]): { folders: number; items: number; sessions: number } {
  return folders.reduce(
    (acc, f) => ({
      folders: acc.folders + 1,
      items: acc.items + (f.items?.length ?? 0),
      sessions: acc.sessions + (f.sessions?.length ?? 0),
    }),
    { folders: 0, items: 0, sessions: 0 },
  );
}
