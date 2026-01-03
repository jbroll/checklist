/**
 * Session Cleanup Service
 *
 * Automatically archives (soft-deletes) shopping sessions older than the
 * retention period based on the user's subscription tier.
 *
 * Retention periods:
 * - Free: 30 days
 * - Premium: 365 days (1 year)
 * - Team/Enterprise: Unlimited (-1)
 */

import { walkTree } from '@jbr-jazz/hierarchy-shared';
import type { InstanceOfSchema } from 'jazz-tools';
import { isTemplateFolder } from '../hooks';
import { storageKey } from '../lib/brand';
import type { AccountParam, FolderNode, SessionData } from '../schemas';
import { getSessionRetentionDays } from './subscriptionService';

type FolderType = InstanceOfSchema<typeof FolderNode>;

/** Collect all template folders using jbr-jazz walkTree */
function getAllTemplateFolders(account: AccountParam): FolderType[] {
  if (!account?.root?.folders) return [];
  const templates: FolderType[] = [];
  walkTree([...account.root.folders] as FolderType[], (node) => {
    if (node.archived) return 'skip';
    if (isTemplateFolder(node)) templates.push(node);
  });
  return templates;
}

// Key for localStorage to track last cleanup time
const CLEANUP_KEY = storageKey('session_cleanup_last');
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check if cleanup should run (hasn't run in last 24 hours)
 */
export function shouldRunCleanup(): boolean {
  const lastCleanup = localStorage.getItem(CLEANUP_KEY);
  if (!lastCleanup) return true;

  const elapsed = Date.now() - parseInt(lastCleanup, 10);
  return elapsed > CLEANUP_INTERVAL_MS;
}

/**
 * Mark cleanup as having run
 */
function markCleanupRun(): void {
  localStorage.setItem(CLEANUP_KEY, Date.now().toString());
}

/**
 * Archive sessions older than the retention period
 *
 * @returns Number of sessions archived
 */
export function cleanupExpiredSessions(account: AccountParam): number {
  const retentionDays = getSessionRetentionDays(account);

  // Unlimited retention - nothing to clean up
  if (retentionDays === -1) {
    markCleanupRun();
    return 0;
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffTime = cutoffDate.getTime();

  let archivedCount = 0;

  // Get all template folders
  const templates = getAllTemplateFolders(account);

  for (const template of templates) {
    if (!template?.sessions) continue;

    // Iterate through sessions
    const sessions = Array.isArray(template.sessions)
      ? template.sessions
      : Array.from(template.sessions as Iterable<SessionData>);

    for (const session of sessions) {
      if (!session || session.archived) continue;

      // Check if session is older than retention period
      const createdAt =
        session.createdAt instanceof Date
          ? session.createdAt.getTime()
          : new Date(session.createdAt).getTime();

      if (createdAt < cutoffTime) {
        // Archive the session (soft delete)
        session.$jazz.set('archived', true);
        session.$jazz.set('archivedAt', new Date());
        archivedCount++;
      }
    }
  }

  markCleanupRun();

  if (import.meta.env.DEV && archivedCount > 0) {
    console.log(`[session-cleanup] Archived ${archivedCount} expired sessions`);
  }

  return archivedCount;
}

/**
 * Run cleanup if needed (called on app load)
 *
 * This is a non-blocking operation that runs in the background.
 */
export function runCleanupIfNeeded(account: AccountParam): void {
  if (!shouldRunCleanup()) return;

  // Run cleanup asynchronously to not block app startup
  setTimeout(() => {
    try {
      cleanupExpiredSessions(account);
    } catch (error) {
      if (import.meta.env.DEV) console.error('[session-cleanup] Error during cleanup:', error);
    }
  }, 5000); // Delay 5 seconds after app load
}

/**
 * Get the number of sessions that would be cleaned up
 * (for displaying in UI)
 */
export function getExpiredSessionCount(account: AccountParam): number {
  const retentionDays = getSessionRetentionDays(account);

  if (retentionDays === -1) return 0;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const cutoffTime = cutoffDate.getTime();

  let expiredCount = 0;

  const templates = getAllTemplateFolders(account);

  for (const template of templates) {
    if (!template?.sessions) continue;

    const sessions = Array.isArray(template.sessions)
      ? template.sessions
      : Array.from(template.sessions as Iterable<SessionData>);

    for (const session of sessions) {
      if (!session || session.archived) continue;

      const createdAt =
        session.createdAt instanceof Date
          ? session.createdAt.getTime()
          : new Date(session.createdAt).getTime();

      if (createdAt < cutoffTime) {
        expiredCount++;
      }
    }
  }

  return expiredCount;
}
