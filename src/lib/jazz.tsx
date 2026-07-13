/**
 * The rowboat provider + sync loop + anon-claim wiring for CheckList (slice 1, folders-only).
 *
 * Replaces the old Jazz `JazzReactProvider`/`AuthProvider` pair. `@jbroll/rowboat-react`'s
 * `createRowboat(schema)` factory (used by an earlier version of `src/schema/folder.ts`)
 * deliberately keeps its `RowboatDb` instance private — it's an app-scoped singleton the
 * factory builds and never exposes (see that package's `factory.ts`: "App-scoped singletons
 * ... are created ONCE ... deliberately NEVER torn down"). But `syncWithServer` needs that
 * exact `RowboatDb` (pushing/pulling through a *different* connection to the same IndexedDB
 * database would write real data, but wouldn't notify the graph's own `ChangeEmitter` — the
 * UI would silently go stale after every sync). So this module builds the db itself (via the
 * lower-level `buildRowboatDb`/`storeName` from `@jbroll/rowboat-client`) and binds the graph
 * with the lower-level `useRowboat(schema, db)` hook, keeping both the graph and the db in one
 * place so the sync loop and the UI share the identical `RowboatDb` instance.
 *
 * `key={identity}` on `RowboatBridge` forces a full remount (fresh db + graph) when the
 * effective identity flips between `ANON_IDENTITY` and a real author id — the same "swap the
 * whole subtree" pattern `RowboatConfig`'s per-identity `storeName` implies.
 */

import { useAnonClaim, useAuthor } from '@jbroll/rowboat-auth-betterauth-react';
import {
  ANON_IDENTITY,
  buildRowboatDb,
  type RowboatDb,
  storeName,
  syncWithServer,
} from '@jbroll/rowboat-client';
import { useRowboat as useRawRowboat, useSelect as useRawSelect } from '@jbroll/rowboat-react';
import { compileSchema, type RelationalGraph } from '@jbroll/rowboat-schema';
import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef } from 'react';
import { schema } from '@/schema/folder';

const APP_NAME = 'checklist';
const SYNC_INTERVAL_MS = 5000;

const manifest = compileSchema(schema).manifest;

const dbOptions = { indexedDB: window.indexedDB, IDBKeyRange: window.IDBKeyRange };

interface PortContextValue {
  graph: RelationalGraph<typeof schema>;
  /** better-auth user id, or `null` when anonymous / not yet resolved. */
  author: string | null;
  /**
   * Mints a fresh owner_group_id for a new folder — see `backend/src/index.ts`'s
   * `POST /api/folders/group` route. Injected here (rather than hardcoded into
   * `useCheckListHierarchy`) because minting talks to the server, which is an app-layer
   * concern, not something the headless hierarchy hook should know about.
   */
  mintGroup: (parentGroupId?: string) => Promise<string>;
}

const PortContext = createContext<PortContextValue | null>(null);

function mintGroup(parentGroupId?: string): Promise<string> {
  return fetch('/api/folders/group', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentGroup: parentGroupId }),
  })
    .then((r) => r.json())
    .then((j) => j.groupId);
}

function RowboatBridge({
  identity,
  author,
  children,
}: {
  identity: string;
  author: string | null;
  children: ReactNode;
}) {
  // One RowboatDb per identity, kept for the life of this (keyed) subtree.
  const dbRef = useRef<RowboatDb | null>(null);
  if (!dbRef.current) {
    dbRef.current = buildRowboatDb(
      storeName(APP_NAME, identity),
      manifest,
      [],
      undefined,
      dbOptions,
    );
  }
  const db = dbRef.current;

  useEffect(() => {
    return () => {
      db.close();
    };
  }, [db]);

  const graph = useRawRowboat(schema, db);

  // Drive push/pull on an interval while signed in. Anonymous users never sync — there is no
  // server-side scope group for the anon identity, so a sync attempt would have nothing valid
  // to push against.
  useEffect(() => {
    if (!author) return;
    let cancelled = false;
    const run = () => {
      void syncWithServer({
        db,
        apiBase: '/api/sync',
        author,
        fetchFn: (input, init) => fetch(input, { ...init, credentials: 'include' }),
      }).catch((err) => {
        console.error('[jazz] syncWithServer failed:', err);
      });
    };
    run();
    const id = window.setInterval(() => {
      if (!cancelled) run();
    }, SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [db, author]);

  const value = useMemo<PortContextValue>(() => ({ graph, author, mintGroup }), [graph, author]);

  return <PortContext.Provider value={value}>{children}</PortContext.Provider>;
}

export function JazzProvider({ children }: { children: ReactNode }) {
  const author = useAuthor();
  const identity = author ?? ANON_IDENTITY;

  // Claims the anon store into the authenticated identity's store on login. The `key` below
  // remounts `RowboatBridge` (fresh db + graph) once `author` flips, so the claimed rows show
  // up without any extra wiring here.
  useAnonClaim({
    app: APP_NAME,
    tables: manifest,
    options: dbOptions,
    onError: (err) => {
      console.error('[jazz] useAnonClaim failed:', err);
    },
  });

  return (
    <RowboatBridge key={identity} identity={identity} author={author}>
      {children}
    </RowboatBridge>
  );
}

/** The bound graph — must be used inside `<JazzProvider>`. */
export function useRowboat(): RelationalGraph<typeof schema> {
  const ctx = useContext(PortContext);
  if (!ctx) throw new Error('useRowboat() must be used inside <JazzProvider>');
  return ctx.graph;
}

/** Reactive slice of the graph — same signature as the old `createRowboat`-bound `useSelect`. */
export function useSelect<T>(selector: () => T, isEqual?: (a: T, b: T) => boolean): T {
  return useRawSelect(useRowboat(), selector, isEqual);
}

/** The port-specific bits `useCheckListHierarchy` needs that the graph itself doesn't carry. */
export function usePort(): { author: string | null; mintGroup: PortContextValue['mintGroup'] } {
  const ctx = useContext(PortContext);
  if (!ctx) throw new Error('usePort() must be used inside <JazzProvider>');
  return { author: ctx.author, mintGroup: ctx.mintGroup };
}
