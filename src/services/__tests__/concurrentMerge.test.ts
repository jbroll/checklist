/**
 * D1 invariant: concurrent edits to DIFFERENT items in a session must both survive. rb.ordered's
 * field-level writes compose through the engine's per-path merge (proven at the rowboat integration
 * level); here we assert the checklist write paths feed that guarantee — each item-state change is a
 * single sub-path op (never a whole-cell rewrite), and two different-item checks compose.
 */
import { describe, expect, it, vi } from 'vitest';
import type { SessionData } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import { getSession, setItemChecked } from '../sessionService';

const session = (): SessionData => ({
  id: 's1',
  itemStates: {
    x: { selected: true, checked: false },
    y: { selected: true, checked: false },
  },
  archived: false,
  categoryExpanded: {},
  viewMode: 'zone-in-hierarchy',
  selectedCount: 2,
  checkedCount: 0,
  remainingCount: 0,
  createdAt: 0,
  lastActivityAt: 0,
});

const fresh = () =>
  makeGraph({
    folder: [
      {
        id: 'f',
        type: 'template-folder',
        items: [],
        sessions: [session()],
        default_items: {},
      } as never,
    ],
  });

describe('D1: concurrent checks on different items merge with no lost survivor', () => {
  it('two different-item checks both survive', async () => {
    const g = fresh();
    await setItemChecked(g, 'f', 's1', 'x', true);
    await setItemChecked(g, 'f', 's1', 'y', true);

    const s = getSession(g, 'f', 's1')!;
    expect(s.itemStates.x.checked).toBe(true);
    expect(s.itemStates.y.checked).toBe(true);
  });

  it('each item-state write is a single sub-path op, never a whole-cell write', async () => {
    const g = fresh();
    const spy = vi.spyOn(g.folder, 'update');
    await setItemChecked(g, 'f', 's1', 'x', true);

    const keys = spy.mock.calls.flatMap(([, c]) => Object.keys(c as object));
    expect(keys.some((k) => k.startsWith('sessions.s1.itemStates.x'))).toBe(true);
    expect(keys).not.toContain('sessions');
  });
});
