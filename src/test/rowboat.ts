/**
 * rowboat test harness — in-memory graph + a `@/rowboat` stand-in for component tests.
 *
 * The real `@/rowboat` (`src/lib/rowboat.tsx`) reads its graph from a React context that
 * `RowboatProvider` populates by wiring a live IndexedDB-backed `RowboatDb` and a
 * `syncWithServer` interval — none of which exist (or should run) under jsdom. Rather than
 * fake that whole stack, component tests that need the graph do:
 *
 * ```ts
 * vi.mock('@/rowboat', async () => {
 *   const { rowboatJazzMock } = await import('@/test/rowboat');
 *   return rowboatJazzMock();
 * });
 * ```
 *
 * (the dynamic `import()` sidesteps `vi.mock` factory hoisting — a plain top-level import
 * used inside the factory body is not reliably available at the point the factory runs).
 *
 * `useRowboat()`/`useSelect()` in the mock read/subscribe to whatever graph
 * `renderWithRowboat` (or `setActiveGraph`) last activated; `useSelect` itself is the REAL
 * `@jbroll/rowboat-react` selector, so subscription/re-render behavior matches production —
 * only the context plumbing is faked.
 */
import { useSelect as useRawSelect } from '@jbroll/rowboat-react';
import {
  type RelationalGraph,
  type Row,
  reactiveArrayStore,
  relational,
} from '@jbroll/rowboat-schema';
import { deepSet } from '@jbroll/rowboat-shared';
import { type RenderResult, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';
import { schema } from '@/schema/folder';
import { toOrderedMap } from '@/services/folderListHandles';

type Graph = RelationalGraph<typeof schema>;

/** `folder` row json columns that the real rowboat client round-trips as JSON strings. */
const FOLDER_JSON_COLUMNS = ['items', 'sessions', 'default_items'] as const;

/**
 * Stringify a `folder` row's json columns to match the real client (`db-crud.ts` `JSON.stringify`s
 * them on create/update/pull). Test authors write seed rows with plain arrays/objects (`items:
 * [...]`) because that's the natural shape to write by hand; this converts them to the wire
 * representation before they reach `reactiveArrayStore`, so `$data` reads out of the graph come
 * back as strings — exercising `parseFolderRow` the same way production does — instead of silently
 * matching the unported bug where json columns were read as arrays directly.
 */
const ORDERED_COLUMNS = new Set(['items', 'sessions']);

function stringifyFolderJsonColumns(
  seed?: Record<string, Row[]>,
): Record<string, Row[]> | undefined {
  if (!seed?.folder) return seed;
  return {
    ...seed,
    folder: seed.folder.map((row) => {
      const stringified: Row = { ...row };
      for (const col of FOLDER_JSON_COLUMNS) {
        if (!(col in row)) continue;
        const value = row[col];
        const stored =
          ORDERED_COLUMNS.has(col) && Array.isArray(value)
            ? toOrderedMap(value as Array<{ id: string }>)
            : value;
        stringified[col] = JSON.stringify(stored);
      }
      return stringified;
    }),
  };
}

type TestStore = ReturnType<typeof reactiveArrayStore>;

/**
 * Deep-merge dotted json-column writes into the stored cell, mirroring the real client's
 * `applyChanges`. `reactiveArrayStore` only shallow-spreads, so without this a `{ 'items.b': … }`
 * write would land as a literal `"items.b"` column instead of merging into `items`.
 */
function withJsonPathMerge(store: TestStore): TestStore {
  const jsonCols = new Set<string>(FOLDER_JSON_COLUMNS);
  const mergeChanges = (
    table: string,
    id: string,
    changes: Record<string, unknown>,
  ): Record<string, unknown> => {
    const row = store.all(table).find((r) => r.id === id);
    const groups = new Map<string, Map<string, unknown>>();
    const plain: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(changes)) {
      const dot = key.indexOf('.');
      const col = dot === -1 ? key : key.slice(0, dot);
      if (dot !== -1 && jsonCols.has(col)) {
        if (!groups.has(col)) groups.set(col, new Map());
        groups.get(col)?.set(key.slice(dot + 1), value);
      } else if (dot === -1 && jsonCols.has(col) && value !== null && typeof value === 'object') {
        plain[col] = JSON.stringify(value);
      } else {
        plain[key] = value;
      }
    }
    for (const [col, paths] of groups) {
      const baseStr = plain[col] ?? row?.[col];
      const blob: Record<string, unknown> =
        typeof baseStr === 'string'
          ? (JSON.parse(baseStr) as Record<string, unknown>)
          : { ...((baseStr as Record<string, unknown> | undefined) ?? {}) };
      for (const [path, value] of paths) deepSet(blob, path, value);
      plain[col] = JSON.stringify(blob);
    }
    return plain;
  };
  return {
    ...store,
    update: (
      t: string,
      idOrItems: string | Array<{ id: string; changes: Record<string, unknown> }>,
      changes?: Record<string, unknown>,
    ): Promise<void> =>
      Array.isArray(idOrItems)
        ? store.update(
            t,
            idOrItems.map((it) => ({ id: it.id, changes: mergeChanges(t, it.id, it.changes) })),
          )
        : store.update(t, idOrItems, mergeChanges(t, idOrItems, changes ?? {})),
  };
}

