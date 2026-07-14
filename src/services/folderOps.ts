/**
 * folderOps - pure functions over the rowboat relational graph implementing the
 * CheckList folder tree operations (add/rename/archive/delete/move/dedupe/read).
 *
 * Deliberately headless: every function takes the graph `g` as its first argument, so
 * these are unit-testable with `relational(schema, reactiveArrayStore(schema))` — no
 * React, no IndexedDB, no server. React wiring lives in `src/hooks/useCheckListHierarchy.ts`.
 *
 * NO FALLBACKS: a missing node is a hard error (thrown), never a silent no-op.
 */
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { FolderRow, schema } from '@/schema/folder';
import { parseFolderRow } from '@/schema/folderData';

type Graph = RelationalGraph<typeof schema>;

export interface AddFolderInput {
  name: string;
  parentId: string | null;
  type: string;
  ownerGroupId: string;
  createdBy: string;
  now: number;
  id: string;
}

/**
 * Create a new folder row. Group minting (owner_group_id) is the CALLER's responsibility —
 * this function never talks to a server; it only writes the row it's given.
 */
export async function addFolder(g: Graph, input: AddFolderInput): Promise<FolderRow> {
  const row: FolderRow = {
    id: input.id,
    owner_group_id: input.ownerGroupId,
    name: input.name,
    type: input.type,
    parent_id: input.parentId,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: input.createdBy,
    created_at: input.now,
    updated_at: input.now,
    // Template-folder payload: empty for a fresh folder (organizational OR template) — items and
    // sessions are added later via templateService/sessionService.
    items: [],
    sessions: [],
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
  };
  // g.folder.create resolving without throwing IS the success signal. Do NOT read the row
  // back here: on the real IndexedDB-backed graph the write propagates to the readable view
  // asynchronously, so an immediate `g.folder(id)` returns undefined and a read-back check
  // would throw a false "not found" (it succeeds only on the synchronous test store). The
  // reactive `folders`/`useSelect` subscription repaints when the write lands. Return the row
  // we wrote — it is the created FolderRow.
  await g.folder.create(row);
  return row;
}

function requireFolder(g: Graph, id: string) {
  const node = g.folder(id);
  if (!node) {
    throw new Error(`folder ${id} not found`);
  }
  return node;
}

export async function renameNode(g: Graph, id: string, name: string, now: number): Promise<void> {
  requireFolder(g, id);
  await g.folder.update(id, { name, updated_at: now });
}

export async function setArchived(
  g: Graph,
  id: string,
  archived: boolean,
  now: number,
): Promise<void> {
  requireFolder(g, id);
  await g.folder.update(id, { archived, updated_at: now });
}

/** Removes `id` and its entire subtree. Hard-errors if `id` doesn't exist (NO FALLBACKS). */
export async function deleteNode(g: Graph, id: string): Promise<void> {
  const node = requireFolder(g, id);
  const subtree = node.$closure('children'); // does not include `node` itself
  for (const descendant of subtree) {
    await g.folder.remove(descendant.id);
  }
  await g.folder.remove(id);
}

export async function moveNode(
  g: Graph,
  id: string,
  newParentId: string | null,
  now: number,
): Promise<void> {
  requireFolder(g, id);
  await g.folder.move(id, newParentId); // cycle-checked; throws on a cycle
  await g.folder.update(id, { updated_at: now });
}

/** Dedupe `baseName` against the names of `parentId`'s direct children (siblings). */
export function generateUniqueName(g: Graph, baseName: string, parentId: string | null): string {
  const siblingNames = new Set(childrenOf(g, parentId).map((f) => f.name));
  if (!siblingNames.has(baseName)) {
    return baseName;
  }
  let n = 2;
  let candidate = `${baseName} (${n})`;
  while (siblingNames.has(candidate)) {
    n += 1;
    candidate = `${baseName} (${n})`;
  }
  return candidate;
}

export function topLevelFolders(g: Graph): FolderRow[] {
  return g.folder
    .all()
    .filter((f) => f.parent_id === null)
    .map((f) => parseFolderRow(f.$data));
}

export function childrenOf(g: Graph, parentId: string | null): FolderRow[] {
  if (parentId === null) {
    return topLevelFolders(g);
  }
  return requireFolder(g, parentId)
    .children()
    .map((f) => parseFolderRow(f.$data));
}

export function findById(g: Graph, id: string): FolderRow | undefined {
  const row = g.folder(id)?.$data;
  return row ? parseFolderRow(row) : undefined;
}
