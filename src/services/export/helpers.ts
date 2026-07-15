/**
 * Shared helper functions for export operations
 */

import type { FolderRow, SessionData } from '../../schema/folder';

/**
 * Find a session by ID within a template's sessions.
 * Returns null if the session is not found.
 */
export function findSessionById(template: FolderRow, sessionId: string): SessionData | null {
  return template.sessions.find((s) => s?.id === sessionId) ?? null;
}
