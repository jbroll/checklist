/**
 * Backend Jazz runtime narrow-waist.
 *
 * The ONLY non-schema backend module allowed to value-import from "jazz-tools"
 * (enforced by the org-hooks ts-jazz-waist gate over backend/src, which exempts
 * the jazz/ and schema/ directories). Backend code imports runtime values from
 * "./jazz"; types still come from "jazz-tools" directly. Subpaths such as
 * "jazz-tools/worker" and "jazz-tools/better-auth/..." are not bare and are
 * never flagged.
 */
export { Account, CoMap } from 'jazz-tools';
