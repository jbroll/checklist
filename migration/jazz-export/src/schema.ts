import { Account, co, z } from 'jazz-tools';

// Copies of the Jazz-era schemas at d51a192 (src/schema/tree.ts, src/schema/index.ts).
// No app account schema and no migration: loading as a prod account must never write.

// The base applyMigration creates profile.inbox when it is missing; this skips it on login.
export class ReadOnlyAccount extends Account {
  override async applyMigration(): Promise<void> {}
}

const itemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['category', 'item']),
  path: z.string(),
  expanded: z.boolean(),
  sortOrder: z.number(),
  archived: z.boolean(),
  defaultQuantity: z.string(),
  notes: z.optional(z.string()),
  createdAt: z.date(),
});

const sessionSchema = z.object({
  id: z.string(),
  itemStates: z.record(
    z.string(),
    z.object({
      selected: z.boolean(),
      checked: z.boolean(),
      selectedAt: z.optional(z.date()),
      checkedAt: z.optional(z.date()),
      notes: z.optional(z.string()),
    }),
  ),
  archived: z.boolean(),
  categoryExpanded: z.record(z.string(), z.boolean()),
  viewMode: z.enum(['zone-in-hierarchy', 'flat']),
  selectedCount: z.number(),
  checkedCount: z.number(),
  remainingCount: z.number(),
  createdAt: z.date(),
  lastActivityAt: z.date(),
});

// biome-ignore lint/suspicious/noExplicitAny: recursive schema with forward references, as in the Jazz-era app
export const FolderNode: any = co.map({
  name: z.string(),
  sharingMode: z.enum(['private', 'shared', 'public']),
  expanded: z.optional(z.boolean()),
  archived: z.optional(z.boolean()),
  archivedAt: z.optional(z.date()),
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),

  type: z.enum(['folder', 'template-folder']),

  get children() {
    return co.optional(co.list(FolderNode));
  },
  get parent() {
    return co.optional(FolderNode);
  },

  items: z.optional(z.array(itemSchema)),
  sessions: z.optional(z.array(sessionSchema)),
  showZoneHeadings: z.optional(z.boolean()),
  defaultItems: z.optional(z.record(z.string(), z.boolean())),
  autocompleteDomain: z.optional(z.enum(['none', 'grocery', 'hardware', 'outdoor', 'all'])),
  autoCategorizeEnabled: z.optional(z.boolean()),

  get owner() {
    return co.account();
  },
});

export const ViewState = co.map({
  folderExpanded: z.record(z.string(), z.boolean()),
  templateCategoryExpanded: z.record(z.string(), z.record(z.string(), z.boolean())),
  sessionCategoryExpanded: z.record(z.string(), z.record(z.string(), z.boolean())),
});

export const UserSettings = co.map({
  defaultAutocompleteDomain: z.optional(z.enum(['none', 'grocery', 'hardware', 'outdoor', 'all'])),
  enableAutoCategorization: z.optional(z.boolean()),
  subscriptionTier: z.optional(z.enum(['free', 'plus', 'premium', 'enterprise'])),
  subscriptionStatus: z.optional(z.enum(['active', 'past_due', 'cancelled', 'trialing', 'beta'])),
  subscriptionEndsAt: z.optional(z.number()),
  maxLists: z.optional(z.number()),
  sessionRetentionDays: z.optional(z.number()),
  subscriptionSyncedAt: z.optional(z.number()),
});

export const ListsRoot = co.map({
  folders: co.list(FolderNode),
  viewState: co.optional(ViewState),
  userSettings: co.optional(UserSettings),
});
