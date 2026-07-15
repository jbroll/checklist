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
import { type OrderedElement, orderedToArray } from '@jbroll/rowboat-client';
import type { FolderRow, RawFolderRow, SessionData, TemplateItem } from './folder.js';

function parseJsonColumn<T>(value: unknown, fallbackWhenNullish: T): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  // Not a string: either already-parsed (test store) or nullish (never persisted yet).
  return (value as T | null | undefined) ?? fallbackWhenNullish;
}

/**
 * Coerce an `rb.bool` column back to a real JS boolean. The rowboat client stores booleans as
 * numeric 0/1 (better-sqlite3 can't bind a JS boolean — the write-side counterpart of this), so a
 * row read back out of the real IndexedDB store carries `archived`/`expanded`/… as 0/1, while the
 * unit-test `reactiveArrayStore` holds them as true/false. Consumers compare strictly
 * (`archived === false`), so normalize both shapes here at the read boundary.
 */
export function coerceBool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

/**
 * Parse a raw `FolderRow`'s json columns (`items`/`sessions`/`default_items`) and coerce its
 * `rb.bool` columns to real booleans for reading.
 */
export function parseFolderRow(row: RawFolderRow): FolderRow {
  const itemMap = parseJsonColumn<Record<string, OrderedElement>>(row.items as unknown, {});
  const sessionMap = parseJsonColumn<Record<string, OrderedElement>>(row.sessions as unknown, {});
  return {
    ...(row as unknown as FolderRow),
    items: orderedToArray(itemMap) as unknown as TemplateItem[],
    sessions: orderedToArray(sessionMap) as unknown as SessionData[],
    default_items: parseJsonColumn(row.default_items as unknown, {}),
    archived: coerceBool(row.archived),
    expanded: coerceBool(row.expanded),
    show_zone_headings: coerceBool(row.show_zone_headings),
    auto_categorize_enabled: coerceBool(row.auto_categorize_enabled),
  };
}
