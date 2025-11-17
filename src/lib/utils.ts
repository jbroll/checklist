import { type ClassValue, clsx } from 'clsx';
import { nanoid } from 'nanoid';
import { twMerge } from 'tailwind-merge';
import type { SessionData } from '@/schemas';

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
 * Format Date object for session display
 * - "today" for today without specific time (or with time if showTime is true)
 * - "today @11:54" for today with time (if showTime is true and not midnight)
 * - "yesterday" for yesterday
 * - "MM/DD" for dates within the last year
 * - Full date for older dates
 */
export function formatSessionDate(date: Date, showTime = true): string {
  // Ensure date is a Date object (Jazz may deserialize as string)
  const sessionDate = new Date(date);
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
    const timeStr = sessionDate
      .toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      .toLowerCase();
    return `today @${timeStr}`;
  }

  // Yesterday
  if (diffDays === 1) {
    if (showTime) {
      const timeStr = sessionDate
        .toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        .toLowerCase();
      return `yesterday @${timeStr}`;
    }
    return 'yesterday';
  }

  // Within last year - show MM/DD
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (sessionDate > oneYearAgo) {
    const dateStr = `${sessionDate.getMonth() + 1}/${sessionDate.getDate()}`;
    if (showTime) {
      const timeStr = sessionDate
        .toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
        .toLowerCase();
      return `${dateStr} @${timeStr}`;
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
    const timeStr = sessionDate
      .toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      .toLowerCase();
    return `${dateStr} @${timeStr}`;
  }
  return dateStr;
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

  // Check if there are multiple sessions on the same day
  const sessionDay = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());

  const sessionsOnSameDay = allSessions.filter((s) => {
    if (!s) return false;
    const sDate = s.createdAt;
    const sDay = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
    return sDay.getTime() === sessionDay.getTime();
  });

  // If multiple sessions on same day, include time
  if (sessionsOnSameDay.length > 1) {
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

  // Ensure createdAt is a Date object (Jazz may deserialize as string)
  const sessionDate = new Date(session.createdAt);
  const sessionDay = new Date(
    sessionDate.getFullYear(),
    sessionDate.getMonth(),
    sessionDate.getDate(),
  );

  // Count sessions on the same day
  const sessionsOnSameDay = allSessions.filter((s) => {
    if (!s) return false;
    const sDate = new Date(s.createdAt);
    const sDay = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
    return sDay.getTime() === sessionDay.getTime();
  });

  return sessionsOnSameDay.length > 1;
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
