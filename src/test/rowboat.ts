/**
 * rowboat test harness — in-memory graph + a `@/jazz` stand-in for component tests.
 *
 * The real `@/jazz` (`src/lib/jazz.tsx`) reads its graph from a React context that
 * `JazzProvider` populates by wiring a live IndexedDB-backed `RowboatDb` and a
 * `syncWithServer` interval — none of which exist (or should run) under jsdom. Rather than
 * fake that whole stack, component tests that need the graph do:
 *
 * ```ts
 * vi.mock('@/jazz', async () => {
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
import { type RenderResult, render } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { vi } from 'vitest';
import { schema } from '@/schema/folder';

type Graph = RelationalGraph<typeof schema>;

/** A fresh in-memory graph over the folder schema, optionally pre-seeded. */
export function makeGraph(seed?: Record<string, Row[]>): Graph {
  return relational(schema, reactiveArrayStore(seed));
}

let activeGraph: Graph | null = null;

/**
 * Read by the `@/jazz` mock's `useRowboat()`. Hard-errors if no test graph is active — a
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
 * Render `ui` against a fresh in-memory graph. The test file must have mocked `@/jazz` with
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
 * Body for `vi.mock('@/jazz', ...)`. Defaults to a fixed authenticated test author and a
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
    JazzProvider: ({ children }: { children: ReactNode }) => children,
  };
}
