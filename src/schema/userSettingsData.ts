/**
 * Parse boundary for a `UserSettings` row's `rb.json` columns — the same string-round-trip
 * contract as `./folderData.ts`'s `parseFolderRow` (see that file's header for the full
 * rationale), applied to `view_folder_expanded` / `view_template_category_expanded` /
 * `view_session_category_expanded` instead of the `Folder` table's json columns.
 *
 * Reading these three columns raw off `$data` silently type-mismatches (indexing a JSON string
 * with a non-numeric key returns `undefined`, no crash) rather than throwing, but it still
 * produces the wrong values — and every caller downstream that falls back to `?? {}` on that
 * `undefined` mints a fresh object each read, which breaks `useSelect` snapshot identity and
 * infinite-loops the subscriber (see `SessionView.tsx`'s `templateCategoryExpanded` selector).
 */
import type { UserSettingsRow } from '../../shared/schema.js';

function parseJsonColumn<T>(value: unknown, fallbackWhenNullish: T): T {
  if (typeof value === 'string') return JSON.parse(value) as T;
  return (value as T | null | undefined) ?? fallbackWhenNullish;
}

/**
 * Parse a raw `UserSettingsRow`'s json columns (`view_folder_expanded`/
 * `view_template_category_expanded`/`view_session_category_expanded`) for reading.
 */
export function parseUserSettingsRow(row: UserSettingsRow): UserSettingsRow {
  return {
    ...row,
    view_folder_expanded: parseJsonColumn(row.view_folder_expanded, {}),
    view_template_category_expanded: parseJsonColumn(row.view_template_category_expanded, {}),
    view_session_category_expanded: parseJsonColumn(row.view_session_category_expanded, {}),
  };
}
