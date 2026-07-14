/**
 * Test Helpers — rowboat port (slice-2 e2e).
 *
 * Exposes the rowboat relational graph plus the ported, headless g-first services to
 * `window.testExports` (and its `window.__testServices` alias) so Playwright specs can seed
 * folders / templates / items / sessions. Only active under Playwright — the `__PLAYWRIGHT__`
 * flag is injected by `e2e/fixtures/base.ts`.
 *
 * Rewritten off Jazz: `exposeServicesToWindow` now takes the bound graph `g` (from
 * `useRowboat()` in `TestPage.tsx`) instead of a Jazz `Account`. Every exposed service is a
 * plain module whose functions take `g` as their first argument (see `folderOps.ts` et al).
 *
 * Folder groups: the real app mints an `owner_group_id` via the backend (POST
 * `/api/folders/group`, auth-only). The `/test` page runs on the ANONYMOUS identity (no sync —
 * see `src/lib/jazz.tsx`), so seeded folders get a synthesized local group id. That is correct
 * for local-only UI assertions (the anonymous identity never pushes to a server), NOT a
 * fallback papering over a real mint failure.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { isTemplateFolder } from '@/hooks';
import type { FolderRow, schema } from '@/schema/folder';
import * as folderOps from './folderOps';
import * as sessionService from './sessionService';
import * as subscriptionService from './subscriptionService';
import * as templateService from './templateService';
import * as userSettingsService from './userSettingsService';
import * as viewStateService from './viewStateService';

type Graph = RelationalGraph<typeof schema>;

/** Build the '/'-joined display path for a folder by walking its parent chain. */
function folderPath(g: Graph, id: string): string {
  const names: string[] = [];
  let cursor: string | null = id;
  while (cursor) {
    const row: FolderRow | undefined = folderOps.findById(g, cursor);
    if (!row) break;
    names.unshift(row.name);
    cursor = row.parent_id;
  }
  return names.join('/');
}

/** Resolve a '/'-joined display path to a folder id (searching by sibling names). */
function findIdByPath(g: Graph, path: string): string | null {
  const segments = path.split('/').filter((s) => s.length > 0);
  let parentId: string | null = null;
  for (const segment of segments) {
    const match: FolderRow | undefined = folderOps
      .childrenOf(g, parentId)
      .find((f) => f.name === segment);
    if (!match) return null;
    parentId = match.id;
  }
  return parentId;
}

interface DirectoryEntry {
  id: string;
  name: string;
  type: string;
  archived: boolean;
  path: string;
  parentId?: string;
}

/**
 * Legacy `directory` compatibility shim, re-expressed over `folderOps` + the graph. Folder
 * creation seeds a synthesized `owner_group_id` (see module header). Async where it writes —
 * callers must `await`.
 */
interface DirectoryShim {
  create: (
    name: string,
    isTemplate: boolean,
    parentPath?: string | null,
  ) => Promise<{ entryId: string; templateId?: string; path: string }>;
  get: (entryId: string) => DirectoryEntry | null;
  exists: (entryId: string) => boolean;
  getAll: () => Array<{ id: string; name: string; type: string; path: string }>;
  rename: (entryId: string, newName: string) => Promise<void>;
  archive: (entryId: string) => Promise<void>;
  unarchive: (entryId: string) => Promise<void>;
  delete: (entryId: string) => Promise<void>;
  move: (entryId: string, newParentId?: string | null) => Promise<void>;
  getPath: (entryId: string) => string;
}

export interface TestExports {
  /** The bound rowboat graph — seed rows directly via `g.folder.create(...)` etc. */
  g: Graph;
  folderOps: typeof folderOps;
  templateService: typeof templateService;
  sessionService: typeof sessionService;
  viewStateService: typeof viewStateService;
  userSettingsService: typeof userSettingsService;
  subscriptionService: typeof subscriptionService;
  directory: DirectoryShim;
}

declare global {
  interface Window {
    __PLAYWRIGHT__?: boolean;
    testExports?: TestExports;
    __testServices?: TestExports;
  }
}

/**
 * Expose the graph + ported services to `window` for E2E tests. No-op unless running under
 * Playwright (`__PLAYWRIGHT__`).
 */
export function exposeServicesToWindow(g: Graph): void {
  if (!window.__PLAYWRIGHT__) return;

  const directory: DirectoryShim = {
    create: async (name, isTemplate, parentPath) => {
      const parentId = parentPath ? findIdByPath(g, parentPath) : null;
      if (parentPath && parentId === null) {
        throw new Error(`Parent folder not found: ${parentPath}`);
      }
      const row = await folderOps.addFolder(g, {
        id: crypto.randomUUID(),
        name,
        parentId,
        type: isTemplate ? 'template-folder' : 'folder',
        ownerGroupId: crypto.randomUUID(),
        createdBy: 'test',
        now: Date.now(),
      });
      return {
        entryId: row.id,
        templateId: isTemplate ? row.id : undefined,
        path: folderPath(g, row.id),
      };
    },
    get: (entryId) => {
      const row = folderOps.findById(g, entryId);
      if (!row) return null;
      return {
        id: row.id,
        name: row.name,
        type: isTemplateFolder(row) ? 'template-ref' : 'folder',
        archived: row.archived,
        path: folderPath(g, entryId),
        parentId: row.parent_id ?? undefined,
      };
    },
    exists: (entryId) => {
      const row = folderOps.findById(g, entryId);
      return row != null && !row.archived;
    },
    getAll: () =>
      folderOps.topLevelFolders(g).map((f) => ({
        id: f.id,
        name: f.name,
        type: isTemplateFolder(f) ? 'template-ref' : 'folder',
        path: folderPath(g, f.id),
      })),
    rename: (entryId, newName) => folderOps.renameNode(g, entryId, newName, Date.now()),
    archive: (entryId) => folderOps.setArchived(g, entryId, true, Date.now()),
    unarchive: (entryId) => folderOps.setArchived(g, entryId, false, Date.now()),
    delete: (entryId) => folderOps.deleteNode(g, entryId),
    move: (entryId, newParentId) => folderOps.moveNode(g, entryId, newParentId ?? null, Date.now()),
    getPath: (entryId) => folderPath(g, entryId),
  };

  const services: TestExports = {
    g,
    folderOps,
    templateService,
    sessionService,
    viewStateService,
    userSettingsService,
    subscriptionService,
    directory,
  };

  window.testExports = services;
  window.__testServices = services;
}
