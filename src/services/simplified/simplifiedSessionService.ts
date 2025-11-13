import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, Template } from '@/schemas';
import * as sessionService from '@/services/sessionService';

/**
 * Get or create the current session for a template (Simplified UI)
 *
 * In simplified mode, we always work with the latest session.
 * If no session exists, we create one transparently.
 *
 * @param account - The user account
 * @param template - The template to get/create session for
 * @returns The current session ID
 */
export function getOrCreateCurrentSession(
  account: InstanceOfSchema<typeof Account>,
  template: InstanceOfSchema<typeof Template>,
): string {
  // Get all active sessions using service layer
  const sessions = sessionService.getSessions(account, template.$jazz.id);
  const activeSessions = sessions.filter((s) => !s.archived);

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

  // No session exists - create a new one using service layer
  return sessionService.createSession(account, template.$jazz.id);
}
