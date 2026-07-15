/**
 * Session-retention cleanup (rowboat): archives sessions older than the tier's
 * `session_retention_days` (-1 = unlimited), throttled once/24h via localStorage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { storageKey } from '@/lib/brand';
import { parseFolderRow } from '@/schema/folderData';
import { makeGraph } from '@/test/rowboat';
import { cleanupExpiredSessions, shouldRunCleanup } from './sessionCleanupService';
import * as subscriptionService from './subscriptionService';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

const session = (id: string, createdAt: number) => ({
  id,
  itemStates: {},
  archived: false,
  categoryExpanded: {},
  viewMode: 'zone-in-hierarchy',
  selectedCount: 0,
  checkedCount: 0,
  remainingCount: 0,
  createdAt,
  lastActivityAt: createdAt,
});

const seed = (sessions: ReturnType<typeof session>[]) =>
  makeGraph({
    folder: [
      { id: 't1', type: 'template-folder', items: {}, sessions, default_items: {} } as never,
    ],
  });

const sessionsOf = (g: ReturnType<typeof makeGraph>) =>
  parseFolderRow(g.folder('t1')!.$data).sessions;

describe('cleanupExpiredSessions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  it('archives sessions older than the retention window, leaving fresh ones', async () => {
    vi.spyOn(subscriptionService, 'getSessionRetentionDays').mockReturnValue(30);
    const g = seed([session('old', NOW - 40 * DAY), session('fresh', NOW - 1 * DAY)]);

    const count = await cleanupExpiredSessions(g);

    expect(count).toBe(1);
    const byId = Object.fromEntries(sessionsOf(g).map((s) => [s.id, s.archived]));
    expect(byId.old).toBe(true);
    expect(byId.fresh).toBe(false);
  });

  it('is a no-op under unlimited retention (-1)', async () => {
    vi.spyOn(subscriptionService, 'getSessionRetentionDays').mockReturnValue(-1);
    const g = seed([session('old', NOW - 999 * DAY)]);

    expect(await cleanupExpiredSessions(g)).toBe(0);
    expect(sessionsOf(g)[0].archived).toBe(false);
  });

  it('shouldRunCleanup throttles to once per 24h', () => {
    const key = storageKey('session_cleanup_last');
    expect(shouldRunCleanup()).toBe(true);
    localStorage.setItem(key, String(NOW - 1 * DAY - 1));
    expect(shouldRunCleanup()).toBe(true);
    localStorage.setItem(key, String(NOW - 1000));
    expect(shouldRunCleanup()).toBe(false);
  });
});
