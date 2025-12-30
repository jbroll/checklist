/**
 * Shared helper functions for export operations
 */

import type { InstanceOfSchema } from 'jazz-tools';
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

  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x sessions may be CoList or array
  const sessions: SessionData[] = Array.from(template.sessions as any);
  return sessions.find((s: SessionData) => s?.id === sessionId) ?? null;
}
