import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for invite generation
 *
 * Limit: 10 requests per minute per user
 * Prevents invite spam and abuse
 */
export const inviteGenerationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per window
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many invites created. Try again in 1 minute.',
  },
  standardHeaders: true, // Return rate limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  // Key by user ID (from auth middleware)
  keyGenerator: (req) => {
    const user = (req as any).user;
    return user?.id || req.ip || 'anonymous';
  },
});

/**
 * Rate limiter for token validation
 *
 * Limit: 20 requests per minute per IP
 * Prevents brute force token guessing
 */
export const tokenValidationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per window
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many validation requests. Try again in 1 minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key by IP address
  keyGenerator: (req) => req.ip || 'unknown',
});

/**
 * Rate limiter for invite acceptance
 *
 * Limit: 5 requests per minute per user
 * Prevents abuse of acceptance endpoint
 */
export const inviteAcceptanceLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per window
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many acceptance requests. Try again in 1 minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = (req as any).user;
    return user?.id || req.ip || 'anonymous';
  },
});

/**
 * Rate limiter for permission management
 *
 * Limit: 30 requests per minute per user
 * Allows frequent updates but prevents abuse
 */
export const permissionManagementLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per window
  message: {
    error: 'rate_limit_exceeded',
    message: 'Too many permission changes. Try again in 1 minute.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const user = (req as any).user;
    return user?.id || req.ip || 'anonymous';
  },
});
