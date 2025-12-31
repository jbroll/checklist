/**
 * Shared helper functions for export operations
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { iterateSessions } from '../../lib/jazz-types';
import type { FolderNode, SessionData } from '../../schemas';

/**
 * Find a session by ID within a template's sessions
 *
 * @param template - FolderNode containing sessions
 * @param sessionId - ID of the session to find
 * @returns SessionData or null if not found
 */
export function findSessionById(
  template: InstanceOfSchema<typeof FolderNode>,
  sessionId: string,
): SessionData | null {
  if (!template.sessions) return null;

  const sessions = iterateSessions<SessionData>(template.sessions);
  return sessions.find((s: SessionData) => s?.id === sessionId) ?? null;
}
