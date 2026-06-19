/**
 * Jazz runtime narrow-waist.
 *
 * The ONLY non-schema module allowed to value-import from "jazz-tools" /
 * "jazz-tools/react" (enforced by the org-hooks ts-jazz-waist gate, which
 * exempts src/jazz/** and src/schema/**). App code imports runtime values from
 * "@/jazz"; types still come from "jazz-tools" directly (type imports are
 * migration-cheap and allowed everywhere).
 */

// Core runtime values used by schema factories / services.
export { co, Group } from 'jazz-tools';

// React hooks + provider used across the app (re-exported through the waist so
// the eventual Jazz vNext migration touches this one module, not the tree).
export {
  JazzReactProvider,
  useAcceptInvite,
  useAccount,
  useCoState,
  useIsAuthenticated,
  useLogOut,
} from 'jazz-tools/react';
