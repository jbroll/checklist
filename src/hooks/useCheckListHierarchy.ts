/**
 * useCheckListHierarchy - CheckList folder hierarchy hook, on the rowboat graph.
 *
 * Thin React wrapper around `src/services/folderOps.ts` (the headless, unit-tested
 * operations) — this file only adds the reactive subscription (`useRowboat`/`useSelect`)
 * and id generation. Replaces the Jazz-backed `@jbr-jazz/hierarchy-client` `useHierarchy`
 * wrapper of the same name.
 *
 * Group minting (owner_group_id for a new folder) is NOT this hook's job — it is injected
 * via `mintGroup` so this file never talks to a server. Calling `addFolder` without a
 * `mintGroup` configured is a hard error (NO FALLBACKS — there is no silent local-only
 * group).
 *
 * NOTE (follow-up, tracked in docs/superpowers/d-t2-report.md): this hook currently
 * exposes only the hierarchy surface (add/rename/archive/delete/move/dedupe/read) needed
 * by TreeView/AppContainer's tree operations. Items/sessions-dependent members of the old
 * jazz-backed result (`duplicateTemplate`, `getAllTemplateFolders`, `deleteAllUserData`,
 * `emptyTrash`, jazz's `ItemLimitExceededError`/`CircularReferenceError`) are NOT ported
 * here — that data isn't in the rowboat `Folder` table yet (items/sessions land in a later
 * slice). Callers of those members still reference the jazz hook's shape; see the report
 * for the exact call sites.
 */
import { useCallback, useMemo } from 'react';
import { useRowboat, useSelect } from '@/jazz';
import type { FolderRow } from '@/schema/folder';
import {
  childrenOf,
  addFolder as opAddFolder,
  deleteNode as opDeleteNode,
  findById as opFindById,
  generateUniqueName as opGenerateUniqueName,
  moveNode as opMoveNode,
  renameNode as opRenameNode,
  setArchived,
  topLevelFolders,
} from '@/services/folderOps';

export interface UseCheckListHierarchyOptions {
  /** Whether to include archived folders in `folders`. */
  showArchived?: boolean;
  /** Who new folders are attributed to (`created_by`). */
  createdBy: string;
  /**
   * Mints a fresh owner_group_id for a new folder, given its parent's group id (or
   * `undefined` for a top-level folder). Wired to the backend folder-group route in a
   * later task. Required to call `addFolder` — omitting it is a hard error, not a
   * silent local-only group (NO FALLBACKS).
   */
  mintGroup?: (parentGroupId?: string) => Promise<string>;
}

export interface UseCheckListHierarchyResult {
  /** Top-level folders, filtered per `showArchived`. */
  folders: FolderRow[];
  /** Top-level folders, including archived. */
  allFolders: FolderRow[];
  addFolder: (name: string, parentId: string | null, type: string) => Promise<FolderRow>;
  renameNode: (id: string, name: string) => Promise<void>;
  archiveNode: (id: string) => Promise<void>;
  unarchiveNode: (id: string) => Promise<void>;
  deleteNode: (id: string) => Promise<void>;
  moveNode: (id: string, newParentId: string | null) => Promise<void>;
  /**
   * The rowboat `Folder` table has no sibling-ordering column yet, so this reparents
   * exactly like `moveNode` and ignores `index` — sibling order is not modeled in this
   * slice. Kept as a separate name so call sites don't need to change yet.
   */
  moveNodeToIndex: (id: string, newParentId: string | null, index: number) => Promise<void>;
  generateUniqueName: (baseName: string, parentId: string | null) => string;
  findById: (id: string) => FolderRow | undefined;
  childrenOf: (parentId: string | null) => FolderRow[];
  /** Billing is deferred in this slice — creation is never blocked. */
  canCreate: () => boolean;
  /**
   * TODO(slice-2): trash/template/items/account-wipe surface. Items/sessions aren't in the
   * rowboat `Folder` table yet, so these are explicit no-op stubs (empty array / resolved
   * promise), not silent fallbacks over real data — callers must hide the UI that drives
   * them (see TreeView's `hideArchivedTemplatesToggle`-style gating).
   */
  archivedFolders: FolderRow[];
  emptyTrash: () => Promise<void>;
  duplicateTemplate: (id: string) => FolderRow | undefined;
  getAllTemplateFolders: () => FolderRow[];
  deleteAllUserData: () => Promise<void>;
}

