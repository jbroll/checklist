/**
 * Folder - rowboat rb.* table for the CheckList folder/template hierarchy.
 *
 * Lives at the repo root (not under `src/` or `backend/src/`) because both the frontend
 * (`src/schema/folder.ts`) and the backend host (`backend/src/index.ts`) need the exact same
 * table definition, and each package's `tsconfig.json` rootDir/include only covers its own
 * tree. A shared root-level module keeps ONE definition instead of two definitions that could
 * drift (a schema mismatch between client and server manifests is exactly the kind of bug NO
 * FALLBACKS forbids papering over).
 *
 * Slice-2 adds the template-folder payload — `items`/`sessions`/`default_items` (JSON columns)
 * plus `show_zone_headings`/`autocomplete_domain`/`auto_categorize_enabled`. In Jazz these were
 * plain-JSON arrays hanging off a `co.map`; here they are `rb.json` columns on the folder row (the
 * browser-soak realdata model). Timestamps inside items/sessions are epoch-ms NUMBERS (not Jazz
 * `Date`s) — JSON columns round-trip numbers cleanly and it matches the row's own int timestamps.
 */
import { type RowOf, rb } from '@jbroll/rowboat-schema';
import { z } from 'zod';

/** A hierarchical category/item node within a template folder (plain JSON, path-keyed tree). */
export const TemplateItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['category', 'item']),
  path: z.string(), // hierarchical path, PATH_SEPARATOR-joined (\x01)
  expanded: z.boolean(),
  sortOrder: z.number(),
  archived: z.boolean(),
  defaultQuantity: z.string(),
  notes: z.optional(z.string()),
  createdAt: z.number(), // epoch ms
});
export type TemplateItem = z.infer<typeof TemplateItemSchema>;

/** Per-item state within a session (checkbox + notes). */
export const ItemStateSchema = z.object({
  selected: z.boolean(),
  checked: z.boolean(),
  selectedAt: z.optional(z.number()),
  checkedAt: z.optional(z.number()),
  notes: z.optional(z.string()),
});
export type ItemState = z.infer<typeof ItemStateSchema>;

/** A shopping/list session over a template's items. */
export const SessionDataSchema = z.object({
  id: z.string(),
  itemStates: z.record(z.string(), ItemStateSchema),
  archived: z.boolean(),
  categoryExpanded: z.record(z.string(), z.boolean()),
  viewMode: z.enum(['zone-in-hierarchy', 'flat']),
  selectedCount: z.number(),
  checkedCount: z.number(),
  remainingCount: z.number(),
  createdAt: z.number(), // epoch ms
  lastActivityAt: z.number(), // epoch ms
});
export type SessionData = z.infer<typeof SessionDataSchema>;

export const Folder = z.object({
  id: rb.id(),
  owner_group_id: rb.scope(),
  name: rb.text(),
  type: rb.text(),
  parent_id: rb.parent('folder'),
  sharing_mode: rb.text(),
  archived: rb.bool(),
  expanded: rb.bool(),
  created_by: rb.text(),
  created_at: rb.int(),
  updated_at: rb.int(),
  // Template-folder payload (empty/absent for organizational folders).
  items: rb.json(z.array(TemplateItemSchema)),
  sessions: rb.json(z.array(SessionDataSchema)),
  default_items: rb.json(z.record(z.string(), z.boolean())),
  show_zone_headings: rb.bool(),
  auto_categorize_enabled: rb.bool(),
  autocomplete_domain: rb.text(),
});

/**
 * UserSettings - per-user singleton row (one row whose `id` IS the user's id) holding global
 * preferences plus the subscription cache. In Jazz this was a `co.map` hanging off the account
 * root; here it's a flat rb.* table. The subscription fields are a CACHE of the backend (the
 * server is the source of truth); they exist so limit checks and tier display work offline.
 *
 * Numbers are epoch-ms / sentinel ints, never Jazz `Date`s or nullable optionals: `-1` means
 * unlimited (max_lists / session_retention_days), `0` means "none / never" (subscription_ends_at,
 * subscription_synced_at). This keeps every column present on every row (no absent-field
 * fallbacks) while still expressing "no value".
 */
export const UserSettings = z.object({
  id: rb.id(), // = the user's id (one singleton row per user)
  owner_group_id: rb.scope(),
  default_autocomplete_domain: rb.text(), // 'none'|'grocery'|'hardware'|'outdoor'|'all'
  enable_auto_categorization: rb.bool(),
  subscription_tier: rb.text(), // 'free'|'plus'|'premium'|'enterprise'
  subscription_status: rb.text(), // 'active'|'past_due'|'cancelled'|'trialing'|'beta'
  subscription_ends_at: rb.int(), // epoch ms (0 if none)
  max_lists: rb.int(), // cached for offline display (-1 = unlimited)
  session_retention_days: rb.int(), // cached (-1 = unlimited)
  subscription_synced_at: rb.int(), // epoch ms (0 if never)
  // Per-user view state (expand/collapse UI preferences), ported off the Jazz `ViewState` co.map.
  // Each defaults to an empty map; `{}` is the designed "nothing customized yet" state.
  view_folder_expanded: rb.json(z.record(z.string(), z.boolean())),
  view_template_category_expanded: rb.json(z.record(z.string(), z.record(z.string(), z.boolean()))),
  view_session_category_expanded: rb.json(z.record(z.string(), z.record(z.string(), z.boolean()))),
});

export const schema = { folder: Folder, user_settings: UserSettings };

export type FolderRow = RowOf<typeof Folder>;
export type UserSettingsRow = RowOf<typeof UserSettings>;
