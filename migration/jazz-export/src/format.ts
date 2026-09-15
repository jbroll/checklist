export type AutocompleteDomain = 'none' | 'grocery' | 'hardware' | 'outdoor' | 'all';

export interface ExportItem {
  id: string;
  name: string;
  type: 'category' | 'item';
  path: string;
  expanded: boolean;
  sortOrder: number;
  archived: boolean;
  defaultQuantity: string;
  notes?: string;
  createdAt: string; // ISO
}

export interface ExportItemState {
  selected: boolean;
  checked: boolean;
  selectedAt?: string;
  checkedAt?: string;
  notes?: string;
}

export interface ExportSession {
  id: string;
  itemStates: Record<string, ExportItemState>;
  archived: boolean;
  categoryExpanded: Record<string, boolean>;
  viewMode: 'zone-in-hierarchy' | 'flat';
  selectedCount: number;
  checkedCount: number;
  remainingCount: number;
  createdAt: string;
  lastActivityAt: string;
}

export interface ExportMember {
  accountId: string;
  role: string; // Jazz AccountRole: reader | writer | admin | manager | writeOnly
}

export interface ExportFolder {
  id: string;
  parentId: string | null; // null = in root.folders
  childIds: string[]; // Jazz order
  ownerAccountId: string;
  groupId: string;
  members: ExportMember[]; // direct members of the folder's group, not those inherited from parent groups
  name: string;
  // Folders created before the Jazz app wrote these fields have none of the three: the
  // importer applies the Jazz-era isTemplateFolder/sharingMode defaults for them.
  type?: 'folder' | 'template-folder';
  sharingMode?: 'private' | 'shared' | 'public';
  expanded?: boolean;
  archived?: boolean;
  archivedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  items?: ExportItem[];
  sessions?: ExportSession[];
  defaultItems?: Record<string, boolean>;
  showZoneHeadings?: boolean;
  autocompleteDomain?: AutocompleteDomain;
  autoCategorizeEnabled?: boolean;
}

export interface ExportUserSettings {
  defaultAutocompleteDomain?: AutocompleteDomain;
  enableAutoCategorization?: boolean;
  subscriptionTier?: 'free' | 'plus' | 'premium' | 'enterprise';
  subscriptionStatus?: 'active' | 'past_due' | 'cancelled' | 'trialing' | 'beta';
  subscriptionEndsAt?: number;
  maxLists?: number;
  sessionRetentionDays?: number;
  subscriptionSyncedAt?: number;
}

export interface ExportViewState {
  folderExpanded: Record<string, boolean>;
  templateCategoryExpanded: Record<string, Record<string, boolean>>;
  sessionCategoryExpanded: Record<string, Record<string, boolean>>;
}

export interface ExportUser {
  userId: string;
  accountId: string;
  rootFolderIds: string[]; // root.folders order
  folders: ExportFolder[]; // every folder reachable from the root, each id once
  userSettings: ExportUserSettings | null;
  viewState: ExportViewState | null;
}

export interface UsersFile {
  user: Record<string, unknown>[];
  account: Record<string, unknown>[];
  verification: Record<string, unknown>[];
}

export interface ManifestUser {
  userId: string;
  accountId: string;
  folders: number;
  items: number;
  sessions: number;
}

export interface Manifest {
  exportedAt: string;
  shareInvites: number;
  users: ManifestUser[];
  failed: { userId: string; error: string }[];
}
