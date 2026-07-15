/**
 * Folder - rowboat rb.* table for the CheckList folder/template hierarchy.
 *
 * Replaces the Jazz `FolderNode` CoValue (see `./tree.ts`, kept for now — other code
 * still imports it). This table only carries the *hierarchy* row shape; items/sessions
 * for template folders are ported in a later slice.
 *
 * The table DEFINITION lives in `shared/schema.ts` (repo root) so the backend host
 * (`backend/src/index.ts`) can import the identical manifest without reaching outside its
 * own `tsconfig` rootDir — see that file's header comment. This module just re-exports it
 * under the app's usual `@/schema/folder` path.
 *
 * `RowboatProvider`/`useRowboat`/`useSelect` are NOT exported from here (unlike an earlier
 * version of this file) — the provider needs direct access to the underlying `RowboatDb` to
 * drive `syncWithServer` on an interval, and `@jbroll/rowboat-react`'s `createRowboat()`
 * factory deliberately keeps its db instance private (an app-scoped singleton, see that
 * package's `factory.ts`). So the graph is built and bound in `src/lib/jazz.tsx` instead,
 * using the lower-level `useRowboat(schema, db)` hook, which the app reaches through the
 * `@/jazz` waist. See `src/lib/jazz.tsx`'s header comment.
 */
export {
  Folder,
  type FolderRow,
  type ItemState,
  type RawFolderRow,
  type SessionData,
  schema,
  type TemplateItem,
} from '../../shared/schema.js';
