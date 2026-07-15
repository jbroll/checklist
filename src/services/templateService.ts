/**
 * templateService - pure functions over the rowboat relational graph implementing template
 * folders and their hierarchical item tree (categories + leaf items, path-keyed).
 *
 * A "template" IS a folder row of `type: 'template-folder'`; its items live in the folder row's
 * `items` json column and default-item flags in `default_items`. Ported off Jazz (slice-2) to
 * mirror `folderOps.ts`: every function is headless, taking the graph `g` as its first argument
 * and the folder id second — reads via `g.folder(id).$data`, writes via `g.folder.update(id, …)`.
 * No React, no IndexedDB, no server; React wiring lives in the session components.
 *
 * All timestamps are epoch-ms NUMBERS (`Date.now()`), matching the item schema's `createdAt`.
 *
 * NO FALLBACKS: a missing template or item is a hard error (thrown), never a silent no-op.
 */
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { FolderRow, schema, TemplateItem } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';
import { generateId } from '../lib/utils';
import { createChildPath, getParentPath, PATH_SEPARATOR } from '../utils/pathUtils';
import { itemsList } from './folderListHandles';

type Graph = RelationalGraph<typeof schema>;

// ============================================================================
// Internal Helper Functions
// ============================================================================

function isTemplateFolder(row: { type: string }): boolean {
  return row.type === 'template-folder';
}

/**
 * Read the template folder row (json columns parsed), throwing if it doesn't exist or isn't a
 * template folder.
 */
function requireTemplate(g: Graph, templateId: string): FolderRow {
  const node = g.folder(templateId);
  if (!node || !isTemplateFolder(node.$data)) {
    throw new Error(`Template ${templateId} not found`);
  }
  return parseFolderRow(node.$data);
}

/** Find item index in the items array, throwing if not found. */
function requireItemIndex(items: TemplateItem[], itemId: string): number {
  const index = items.findIndex((i) => i.id === itemId);
  if (index === -1) throw new Error(`Item ${itemId} not found in template`);
  return index;
}

/** Throw if a live (non-archived) item already occupies `path`. */
function assertNoDuplicatePath(items: TemplateItem[], path: string, excludeItemId?: string): void {
  const existingItem = items.find((i) => i.path === path && !i.archived && i.id !== excludeItemId);
  if (existingItem) {
    throw new Error(`Item already exists at path: ${path}`);
  }
}

// ============================================================================
// Template Operations
// ============================================================================

/** Get a template folder's row by ID (returns null if absent or not a template folder). */
export function getTemplate(g: Graph, templateId: string): FolderRow | null {
  const node = g.folder(templateId);
  if (!node) return null;
  const row = node.$data;
  return isTemplateFolder(row) ? parseFolderRow(row) : null;
}

/** Get all non-archived template folders. */
export function getAllTemplates(g: Graph): FolderRow[] {
  return g.folder
    .all()
    .map((f) => f.$data)
    .filter((row) => isTemplateFolder(row) && !row.archived)
    .map(parseFolderRow);
}

/** Check if a template folder exists. */
export function templateExists(g: Graph, templateId: string): boolean {
  return getTemplate(g, templateId) != null;
}

// ============================================================================
// Item Operations
// ============================================================================

/**
 * The per-descendant `path` rewrites when a category moves/renames from `oldParentPath` to
 * `newParentPath`. Returns `{ id, path }` for each affected descendant so callers can apply them as
 * field-level `setField(id, 'path', …)` writes (never a whole-`items` rewrite).
 */
function descendantPathChanges(
  items: TemplateItem[],
  oldParentPath: string,
  newParentPath: string,
): Array<{ id: string; path: string }> {
  const changes: Array<{ id: string; path: string }> = [];
  for (const item of items) {
    if (item.path.startsWith(`${oldParentPath}${PATH_SEPARATOR}`)) {
      const relativePath = item.path.substring(oldParentPath.length + 1);
      changes.push({ id: item.id, path: `${newParentPath}${PATH_SEPARATOR}${relativePath}` });
    }
  }
  return changes;
}

