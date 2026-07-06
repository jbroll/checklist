/**
 * Shared helper functions for export operations
 */

import { toArray } from '@jbr-jazz/hierarchy-shared';
import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, SessionData } from '../../schema';

/**
 * Find a session by ID within a template's sessions.
 * Returns null if the session is not found.
 */
export function findSessionById(
  template: InstanceOfSchema<typeof FolderNode>,
  sessionId: string,
): SessionData | null {
  if (!template.sessions) return null;

  const sessions = toArray<SessionData>(template.sessions);
  return sessions.find((s: SessionData) => s?.id === sessionId) ?? null;
}
