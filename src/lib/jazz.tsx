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
import { seedDefaultFolders } from '@/services/defaultData';
import { ensureUserSettings } from '@/services/subscriptionService';

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

// Authenticated mint: the server creates a scope group the caller admins. Anonymous users have
// no session (the route 401s) and never sync, so an anon folder gets a purely-local group id —
// its rows live in the anon store and are re-scoped to the user's group by adopt on sign-in (C2).
async function serverMintGroup(parentGroupId?: string): Promise<string> {
  const res = await fetch('/api/folders/group', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ parentGroup: parentGroupId }),
  });
  // NO FALLBACKS: a non-ok response (401 when signed out, 5xx) must surface, not
  // silently yield `undefined` and let a folder be created with no scope group.
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`mintGroup: POST /api/folders/group failed (${res.status}) ${body}`);
  }
  const { groupId } = (await res.json()) as { groupId?: unknown };
  if (typeof groupId !== 'string' || groupId.length === 0) {
    throw new Error(`mintGroup: response missing a groupId (${JSON.stringify(groupId)})`);
  }
  return groupId;
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

  // Debounced close: React StrictMode dev-mode double-invokes effects (mount -> cleanup ->
  // mount, synchronously, to surface unsafe cleanup) to simulate a remount. A synchronous
  // `db.close()` here would permanently close this singleton on the very first render — the
  // component function itself isn't re-invoked by that simulation, so nothing ever reopens it,
  // and every subsequent read/write (including `syncWithServer`) fails with a Dexie
  // `DatabaseClosedError` for the rest of the page's life. Deferring the close and letting the
  // immediate StrictMode remount cancel it (same pattern as any StrictMode-fragile resource
  // teardown) makes this correct in dev while still closing normally on a genuine unmount.
  const pendingCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (pendingCloseRef.current !== null) {
      clearTimeout(pendingCloseRef.current);
      pendingCloseRef.current = null;
    }
    return () => {
      pendingCloseRef.current = setTimeout(() => {
        db.close();
        pendingCloseRef.current = null;
      }, 0);
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

  // Anonymous users can't hit the auth-gated mint route — give them a local group id (adopt
  // re-scopes on sign-in). Signed-in users mint a server-side group they admin.
  const mintGroup = useMemo<PortContextValue['mintGroup']>(
    () => (author ? serverMintGroup : async () => crypto.randomUUID()),
    [author],
  );

  // Provision per-user starter data once this identity's store has hydrated. The check is
  // authoritative — it reads the persisted store DIRECTLY (`db.table`), because the in-memory
  // graph snapshot may not have loaded yet and a premature empty-read would create a duplicate.
  //   (1) The `user_settings` singleton (write paths hard-error without it). Deterministic
  //       id+group = the identity: for a signed-in user that's `user.id`, whose root scope group
  //       is also `user.id`, so the row converges across devices with no minted group. Anonymous
  //       users get a local, never-synced ANON_IDENTITY-scoped row.
  //   (2) For a GENUINELY NEW user (no pre-existing settings row), the default "Quick Errands"
  //       list — gating on settings-absence means we don't re-seed after the user deletes all
  //       their lists (an improvement over the Jazz `folders.length === 0` seed).
  const provisionedRef = useRef(false);
  useEffect(() => {
    if (provisionedRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const existingSettings = await db
          .table('user_settings')
          .filter((r: { __deleted?: boolean }) => !r.__deleted)
          .toArray();
        if (cancelled || provisionedRef.current) return;
        const isNewUser = existingSettings.length === 0;
        if (isNewUser) {
          await ensureUserSettings(graph, identity, identity);
          const existingFolders = await db
            .table('folder')
            .filter((r: { __deleted?: boolean }) => !r.__deleted)
            .toArray();
          if (cancelled) return;
          if (existingFolders.length === 0) {
            await seedDefaultFolders(graph, await mintGroup(), identity);
          }
        }
        provisionedRef.current = true;
      } catch (err) {
        console.error('[jazz] account-init provisioning failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, graph, identity, mintGroup]);

  const value = useMemo<PortContextValue>(
    () => ({ graph, author, mintGroup }),
    [graph, author, mintGroup],
  );

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