/** A fresh in-memory graph over the folder schema, optionally pre-seeded. */
export function makeGraph(seed?: Record<string, Row[]>): Graph {
  return relational(
    schema,
    withJsonPathMerge(reactiveArrayStore(stringifyFolderJsonColumns(seed))),
  );
}

let activeGraph: Graph | null = null;

/**
 * Read by the `@/rowboat` mock's `useRowboat()`. Hard-errors if no test graph is active — a
 * component reaching for the graph without `renderWithRowboat`/`setActiveGraph` first is a
 * test bug, not something to paper over with an empty graph (NO FALLBACKS).
 */
export function getActiveGraph(): Graph {
  if (!activeGraph) {
    throw new Error(
      'No active rowboat test graph — call renderWithRowboat() or setActiveGraph() first',
    );
  }
  return activeGraph;
}

export function setActiveGraph(g: Graph): void {
  activeGraph = g;
}

export interface RenderWithRowboatOptions {
  seed?: Record<string, Row[]>;
}

/**
 * Render `ui` against a fresh in-memory graph. The test file must have mocked `@/rowboat` with
 * `rowboatJazzMock()` (see module doc) so the component's `useRowboat`/`useSelect` calls
 * resolve against this graph.
 */
export function renderWithRowboat(
  ui: ReactElement,
  options: RenderWithRowboatOptions = {},
): RenderResult & { graph: Graph } {
  const graph = makeGraph(options.seed);
  setActiveGraph(graph);
  return { graph, ...render(ui) };
}

export interface RowboatJazzMockOptions {
  /** better-auth user id `useAuthor()`/`usePort().author` report; `null` for anonymous. */
  author?: string | null;
  mintGroup?: (parentGroupId?: string) => Promise<string>;
}

/**
 * Body for `vi.mock('@/rowboat', ...)`. Defaults to a fixed authenticated test author and a
 * `mintGroup` stub that returns a deterministic group id — override per test via
 * `vi.mocked(usePort)`/`vi.mocked(useAuthor)` after importing, or pass `options` when the
 * default isn't suitable for a whole file.
 */
export function rowboatJazzMock(options: RowboatJazzMockOptions = {}) {
  const author = options.author ?? 'test-author';
  const mintGroup = options.mintGroup ?? (async () => 'test-group');

  return {
    useRowboat: () => getActiveGraph(),
    useSelect: <T>(selector: () => T, isEqual?: (a: T, b: T) => boolean) =>
      useRawSelect(getActiveGraph(), selector, isEqual),
    usePort: () => ({ author, mintGroup }),
    useAuthor: () => author,
    useSession: () => ({ isPending: false, data: author ? { user: { id: author } } : null }),
    signIn: { social: vi.fn() },
    signOut: vi.fn(),
    RowboatProvider: ({ children }: { children: ReactNode }) => children,
  };
}
