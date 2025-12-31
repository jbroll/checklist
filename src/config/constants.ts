/**
 * Centralized Application Constants
 *
 * Single source of truth for configuration values used throughout the application.
 * This prevents magic numbers and ensures consistency across the codebase.
 */

import type { SubscriptionTier } from '@/schemas';

// ============================================================================
// Subscription Tier Limits
// ============================================================================

/**
 * Tier limits for subscription tiers
 * - maxLists: Maximum number of template folders (-1 = unlimited)
 * - sessionRetentionDays: Days to retain inactive sessions (-1 = unlimited)
 */
export interface TierLimits {
  maxLists: number;
  sessionRetentionDays: number;
}

/**
 * Subscription tier limit configuration
 *
 * Tier Limits:
 * - Free: 3 lists, 7-day session history
 * - Plus ($9.99/yr): 30 lists, 30-day session history
 * - Premium ($19.99/yr): 300 lists, 1-year session history
 * - Enterprise: Unlimited (contact sales)
 */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: {
    maxLists: 3,
    sessionRetentionDays: 7,
  },
  plus: {
    maxLists: 30,
    sessionRetentionDays: 30,
  },
  premium: {
    maxLists: 300,
    sessionRetentionDays: 365, // 1 year
  },
  enterprise: {
    maxLists: -1, // Unlimited
    sessionRetentionDays: -1, // Unlimited
  },
} as const;

// ============================================================================
// Sync and Cleanup Intervals
// ============================================================================

/**
 * Interval constants for background sync and cleanup operations
 */
export const SYNC_INTERVALS = {
  /** How often to sync subscription data from backend (1 hour) */
  SUBSCRIPTION_SYNC_MS: 60 * 60 * 1000,

  /** How often to run session cleanup (24 hours) */
  SESSION_CLEANUP_MS: 24 * 60 * 60 * 1000,
} as const;

// ============================================================================
// Input Validation Limits
// ============================================================================

/**
 * Validation constants for user input
 */
export const VALIDATION = {
  /** Maximum length for authentication tokens */
  MAX_TOKEN_LENGTH: 128,

  /** Maximum length for email addresses (RFC 5321) */
  MAX_EMAIL_LENGTH: 254,

  /** Regex pattern for validating tokens */
  TOKEN_REGEX: /^[A-Za-z0-9_-]+$/,
} as const;
