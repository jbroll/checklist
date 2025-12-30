import { type ClassValue, clsx } from 'clsx';
import { nanoid } from 'nanoid';
import { twMerge } from 'tailwind-merge';
import type { SessionData } from '@/schemas';
import { formatTime } from '@/utils/dateUtils';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
  }

  return new Date(date).toLocaleDateString();
}

/**
 * Format date for session display
 * - "today" for today without specific time (or with time if showTime is true)
 * - "today @11:54" for today with time (if showTime is true and not midnight)
 * - "yesterday" for yesterday
 * - "MM/DD" for dates within the last year
 * - Full date for older dates
 *
 * @param date - Date object or ISO string (Jazz may deserialize dates as strings)
 */
export function formatSessionDate(date: Date | string, showTime = true): string {
  const sessionDate = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();

  // Reset hours for day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDay = new Date(
    sessionDate.getFullYear(),
    sessionDate.getMonth(),
    sessionDate.getDate(),
  );
  const diffDays = Math.floor((today.getTime() - sessionDay.getTime()) / (1000 * 60 * 60 * 24));

  // Today
  if (diffDays === 0) {
    const hours = sessionDate.getHours();
    const minutes = sessionDate.getMinutes();

    // If time is midnight (00:00) or showTime is false, just show "today"
    if (!showTime || (hours === 0 && minutes === 0)) {
      return 'today';
    }

    // Otherwise show "today @HH:MM"
    return `today @${formatTime(sessionDate)}`;
  }

  // Yesterday
  if (diffDays === 1) {
    if (showTime) {
      return `yesterday @${formatTime(sessionDate)}`;
    }
    return 'yesterday';
  }

  // Within last year - show MM/DD
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (sessionDate > oneYearAgo) {
    const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}`;
    if (showTime) {
      return `${dateStr} @${formatTime(sessionDate)}`;
    }
    return dateStr;
  }

  // Older than a year - show full date
  const dateStr = sessionDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
  if (showTime) {
    return `${dateStr} @${formatTime(sessionDate)}`;
  }
  return dateStr;
}

/**
 * Get the start of day (midnight) for a given date
 */
function getStartOfDay(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Count sessions that fall on the same day as the given date
 */
function countSessionsOnSameDay(
  date: Date | string,
  sessions: readonly (SessionData | null)[],
): number {
  const targetDay = getStartOfDay(date).getTime();
  return sessions.filter((s) => s && getStartOfDay(s.createdAt).getTime() === targetDay).length;
}

/**
 * Generate a session name from its creation timestamp
 * Format: "YYYY-MM-DD" or "YYYY-MM-DD HH:MM" if multiple sessions on same day
 *
 * @param createdAt - Session creation timestamp
 * @param allSessions - All sessions to check for same-day duplicates
 * @returns Session name string
 */
export function generateSessionName(
  createdAt: Date,
  allSessions?: readonly (SessionData | null)[],
): string {
  const dateStr = createdAt.toISOString().split('T')[0]; // YYYY-MM-DD

  // If no sessions list provided, just return date
  if (!allSessions) {
    return dateStr;
  }

  // If multiple sessions on same day, include time
  if (countSessionsOnSameDay(createdAt, allSessions) > 1) {
    const timeStr = createdAt.toTimeString().slice(0, 5); // HH:MM
    return `${dateStr} ${timeStr}`;
  }

  return dateStr;
}

/**
 * Check if there are multiple sessions on the same day as the given session
 * Used to determine whether to show time in session display
 */
export function hasMultipleSessionsOnSameDay(
  session: SessionData | null,
  allSessions: readonly (SessionData | null)[],
): boolean {
  if (!session || !allSessions) return false;
  return countSessionsOnSameDay(session.createdAt, allSessions) > 1;
}

/**
 * Generate a short, unique ID for items and directory entries
 * Uses nanoid with 10 characters for compact yet collision-resistant IDs
 *
 * Examples: "V1StGXR8_Z", "3q2W5e7R8t", "9YuHjI7kLp"
 *
 * Collision probability with 10 chars (~1% after 361 million IDs):
 * Safe for collaborative editing where multiple users create items simultaneously
 */
export function generateId(): string {
  return nanoid(10);
}
