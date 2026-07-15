/**
 * The folder list handles must lower every op to a FIELD-LEVEL dotted-path write (never a
 * whole-cell write), so concurrent edits merge via the engine's per-path LWW (rb.ordered / D1).
 */
import { describe, expect, it, vi } from 'vitest';
import { makeGraph } from '@/test/rowboat';
import { itemsList } from './folderListHandles';

const fresh = () =>
  makeGraph({
    folder: [
      { id: 'f', type: 'template-folder', items: {}, sessions: {}, default_items: {} } as never,
    ],
  });

describe('itemsList handle', () => {
  it('append lowers to a field-level dotted-path write on a new key', async () => {
    const g = fresh();
    const spy = vi.spyOn(g.folder, 'update');
    const items = itemsList(g, 'f');
    await items.append({ id: 'x', name: 'X' });
    const [, changes] = spy.mock.calls[0];
    expect(Object.keys(changes as object)).toContain('items.x'); // per-key, not whole "items"
    expect((changes as Record<string, unknown>)['items.x']).toMatchObject({
      id: 'x',
      __order: expect.any(String),
    });
  });

  it('toArray reads back appended elements in __order', async () => {
    const g = fresh();
    const items = itemsList(g, 'f');
    await items.append({ id: 'a', name: 'A' });
    await items.append({ id: 'b', name: 'B' });
    expect(items.toArray().map((e) => e.id)).toEqual(['a', 'b']);
  });
});
