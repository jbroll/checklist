/**
 * `orderedList` handles bound to a folder's `items`/`sessions` columns (rb.ordered / D1). `read()`
 * resolves the raw keyed map from `$data` — a JSON string in the real store, an object in tests.
 */
import {
  fracKey,
  type OrderedElement,
  type OrderedListHandle,
  orderedList,
} from '@jbroll/rowboat-client';
import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { schema } from '@/schema/folder';

type Graph = RelationalGraph<typeof schema>;

/** Build the rb.ordered keyed-map storage form from an ordered array, minting a fracKey per element. */
export function toOrderedMap<T extends { id: string }>(
  items: T[],
): Record<string, T & { __order: string }> {
  const map: Record<string, T & { __order: string }> = {};
  let prev: string | undefined;
  for (const item of items) {
    prev = fracKey.between(prev, undefined);
    map[item.id] = { ...item, __order: prev };
  }
  return map;
}

function rawMap(value: unknown): Record<string, OrderedElement> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, OrderedElement>;
  return (value as Record<string, OrderedElement> | null | undefined) ?? {};
}

function handle(g: Graph, folderId: string, path: 'items' | 'sessions'): OrderedListHandle {
  return orderedList({
    path,
    key: 'id',
    read: () => rawMap((g.folder(folderId)?.$data as Record<string, unknown> | undefined)?.[path]),
    update: (changes) => g.folder.update(folderId, { ...changes, updated_at: Date.now() }),
  });
}

export const itemsList = (g: Graph, folderId: string): OrderedListHandle =>
  handle(g, folderId, 'items');

export const sessionsList = (g: Graph, folderId: string): OrderedListHandle =>
  handle(g, folderId, 'sessions');
