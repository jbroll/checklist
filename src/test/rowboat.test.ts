/**
 * Test-store fidelity: the in-memory graph must merge dotted json-column writes into the stored
 * cell (mirroring the real client `applyChanges`/`deepSet`), so rb.ordered field-level writes
 * round-trip in unit tests. Without the shim, `reactiveArrayStore`'s shallow spread would store a
 * literal `"items.b"` column and leave the `items` cell untouched. See the rb.ordered adoption plan.
 */
import { describe, expect, it } from 'vitest';
import { makeGraph } from './rowboat';

// The test store keeps json columns as JSON strings; parse the raw cell to inspect the merge.
const cell = (
  g: ReturnType<typeof makeGraph>,
  col: 'items' | 'sessions',
): Record<string, unknown> => {
  const raw = (g.folder('f')?.$data as Record<string, unknown>)[col];
  return (typeof raw === 'string' ? JSON.parse(raw) : raw) as Record<string, unknown>;
};

describe('makeGraph dotted-path json merge', () => {
  it('merges a dotted json write into the existing cell (no clobber of siblings)', async () => {
    const g = makeGraph({
      folder: [
        {
          id: 'f',
          type: 'template-folder',
          items: { a: { id: 'a', __order: 'g' } },
          sessions: {},
          default_items: {},
        } as never,
      ],
    });
    await g.folder.update('f', { 'items.b': { id: 'b', __order: 'n' } });
    expect(Object.keys(cell(g, 'items')).sort()).toEqual(['a', 'b']); // 'a' survived, 'b' added
  });

  it('merges a deep dotted sub-path without dropping the element', async () => {
    const g = makeGraph({
      folder: [
        {
          id: 'f',
          type: 'template-folder',
          items: {},
          sessions: { s1: { id: 's1', __order: 'g', itemStates: { x: { checked: false } } } },
          default_items: {},
        } as never,
      ],
    });
    await g.folder.update('f', { 'sessions.s1.itemStates.x.checked': true });
    const s = cell(g, 'sessions').s1 as { itemStates: Record<string, { checked: boolean }> };
    expect(s.itemStates.x.checked).toBe(true);
  });
});