/** Internal helper to create a template item (category or item) and write it back. */
async function createTemplateItem(
  g: Graph,
  templateId: string,
  type: 'category' | 'item',
  name: string,
  parentPath?: string,
  options?: { defaultQuantity?: string; sortOrder?: number; addToDefaults?: boolean },
): Promise<string> {
  const row = requireTemplate(g, templateId);
  const items = row.items;
  const path = createChildPath(parentPath, name);
  assertNoDuplicatePath(items, path);

  const now = Date.now();
  const newItem: TemplateItem = {
    id: generateId(),
    name,
    type,
    path,
    expanded: type === 'category', // Categories start expanded, items don't
    sortOrder: options?.sortOrder ?? items.length,
    archived: false,
    defaultQuantity: options?.defaultQuantity || '',
    createdAt: now,
  };

  await itemsList(g, templateId).append(newItem);

  if (options?.addToDefaults) {
    await g.folder.update(templateId, {
      [`default_items.${newItem.id}`]: true,
      updated_at: now,
    });
  }
  // The IndexedDB graph propagates a write to the readable view asynchronously, so a follow-up
  // read-modify-write on this same row (e.g. adding several items back-to-back) would otherwise
  // read a STALE items array and drop the just-added item (last-write-wins). Wait for this write
  // to be readable before returning so consecutive item creates compose correctly.
  for (let i = 0; i < 100; i += 1) {
    if (getItem(g, templateId, newItem.id)) break;
    await new Promise((r) => setTimeout(r, 10));
  }
  return newItem.id;
}

/** Create a new category in a template. */
export function createCategory(
  g: Graph,
  templateId: string,
  name: string,
  parentPath?: string,
  sortOrder?: number,
): Promise<string> {
  return createTemplateItem(g, templateId, 'category', name, parentPath, { sortOrder });
}

/** Create a new item in a template (auto-added to defaults). */
export function createItem(
  g: Graph,
  templateId: string,
  name: string,
  parentPath?: string,
  defaultQuantity?: string,
  sortOrder?: number,
): Promise<string> {
  return createTemplateItem(g, templateId, 'item', name, parentPath, {
    defaultQuantity,
    sortOrder,
    addToDefaults: true,
  });
}

/** Get an item by ID from a template. */
export function getItem(g: Graph, templateId: string, itemId: string): TemplateItem | null {
  const template = getTemplate(g, templateId);
  if (!template) return null;
  return template.items.find((i) => i.id === itemId) || null;
}

/** Get all non-archived items (categories and leaf items). */
export function getItems(g: Graph, templateId: string): TemplateItem[] {
  const template = getTemplate(g, templateId);
  if (!template) return [];
  return template.items.filter((i) => !i.archived);
}

/** Get only non-archived leaf items (not categories). */
export function getLeafItems(g: Graph, templateId: string): TemplateItem[] {
  const template = getTemplate(g, templateId);
  if (!template) return [];
  return template.items.filter((i) => !i.archived && i.type === 'item');
}

/**
 * Rename an item or category. Updates the path and all descendant paths if it's a category.
 */
export async function renameItem(
  g: Graph,
  templateId: string,
  itemId: string,
  newName: string,
): Promise<void> {
  const row = requireTemplate(g, templateId);
  const items = row.items;
  const itemIndex = requireItemIndex(items, itemId);

  const item = items[itemIndex];
  const oldPath = item.path;
  const parentPath = getParentPath(oldPath);
  const newPath = createChildPath(parentPath, newName);

  if (oldPath !== newPath) {
    assertNoDuplicatePath(items, newPath, itemId);
  }

  const list = itemsList(g, templateId);
  await list.setField(itemId, 'name', newName);
  await list.setField(itemId, 'path', newPath);

  if (item.type === 'category') {
    for (const change of descendantPathChanges(items, oldPath, newPath)) {
      await list.setField(change.id, 'path', change.path);
    }
  }
}

