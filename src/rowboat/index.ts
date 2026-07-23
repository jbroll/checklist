/**
 * rowboat runtime narrow-waist.
 *
 * The folder hierarchy lives in rowboat (see
 * `src/schema/folder.ts`, `src/lib/rowboat.tsx`). App code that needs the graph, auth, or the
 * provider imports it from here rather than reaching into `@jbroll/rowboat-*` /
 * `@jbroll/rowboat-auth-betterauth-react` directly, so a future rename/replacement touches
 * this one module, not the tree.
 */

// better-auth session/identity hooks + actions, used by AuthGate.
export {
  signIn,
  signOut,
  useAuthor,
  useSession,
} from '@jbroll/rowboat-auth-betterauth-react';
// The rowboat provider + sync loop + anon-claim wiring.
export { RowboatProvider, usePort, useRowboat, useSelect } from '@/lib/rowboat';
