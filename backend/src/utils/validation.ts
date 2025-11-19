import { z } from 'zod';

/**
 * Email validation regex (RFC 5322 simplified)
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * E.164 phone number format: +[country][number]
 * Examples: +12125551234, +442071234567
 */
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Check if string is an email address
 */
export function isEmail(identifier: string): boolean {
  return EMAIL_REGEX.test(identifier);
}

/**
 * Check if string is a phone number in E.164 format
 */
export function isPhone(identifier: string): boolean {
  return PHONE_REGEX.test(identifier);
}

/**
 * Normalize identifier (lowercase emails, trim whitespace)
 *
 * @param identifier - Email or phone number
 * @returns Normalized identifier
 * @throws Error if identifier is invalid format
 */
export function normalizeIdentifier(identifier: string): string {
  const trimmed = identifier.trim();

  if (isEmail(trimmed)) {
    return trimmed.toLowerCase(); // Emails are case-insensitive
  }

  if (isPhone(trimmed)) {
    return trimmed; // Phone already normalized (E.164)
  }

  throw new Error(
    'Invalid identifier: must be email or phone number in E.164 format (+1234567890)'
  );
}

/**
 * Validate recipient identifier matches session user
 *
 * Auto-detects email vs phone and compares against correct field.
 *
 * @param inviteIdentifier - Identifier from invite
 * @param sessionUser - User object from BetterAuth session
 * @returns true if match, throws error if mismatch or not verified
 */
export function validateRecipientMatch(
  inviteIdentifier: string,
  sessionUser: {
    email?: string;
    phone?: string;
    email_verified?: boolean;
    phone_verified?: boolean;
  }
): boolean {
  if (isEmail(inviteIdentifier)) {
    // Check email verification
    if (!sessionUser.email_verified) {
      throw new Error('Email not verified by OAuth provider');
    }

    // Compare emails (case-insensitive)
    if (sessionUser.email?.toLowerCase() !== inviteIdentifier.toLowerCase()) {
      throw new Error(
        `This invite was sent to ${inviteIdentifier}, but you're logged in as ${sessionUser.email}`
      );
    }

    return true;
  }

  if (isPhone(inviteIdentifier)) {
    // Check phone verification
    if (!sessionUser.phone_verified) {
      throw new Error('Phone number not verified by OAuth provider');
    }

    // Compare phone numbers (exact match)
    if (sessionUser.phone !== inviteIdentifier) {
      throw new Error(
        `This invite was sent to ${inviteIdentifier}, but you're logged in with ${sessionUser.phone}`
      );
    }

    return true;
  }

  throw new Error('Invalid identifier format');
}

/**
 * Zod schema for permission level
 */
export const PermissionLevelSchema = z.enum(['view', 'edit', 'admin']);

export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

/**
 * Zod schema for invite generation request
 */
export const InviteRequestSchema = z.object({
  folderId: z.string().min(1, 'Folder ID is required'),
  recipientIdentifiers: z
    .array(z.string())
    .min(1, 'At least one recipient is required')
    .max(10, 'Maximum 10 recipients per request'),
  permissionLevel: PermissionLevelSchema,
  expiresInDays: z.number().int().min(1).max(365).nullable(),
  message: z.string().max(500).optional(),
});

/**
 * Zod schema for invite acceptance request
 */
export const AcceptInviteRequestSchema = z.object({
  token: z.string().length(64, 'Invalid token format'),
});

/**
 * Zod schema for permission update request
 */
export const UpdatePermissionRequestSchema = z.object({
  permission: PermissionLevelSchema,
});
