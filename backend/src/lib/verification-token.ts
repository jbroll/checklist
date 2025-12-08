import { createHmac } from 'node:crypto';

export const TOKEN_EXPIRY_HOURS = 24;

export interface TokenPayload {
  userId: string;
  email: string;
  expiresAt: number;
}

/**
 * Creates a signed verification token for email verification.
 * Token format: base64url(payload).base64url(signature)
 */
export function createVerificationToken(
  userId: string,
  email: string,
  secret: string,
  expiresInHours: number = TOKEN_EXPIRY_HOURS
): string {
  if (!secret) throw new Error('Secret is required');

  const expiresAt = Math.floor(Date.now() / 1000) + expiresInHours * 60 * 60;
  const payload: TokenPayload = { userId, email, expiresAt };
  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadStr).toString('base64url');

  const signature = createHmac('sha256', secret).update(payloadBase64).digest('base64url');
  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies a signed token and returns the payload if valid.
 * Returns null if token is invalid, tampered, or expired.
 */
export function verifyToken(token: string, secret: string): TokenPayload | null {
  if (!secret || !token) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  const expectedSignature = createHmac('sha256', secret).update(payloadBase64).digest('base64url');

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) return null;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  if (mismatch !== 0) return null;

  try {
    const payloadStr = Buffer.from(payloadBase64, 'base64url').toString();
    const payload = JSON.parse(payloadStr) as TokenPayload;

    // Check expiry
    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt < now) return null;

    // Validate payload structure
    if (!payload.userId || !payload.email || typeof payload.expiresAt !== 'number') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