/** Update notes for an item or category (empty string clears the note). */
export async function updateItemNotes(
  g: Graph,
  templateId: string,
  itemId: string,
  notes: string,
): Promise<void> {
  const row = requireTemplate(g, templateId);
  requireItemIndex(row.items, itemId);

  await itemsList(g, templateId).setField(itemId, 'notes', notes || undefined);
}

/**
 * Archive (soft delete) an item or category. If it's a category, also archives all descendants.
 */
export async function archiveItem(g: Graph, templateId: string, itemId: string): Promise<void> {
  const row = requireTemplate(g, templateId);
  const items = row.items;
  const item = items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in template`);

  const categoryPrefix = item.type === 'category' ? `${item.path}${PATH_SEPARATOR}` : null;

  const list = itemsList(g, templateId);
  for (const i of items) {
    if (i.id === itemId || (categoryPrefix && i.path.startsWith(categoryPrefix))) {
      await list.setField(i.id, 'archived', true);
    }
  }
}

/**
 * Move an item to a different parent category. Updates the path and all descendant paths if it's
 * a category. Optionally updates sortOrder in the same operation. No-ops (no write) if neither the
 * path nor the sortOrder change.
 */
export async function moveItem(
  g: Graph,
  templateId: string,
  itemId: string,
  newParentPath: string | undefined,
  sortOrder?: number,
): Promise<void> {
  const row = requireTemplate(g, templateId);
  const items = row.items;
  const itemIndex = requireItemIndex(items, itemId);

  const item = items[itemIndex];
  const oldPath = item.path;
  const newPath = createChildPath(newParentPath, item.name);

  if (oldPath === newPath && sortOrder === undefined) return;

  if (oldPath !== newPath) {
    assertNoDuplicatePath(items, newPath, itemId);
  }

  const list = itemsList(g, templateId);
  await list.setField(itemId, 'path', newPath);
  if (sortOrder !== undefined) await list.setField(itemId, 'sortOrder', sortOrder);

  if (item.type === 'category') {
    for (const change of descendantPathChanges(items, oldPath, newPath)) {
      await list.setField(change.id, 'path', change.path);
    }
  }
}

/** Get category expanded state (throws if the item is not a category). */
export function getCategoryExpanded(g: Graph, templateId: string, itemId: string): boolean {
  const row = requireTemplate(g, templateId);
  const item = row.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Item ${itemId} not found in template`);
  if (item.type !== 'category') throw new Error(`Item ${itemId} is not a category`);
  return item.expanded;
}

/** Set category expanded state explicitly (throws if the item is not a category). */
export async function setCategoryExpanded(
  g: Graph,
  templateId: string,
  itemId: string,
  expanded: boolean,
): Promise<void> {
  const row = requireTemplate(g, templateId);
  const item = row.items[requireItemIndex(row.items, itemId)];
  if (item.type !== 'category') throw new Error(`Item ${itemId} is not a category`);

  await itemsList(g, templateId).setField(itemId, 'expanded', expanded);
}

/** Toggle category expanded state (convenience). */
export async function toggleCategoryExpanded(
  g: Graph,
  templateId: string,
  itemId: string,
): Promise<void> {
  const currentState = getCategoryExpanded(g, templateId, itemId);
  await setCategoryExpanded(g, templateId, itemId, !currentState);
}

/** Reorder an item by changing its sortOrder (fractional indexing). */
export async function reorderItem(
  g: Graph,
  templateId: string,
  itemId: string,
  newSortOrder: number,
): Promise<void> {
  const row = requireTemplate(g, templateId);
  requireItemIndex(row.items, itemId);

  await itemsList(g, templateId).setField(itemId, 'sortOrder', newSortOrder);
}

// ============================================================================
// Insertion Helper Functions
// ============================================================================

/**
 * Calculate insertion parameters (parentPath + sortOrder) for a new item, relative to a
 * currently-selected item. Read-only.
 */
