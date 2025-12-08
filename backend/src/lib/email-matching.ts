import type Database from 'better-sqlite3';

/**
 * Check if a user can access a share sent to a specific email.
 * Matches against:
 * 1. User's primary email
 * 2. Any verified (linked) emails
 */
export function canUserAccessShareEmail(
  db: Database.Database,
  userId: string,
  userPrimaryEmail: string,
  shareRecipientEmail: string
): boolean {
  // Check primary email first (fast path)
  if (userPrimaryEmail.toLowerCase() === shareRecipientEmail.toLowerCase()) {
    return true;
  }

  // Check verified emails
  const verified = db
    .prepare(
      `SELECT 1 FROM verified_email WHERE user_id = ? AND LOWER(email) = LOWER(?)`
    )
    .get(userId, shareRecipientEmail);

  return !!verified;
}

/**
 * Get all emails associated with a user (primary + verified).
 */
export function getAllUserEmails(
  db: Database.Database,
  userId: string,
  userPrimaryEmail: string
): string[] {
  const verified = db
    .prepare(`SELECT email FROM verified_email WHERE user_id = ?`)
    .all(userId) as { email: string }[];

  return [userPrimaryEmail, ...verified.map((v) => v.email)];
}
