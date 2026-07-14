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

export const schema = { folder: Folder };

export type FolderRow = RowOf<typeof Folder>;
