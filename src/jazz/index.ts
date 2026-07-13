/**
 * rowboat runtime narrow-waist.
 *
 * Replaces the old Jazz waist (`co`/`Group`/`JazzReactProvider`/`useAccount`/etc. from
 * `jazz-tools`) now that the folder hierarchy is ported to rowboat (see
 * `src/schema/folder.ts`, `src/lib/jazz.tsx`). App code that needs the graph, auth, or the
 * provider imports it from here rather than reaching into `@jbroll/rowboat-*` /
 * `@jbroll/rowboat-auth-betterauth-react` directly, so a future rename/replacement touches
 * this one module, not the tree.
 *
 * Out-of-scope UI (items/session/template/billing/sharing — see
 * `docs/superpowers/d-t4-report.md`) still imports Jazz CoValue types (`FolderNode`,
 * `Account`, etc.) directly from `jazz-tools` / `src/schema/index.ts`, which this waist no
 * longer re-exports; those files are out of slice-1 scope and excluded from `tsc --noEmit`
 * (see `tsconfig.json`).
 */

// better-auth session/identity hooks + actions, used by AuthGate.
export {
  signIn,
  signOut,
  useAuthor,
  useSession,
} from '@jbroll/rowboat-auth-betterauth-react';
// The rowboat provider + sync loop + anon-claim wiring.
export { JazzProvider, usePort, useRowboat, useSelect } from '@/lib/jazz';