export function calculateInsertionPoint(
  g: Graph,
  templateId: string,
  selectedItemId: string | null,
): { parentPath: string | undefined; sortOrder: number } {
  const row = requireTemplate(g, templateId);
  const items = row.items.filter((item) => !item.archived);

  // If nothing selected, insert at top of root
  if (!selectedItemId) {
    const rootItems = items.filter((item) => getParentPath(item.path) === undefined);

    if (rootItems.length === 0) {
      return { parentPath: undefined, sortOrder: 0 };
    }

    const minSortOrder = Math.min(...rootItems.map((item) => item.sortOrder));
    return { parentPath: undefined, sortOrder: minSortOrder - 1 };
  }

  // Find the selected item
  const selectedItem = items.find((item) => item.id === selectedItemId);
  if (!selectedItem) {
    // Fall back to root if selected item not found
    return { parentPath: undefined, sortOrder: 0 };
  }

  // If selected item is a category, insert at top of that category
  if (selectedItem.type === 'category') {
    const categoryPath = selectedItem.path;
    const childrenInCategory = items.filter((item) => getParentPath(item.path) === categoryPath);

    if (childrenInCategory.length === 0) {
      return { parentPath: categoryPath, sortOrder: 0 };
    }

    const minSortOrder = Math.min(...childrenInCategory.map((item) => item.sortOrder));
    return { parentPath: categoryPath, sortOrder: minSortOrder - 1 };
  }

  // If selected item is a regular item, insert after it in the same parent
  const parentPath = getParentPath(selectedItem.path);
  const siblings = items.filter((item) => getParentPath(item.path) === parentPath);

  // Sort siblings by sortOrder
  siblings.sort((a, b) => a.sortOrder - b.sortOrder);

  // Find the position of the selected item
  const selectedIndex = siblings.findIndex((item) => item.id === selectedItemId);
  if (selectedIndex === -1) {
    // Fall back to end of siblings
    const maxSortOrder = Math.max(...siblings.map((item) => item.sortOrder));
    return { parentPath, sortOrder: maxSortOrder + 1 };
  }

  // Calculate sortOrder to insert after selected item
  if (selectedIndex === siblings.length - 1) {
    // Selected item is last, insert after it
    return { parentPath, sortOrder: selectedItem.sortOrder + 1 };
  }

  // Insert between selected item and next item
  const nextItem = siblings[selectedIndex + 1];
  const sortOrder = (selectedItem.sortOrder + nextItem.sortOrder) / 2;
  return { parentPath, sortOrder };
}

// ============================================================================
// Default Items Operations
// ============================================================================

/** Set whether an item is a default item (pre-selected when creating new sessions). */
export async function setItemDefault(
  g: Graph,
  templateId: string,
  itemId: string,
  isDefault: boolean,
): Promise<void> {
  requireTemplate(g, templateId);
  await g.folder.update(templateId, {
    [`default_items.${itemId}`]: isDefault,
    updated_at: Date.now(),
  });
}

/** Toggle an item's default state. */
export async function toggleItemDefault(
  g: Graph,
  templateId: string,
  itemId: string,
): Promise<void> {
  const row = requireTemplate(g, templateId);
  const isCurrentlyDefault = row.default_items[itemId] === true;
  await setItemDefault(g, templateId, itemId, !isCurrentlyDefault);
}

/** Batch set default state for many items. */
export async function batchSetItemsDefault(
  g: Graph,
  templateId: string,
  itemIds: string[],
  isDefault: boolean,
): Promise<void> {
  requireTemplate(g, templateId);
  const changes: Record<string, unknown> = { updated_at: Date.now() };
  for (const itemId of itemIds) changes[`default_items.${itemId}`] = isDefault;

  await g.folder.update(templateId, changes);
}

/** Invert the default state for each of `itemIds`. */
export async function invertItemsDefault(
  g: Graph,
  templateId: string,
  itemIds: string[],
): Promise<void> {
  const row = requireTemplate(g, templateId);
  const changes: Record<string, unknown> = { updated_at: Date.now() };
  for (const itemId of itemIds)
    changes[`default_items.${itemId}`] = row.default_items[itemId] !== true;

  await g.folder.update(templateId, changes);
}
