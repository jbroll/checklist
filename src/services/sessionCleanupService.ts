/**
 * Session Cleanup Service — auto-archives shopping sessions older than the user's subscription-tier
 * retention period (`session_retention_days`; -1 = unlimited). Throttled to once per 24h via
 * localStorage; runs non-blocking on app load.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import { storageKey } from '../lib/brand';
import type { schema } from '../schema/folder';
import { archiveSession } from './sessionService';
import { getSessionRetentionDays } from './subscriptionService';
import { getAllTemplates } from './templateService';

type Graph = RelationalGraph<typeof schema>;

const CLEANUP_KEY = storageKey('session_cleanup_last');
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldRunCleanup(): boolean {
  const last = localStorage.getItem(CLEANUP_KEY);
  if (!last) return true;
  return Date.now() - parseInt(last, 10) > CLEANUP_INTERVAL_MS;
}

function markCleanupRun(): void {
  localStorage.setItem(CLEANUP_KEY, Date.now().toString());
}

export async function cleanupExpiredSessions(g: Graph): Promise<number> {
  const retentionDays = getSessionRetentionDays(g);
  if (retentionDays === -1) {
    markCleanupRun();
    return 0;
  }

  const cutoff = Date.now() - retentionDays * CLEANUP_INTERVAL_MS;
  let archived = 0;
  for (const template of getAllTemplates(g)) {
    for (const session of template.sessions) {
      if (session.archived || session.createdAt >= cutoff) continue;
      await archiveSession(g, template.id, session.id);
      archived += 1;
    }
  }

  markCleanupRun();
  if (import.meta.env.DEV && archived > 0) {
    console.log(`[session-cleanup] Archived ${archived} expired sessions`);
  }
  return archived;
}

export function runCleanupIfNeeded(g: Graph): void {
  if (!shouldRunCleanup()) return;
  setTimeout(() => {
    cleanupExpiredSessions(g).catch((error) => {
      if (import.meta.env.DEV) console.error('[session-cleanup] Error during cleanup:', error);
    });
  }, 5000);
}
