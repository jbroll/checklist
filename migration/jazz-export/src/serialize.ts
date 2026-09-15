import type {
  AutocompleteDomain,
  ExportFolder,
  ExportItem,
  ExportItemState,
  ExportMember,
  ExportSession,
  ExportUserSettings,
  ExportViewState,
} from './format.js';

// A z.date() inside a JSON field is stored by JSON.stringify and read back undecoded: an ISO
// string from another node, the original Date only on the node that wrote it.
export type JsonDate = Date | string | number;

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
  createdAt: JsonDate;
}

export interface LoadedItemState {
  selected: boolean;
  checked: boolean;
  selectedAt?: JsonDate;
  checkedAt?: JsonDate;
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
  createdAt: JsonDate;
  lastActivityAt: JsonDate;
}

export interface LoadedFolder {
  id: string;
  name: string;
  // A pre-Jazz-app folder node lacks these; put() below omits them rather than write '' or undefined.
  type?: 'folder' | 'template-folder';
  sharingMode?: 'private' | 'shared' | 'public';
  expanded?: boolean;
  archived?: boolean;
  archivedAt?: Date;
  createdBy?: string;
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

type Iso = (value: unknown, path: string) => string;
type IsoOpt = (value: unknown, path: string) => string | undefined;

// Errors name the field and the value's type, never the value: it may be list content.
function isoAt(folderId: string): { iso: Iso; isoOpt: IsoOpt } {
  const iso: Iso = (value, path) => {
    const date =
      value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : undefined;
    if (date === undefined) throw new Error(`folder ${folderId} ${path}: unsupported date value of type ${typeof value}`);
    if (Number.isNaN(date.getTime())) throw new Error(`folder ${folderId} ${path}: invalid date value of type ${typeof value}`);
    return date.toISOString();
  };
  return { iso, isoOpt: (value, path) => (value === undefined ? undefined : iso(value, path)) };
}

function serializeItem(item: LoadedItem, path: string, iso: Iso): ExportItem {
  const out = {
    id: item.id,
    name: item.name,
    type: item.type,
    path: item.path,
    expanded: item.expanded,
    sortOrder: item.sortOrder,
    archived: item.archived,
    defaultQuantity: item.defaultQuantity,
    createdAt: iso(item.createdAt, `${path}.createdAt`),
  } as ExportItem;
  put(out, 'notes', item.notes);
  return out;
}

function serializeItemState(state: LoadedItemState, path: string, isoOpt: IsoOpt): ExportItemState {
  const out = {
    selected: state.selected,
    checked: state.checked,
  } as ExportItemState;
  put(out, 'selectedAt', isoOpt(state.selectedAt, `${path}.selectedAt`));
  put(out, 'checkedAt', isoOpt(state.checkedAt, `${path}.checkedAt`));
  put(out, 'notes', state.notes);
  return out;
}

function serializeSession(session: LoadedSession, path: string, { iso, isoOpt }: { iso: Iso; isoOpt: IsoOpt }): ExportSession {
  return {
    id: session.id,
    itemStates: Object.fromEntries(
      Object.entries(session.itemStates).map(([id, state]) => [
        id,
        serializeItemState(state, `${path}.itemStates[${JSON.stringify(id)}]`, isoOpt),
      ]),
    ),
    archived: session.archived,
    categoryExpanded: { ...session.categoryExpanded },
    viewMode: session.viewMode,
    selectedCount: session.selectedCount,
    checkedCount: session.checkedCount,
    remainingCount: session.remainingCount,
    createdAt: iso(session.createdAt, `${path}.createdAt`),
    lastActivityAt: iso(session.lastActivityAt, `${path}.lastActivityAt`),
  };
}

export function serializeFolder(
  node: LoadedFolder,
  parentId: string | null,
  childIds: string[],
  ownerAccountId: string,
  groupId: string,
  members: ExportMember[],
): ExportFolder {
  const dates = isoAt(node.id);
  const { iso, isoOpt } = dates;
  const out = {
    id: node.id,
    parentId,
    childIds,
    ownerAccountId,
    groupId,
    members,
    name: node.name,
    createdAt: iso(node.createdAt, 'createdAt'),
    updatedAt: iso(node.updatedAt, 'updatedAt'),
  } as ExportFolder;
  put(out, 'type', node.type);
  put(out, 'sharingMode', node.sharingMode);
  put(out, 'createdBy', node.createdBy);
  put(out, 'expanded', node.expanded);
  put(out, 'archived', node.archived);
  put(out, 'archivedAt', isoOpt(node.archivedAt, 'archivedAt'));
  put(out, 'items', node.items?.map((item, i) => serializeItem(item, `items[${i}]`, iso)));
  put(out, 'sessions', node.sessions?.map((session, i) => serializeSession(session, `sessions[${i}]`, dates)));
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
