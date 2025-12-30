/**
 * Date utility functions
 *
 * Shared date formatting and conversion helpers used across the application.
 */

/**
 * Safely convert a Date or date string to ISO string
 * Handles both Date objects and ISO date strings from Jazz deserialization
 *
 * @param date - Date object or ISO date string
 * @returns ISO date string or undefined if input is undefined
 */
export function toISOString(date: Date | string | undefined): string | undefined {
  if (!date) return undefined;
  if (typeof date === 'string') return date;
  return date.toISOString();
}

/**
 * Safely convert a Date or date string to ISO string, returning empty string for undefined
 * Variant for contexts where empty string is preferred over undefined
 *
 * @param date - Date object or ISO date string
 * @returns ISO date string or empty string if input is undefined
 */
export function toISOStringOrEmpty(date: Date | string | undefined): string {
  if (!date) return '';
  if (typeof date === 'string') return date;
  return date.toISOString();
}

/**
 * Format a date's time portion in 12-hour format with lowercase am/pm
 *
 * @param date - Date object to format
 * @returns Time string like "11:54 am"
 */
export function formatTime(date: Date): string {
  return date
    .toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
    .toLowerCase();
}

/**
 * Get a date stamp suitable for filenames in YYYY-MM-DD format
 *
 * @param date - Date object (defaults to current date)
 * @returns Date string like "2025-12-30"
 */
export function getDateStampForFilename(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}
