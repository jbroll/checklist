import type { Request, Response, NextFunction } from 'express';
import { auth } from '../auth.js';
import { Errors } from '../utils/errors.js';

/**
 * Extended Request with authenticated user information
 */
export interface AuthenticatedRequest extends Request {
  user: {
    id: string; // BetterAuth user ID
    email?: string; // OAuth email
    phone?: string; // OAuth phone
    email_verified?: boolean;
    phone_verified?: boolean;
    jazzAccountId?: string; // Jazz account ID from BetterAuth DB
    oauthSub?: string; // OAuth subject (stable ID)
    oauthProvider?: string; // OAuth provider (google.com, apple.com)
  };
}

/**
 * Authentication middleware
 *
 * Verifies BetterAuth session and attaches user info to request.
 * Rejects requests without valid session.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Get session from BetterAuth
    const session = await auth.api.getSession({ headers: req.headers });

    if (!session?.user) {
      return Errors.unauthorized(res, 'Authentication required');
    }

    // TODO: Look up OAuth provider info from accounts table
    // For now, attach what we have from session
    (req as AuthenticatedRequest).user = {
      id: session.user.id,
      email: session.user.email,
      // phone: session.user.phone, // TODO: Check if BetterAuth provides this
      email_verified: session.user.emailVerified,
      // phone_verified: session.user.phoneVerified, // TODO: Check if BetterAuth provides this
      // jazzAccountId: session.user.jazzAccountId, // TODO: Check BetterAuth Jazz plugin field name
      // oauthSub: session.user.oauthSub, // TODO: Query accounts table
      // oauthProvider: session.user.oauthProvider, // TODO: Query accounts table
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return Errors.unauthorized(res, 'Invalid or expired session');
  }
}
