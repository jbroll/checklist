import type { InstanceOfSchema } from 'jazz-tools';
import type { Session, Template } from '@/schemas';
import { Session as SessionSchema } from '@/schemas';

/**
 * Get or create the current session for a template (Simplified UI)
 *
 * In simplified mode, we always work with the latest session.
 * If no session exists, we create one transparently.
 *
 * @param template - The template to get/create session for
 * @returns The current session ID
 */
export function getOrCreateCurrentSession(template: InstanceOfSchema<typeof Template>): string {
  const sessions = template.sessions || [];

  // Filter out archived sessions
  const activeSessions = sessions.filter((s) => s && !s.archived);

  // Find latest session by createdAt
  if (activeSessions.length > 0) {
    const latestSession = activeSessions.reduce((latest, current) => {
      const latestTime = latest?.createdAt?.getTime() || 0;
      const currentTime = current?.createdAt?.getTime() || 0;
      return currentTime > latestTime ? current : latest;
    });

    if (latestSession?.$jazz?.id) {
      return latestSession.$jazz.id;
    }
  }

  // No session exists - create a new one
  const now = new Date();
  const newSession: InstanceOfSchema<typeof Session> = SessionSchema.create(
    {
      itemStates: {},
      archived: false,
      categoryExpanded: {},
      viewMode: 'zone-in-hierarchy' as const,
      selectedCount: 0,
      checkedCount: 0,
      remainingCount: 0,
      owner: template.owner,
      createdAt: now,
      lastActivityAt: now,
    },
    { owner: template.owner },
  );

  // @ts-expect-error Jazz v0.18.x TypeScript inference issue with CoList push
  template.sessions.push(newSession);
  template.$jazz.set('currentSessionId', newSession.$jazz.id);

  return newSession.$jazz.id;
}

/**
 * Clear all selected and checked flags in the current session (Simplified UI)
 * Resets the shopping trip without creating a new session
 *
 * @param template - The template containing the session
 * @param sessionId - The session to clear
 */
export function clearSessionState(
  template: InstanceOfSchema<typeof Template>,
  sessionId: string,
): void {
  const session = template.sessions?.find((s) => s?.$jazz.id === sessionId);

  if (!session) {
    return;
  }

  // Reset all item states
  const newItemStates: Record<string, { selected: boolean; checked: boolean }> = {};

  // Keep the structure but reset flags
  for (const itemId of Object.keys(session.itemStates || {})) {
    newItemStates[itemId] = {
      selected: false,
      checked: false,
    };
  }

  session.$jazz.set('itemStates', newItemStates);
  session.$jazz.set('selectedCount', 0);
  session.$jazz.set('checkedCount', 0);

  // Calculate remaining count (all non-archived items)
  const activeItems = template.items?.filter((item) => !item.archived) || [];
  session.$jazz.set('remainingCount', activeItems.length);

  session.$jazz.set('lastActivityAt', new Date());
}
