/**
 * Parse boundary for a `Folder` row's `rb.json` columns.
 *
 * The real rowboat client stores `rb.json` columns as JSON STRINGS on the row (`db-crud.ts`
 * `JSON.stringify`s them on create/update, and `applyPull` does the same on pull) — the row that
 * comes back out of `g.folder(id).$data` / `g.folder.all()[i].$data` therefore has `items`/
 * `sessions`/`default_items` as strings, not arrays/objects. Every read site in this app expects
 * the parsed shape (`folder.sessions.filter(...)`, `template.items.map(...)`, etc.), so every
 * such read MUST go through this parse boundary first — reading `$data` directly and touching
 * these columns without parsing is the bug this file exists to prevent (see docs/status.md).
 *
 * The unit-test store (`reactiveArrayStore` from `@jbroll/rowboat-schema`, via `src/test/
 * rowboat.ts`) seeds/holds these columns as already-parsed arrays/objects to mirror what a test
 * author naturally writes as seed data — `makeGraph` stringifies them before they reach the
 * store (see that file), but tolerating an already-parsed value here too means this function
 * behaves identically regardless of which store shape it's handed.
 */
import type { FolderRow } from './folder.js';

function parseJsonColumn<T>(value: unknown, fallbackWhenNullish: T): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  // Not a string: either already-parsed (test store) or nullish (never persisted yet).
  return (value as T | null | undefined) ?? fallbackWhenNullish;
}

/** Parse a raw `FolderRow`'s json columns (`items`/`sessions`/`default_items`) for reading. */
export function parseFolderRow(row: FolderRow): FolderRow {
  return {
    ...row,
    items: parseJsonColumn(row.items, []),
    sessions: parseJsonColumn(row.sessions, []),
    default_items: parseJsonColumn(row.default_items, {}),
  };
}
