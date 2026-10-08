import { describe, expect, it } from 'vitest';
import type { ItemState, SessionData, TemplateItem } from '../schema/folder';
import { getSessionDuration, isSessionComplete } from './sessionStats';

const MIN = 60_000;

function makeItem(id: string, overrides: Partial<TemplateItem> = {}): TemplateItem {
  return {
    id,
    name: id,
    type: 'item',
    path: id,
    expanded: false,
    sortOrder: 0,
    archived: false,
    defaultQuantity: '',
    createdAt: 0,
    ...overrides,
  };
}

function makeSession(
  itemStates: Record<string, ItemState> = {},
  overrides: Partial<SessionData> = {},
): SessionData {
  return {
    id: 'session-1',
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode: 'flat',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: 0,
    lastActivityAt: 0,
    ...overrides,
  };
}

const checkedAt = (ms: number): ItemState => ({ selected: true, checked: true, checkedAt: ms });

describe('getSessionDuration', () => {
  const items = ['a', 'b', 'c'].map((id) => makeItem(id));

  it('spans the earliest to the latest checkedAt', () => {
    const session = makeSession({
      a: checkedAt(10 * MIN),
      b: checkedAt(25 * MIN),
      c: checkedAt(17 * MIN),
    });
    expect(getSessionDuration(session, items)).toBe(15 * MIN);
  });

  it('is null with fewer than two checked times', () => {
    expect(getSessionDuration(makeSession(), items)).toBeNull();
    expect(getSessionDuration(makeSession({ a: checkedAt(10 * MIN) }), items)).toBeNull();
  });

  it('ignores states that are not checked', () => {
    const session = makeSession({
      a: checkedAt(10 * MIN),
      b: checkedAt(20 * MIN),
      c: { selected: true, checked: false, checkedAt: 90 * MIN },
    });
    expect(getSessionDuration(session, items)).toBe(10 * MIN);
  });

  it('ignores checked states without a checkedAt', () => {
    const session = makeSession({
      a: checkedAt(10 * MIN),
      b: { selected: true, checked: true },
    });
    expect(getSessionDuration(session, items)).toBeNull();
  });

  it('ignores archived items, categories and states with no template item', () => {
    const session = makeSession({
      a: checkedAt(10 * MIN),
      b: checkedAt(12 * MIN),
      archived: checkedAt(0),
      category: checkedAt(60 * MIN),
      orphan: checkedAt(120 * MIN),
    });
    const withExtras = [
      ...items,
      makeItem('archived', { archived: true }),
      makeItem('category', { type: 'category' }),
    ];
    expect(getSessionDuration(session, withExtras)).toBe(2 * MIN);
  });
});

describe('isSessionComplete', () => {
  it('is complete when something is checked and nothing is left selected', () => {
    expect(isSessionComplete(makeSession({}, { checkedCount: 3, selectedCount: 0 }))).toBe(true);
  });

  it('is incomplete while items are still selected', () => {
    expect(isSessionComplete(makeSession({}, { checkedCount: 3, selectedCount: 1 }))).toBe(false);
  });

  it('is incomplete when nothing has been checked', () => {
    expect(isSessionComplete(makeSession({}, { checkedCount: 0, selectedCount: 0 }))).toBe(false);
  });
});
