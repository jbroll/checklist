/**
 * Read boundary for rb.ordered columns: `items`/`sessions` persist as keyed maps
 * `{ [id]: { ...el, __order, __deleted? } }` (JSON strings on the row); `parseFolderRow` must
 * surface them as plain arrays sorted by `__order`, tombstones filtered, reserved keys stripped.
 */
import { describe, expect, it } from 'vitest';
import type { RawFolderRow } from './folder';
import { parseFolderRow } from './folderData';

const rawItems = JSON.stringify({
  b: {
    id: 'b',
    name: 'Bananas',
    type: 'item',
    path: 'b',
    expanded: false,
    archived: false,
    defaultQuantity: '',
    createdAt: 1,
    __order: 'n',
  },
  a: {
    id: 'a',
    name: 'Apples',
    type: 'item',
    path: 'a',
    expanded: false,
    archived: false,
    defaultQuantity: '',
    createdAt: 1,
    __order: 'g',
  },
  z: {
    id: 'z',
    name: 'Gone',
    type: 'item',
    path: 'z',
    expanded: false,
    archived: false,
    defaultQuantity: '',
    createdAt: 1,
    __order: 'a',
    __deleted: true,
  },
});

describe('parseFolderRow ordered columns', () => {
  it('sorts items by __order, drops tombstones, strips reserved keys', () => {
    const row = {
      id: 'f',
      type: 'template-folder',
      items: rawItems,
      sessions: '{}',
      default_items: '{}',
      archived: 0,
      expanded: 0,
      show_zone_headings: 0,
      auto_categorize_enabled: 0,
    } as unknown as RawFolderRow;
    const parsed = parseFolderRow(row);
    expect(parsed.items.map((i) => i.id)).toEqual(['a', 'b']); // z tombstoned; a(g) < b(n)
    expect((parsed.items[0] as Record<string, unknown>).__order).toBeUndefined();
    expect(parsed.sessions).toEqual([]);
  });
});