export function useCheckListHierarchy(
  options: UseCheckListHierarchyOptions,
): UseCheckListHierarchyResult {
  const { showArchived = false, createdBy, mintGroup } = options;
  const g = useRowboat();

  const allFolders = useSelect(() => topLevelFolders(g), arraysEqualById);
  const folders = useMemo(
    () => (showArchived ? allFolders : allFolders.filter((f) => !f.archived)),
    [allFolders, showArchived],
  );

  const addFolder = useCallback(
    async (name: string, parentId: string | null, type: string): Promise<FolderRow> => {
      if (!mintGroup) {
        throw new Error('useCheckListHierarchy.addFolder: no mintGroup configured');
      }
      const parentGroupId = parentId ? opFindById(g, parentId)?.owner_group_id : undefined;
      const ownerGroupId = await mintGroup(parentGroupId);
      return opAddFolder(g, {
        id: crypto.randomUUID(),
        name,
        parentId,
        type,
        ownerGroupId,
        createdBy,
        now: Date.now(),
      });
    },
    [g, mintGroup, createdBy],
  );

  const renameNode = useCallback(
    (id: string, name: string) => opRenameNode(g, id, name, Date.now()),
    [g],
  );

  const archiveNode = useCallback((id: string) => setArchived(g, id, true, Date.now()), [g]);
  const unarchiveNode = useCallback((id: string) => setArchived(g, id, false, Date.now()), [g]);

  const deleteNode = useCallback((id: string) => opDeleteNode(g, id), [g]);

  const moveNode = useCallback(
    (id: string, newParentId: string | null) => opMoveNode(g, id, newParentId, Date.now()),
    [g],
  );

  const moveNodeToIndex = useCallback(
    (id: string, newParentId: string | null, _index: number) =>
      opMoveNode(g, id, newParentId, Date.now()),
    [g],
  );

  const generateUniqueName = useCallback(
    (baseName: string, parentId: string | null) => opGenerateUniqueName(g, baseName, parentId),
    [g],
  );

  const findById = useCallback((id: string) => opFindById(g, id), [g]);
  const childrenOfCb = useCallback((parentId: string | null) => childrenOf(g, parentId), [g]);

  const canCreate = useCallback(() => true, []);

  // TODO(slice-2): trash/template/items/account-wipe. See UseCheckListHierarchyResult.
  const emptyTrash = useCallback(async () => {}, []);
  const duplicateTemplate = useCallback((_id: string) => undefined, []);
  const getAllTemplateFolders = useCallback(() => [] as FolderRow[], []);
  const deleteAllUserData = useCallback(async () => {}, []);

  return {
    folders,
    allFolders,
    addFolder,
    renameNode,
    archiveNode,
    unarchiveNode,
    deleteNode,
    moveNode,
    moveNodeToIndex,
    generateUniqueName,
    findById,
    childrenOf: childrenOfCb,
    canCreate,
    archivedFolders: [],
    emptyTrash,
    duplicateTemplate,
    getAllTemplateFolders,
    deleteAllUserData,
  };
}

/**
 * Shared `useSelect` equality check for `FolderRow[]` snapshots (id + updated_at shallow
 * compare). Also used directly by `TreeView` (which reads the whole table, not just
 * top-level folders) — every `useSelect` selector that maps/filters into a new array MUST
 * pass an `isEqual`, or `useSyncExternalStore`'s default `Object.is` never matches a
 * freshly-mapped array and the render loops forever (`getSnapshot should be cached`).
 */
export function arraysEqualById(a: FolderRow[], b: FolderRow[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].id !== b[i].id || a[i].updated_at !== b[i].updated_at) return false;
  }
  return true;
}

/** Predicate helpers kept for parity with the jazz-backed hook's module exports. */
export function isTemplateFolder(folder: FolderRow): boolean {
  return folder.type === 'template-folder';
}

export function isOrganizationalFolder(folder: FolderRow): boolean {
  return folder.type === 'folder';
}

/**
 * Local minimal replacements for the jazz-backed hook's error classes (there's no
 * `@jbroll/rowboat-*` equivalent). Neither is thrown by this slice's hook today —
 * `moveNode`/`g.folder.move` already hard-errors (a plain `Error`) on a cycle, and there is
 * no item-limit/billing check in slice 1 (see `canCreate`, which is a permissive `() => true`
 * stub pending the billing port). Kept as real subclasses, not aliases, so out-of-scope call
 * sites that still do `instanceof ItemLimitExceededError` / read `.maxItems` type-check and
 * behave correctly once those checks are ported in a later slice.
 */
export class CircularReferenceError extends Error {
  constructor(message = 'Cannot move a folder into its own descendant') {
    super(message);
    this.name = 'CircularReferenceError';
  }
}

export class ItemLimitExceededError extends Error {
  readonly maxItems: number;
  constructor(maxItems: number, message = `List limit of ${maxItems} reached`) {
    super(message);
    this.name = 'ItemLimitExceededError';
    this.maxItems = maxItems;
  }
}
