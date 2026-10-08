import type { SessionData, TemplateItem } from '../schema/folder';

/**
 * Milliseconds from the first to the last check-off among the template's live leaf items, or null
 * when fewer than two of them carry a `checkedAt`.
 */
export function getSessionDuration(
  session: SessionData,
  items: readonly TemplateItem[],
): number | null {
  const times: number[] = [];
  for (const item of items) {
    if (item.archived || item.type !== 'item') continue;
    const state = session.itemStates[item.id];
    if (state?.checked && state.checkedAt !== undefined) times.push(state.checkedAt);
  }
  if (times.length < 2) return null;
  return Math.max(...times) - Math.min(...times);
}

export function isSessionComplete(session: SessionData): boolean {
  return session.checkedCount > 0 && session.selectedCount === 0;
}
