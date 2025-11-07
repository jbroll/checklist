import { type ClassValue, clsx } from 'clsx';
import type { InstanceOfSchema } from 'jazz-tools';
import { twMerge } from 'tailwind-merge';
import type { ShoppingSession } from '@/schemas/tree';

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

  return date.toLocaleDateString();
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
  const now = new Date();

  // Reset hours for day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((today.getTime() - sessionDay.getTime()) / (1000 * 60 * 60 * 24));

  // Today
  if (diffDays === 0) {
    const hours = date.getHours();
    const minutes = date.getMinutes();

    // If time is midnight (00:00) or showTime is false, just show "today"
    if (!showTime || (hours === 0 && minutes === 0)) {
      return 'today';
    }

    // Otherwise show "today @HH:MM"
    const timeStr = date
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
    return 'yesterday';
  }

  // Within last year - show MM/DD
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  if (date > oneYearAgo) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  // Older than a year - show full date
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  });
}

/**
 * Check if there are multiple sessions on the same day as the given session
 * Used to determine whether to show time in session display
 */
export function hasMultipleSessionsOnSameDay(
  session: InstanceOfSchema<typeof ShoppingSession> | null,
  allSessions: readonly (InstanceOfSchema<typeof ShoppingSession> | null)[],
): boolean {
  if (!session || !allSessions) return false;

  const sessionDate = session.startedAt;
  const sessionDay = new Date(
    sessionDate.getFullYear(),
    sessionDate.getMonth(),
    sessionDate.getDate(),
  );

  // Count sessions on the same day (excluding abandoned sessions)
  const sessionsOnSameDay = allSessions.filter((s) => {
    if (!s || s.status === 'abandoned') return false;
    const sDate = s.startedAt;
    const sDay = new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate());
    return sDay.getTime() === sessionDay.getTime();
  });

  return sessionsOnSameDay.length > 1;
}
