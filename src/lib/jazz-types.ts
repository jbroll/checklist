/**
 * Jazz Type Utilities
 *
 * Type guards and helper functions for working with Jazz CoValues.
 * These utilities provide runtime type safety for Jazz's MaybeLoaded types
 * and help eliminate `as any` casts throughout the codebase.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, SessionData, SubscriptionTier } from '../schemas';

/**
 * Represents a potentially unloaded Jazz account.
 * Jazz's useAccount hook returns MaybeLoaded types that may have
 * undefined properties until data is loaded from the sync server.
 *
 * Use type guards before accessing properties to ensure type safety.
 */
export interface MaybeLoadedAccount {
  readonly $jazz?: {
    readonly id?: string;
    has(key: string): boolean;
  };
  readonly id?: string;
  readonly root?: {
    readonly folders?: unknown;
    readonly viewState?: unknown;
    readonly userSettings?: unknown;
  } | null;
}

/**
 * Type alias for a fully loaded account with all required properties.
 */
export type LoadedAccount = InstanceOfSchema<typeof Account>;

/**
 * Type guard to check if a Jazz account is fully loaded.
 *
 * When true, the account has:
 * - A valid id
 * - An initialized root object
 * - A folders list (may be empty, but exists)
 *
 * @example
 * ```typescript
 * const me = useAccount<typeof Account>();
 * if (!isAccountLoaded(me)) {
 *   return <LoadingSpinner />;
 * }
 * // me is now properly typed with all properties available
 * ```
 */
export function isAccountLoaded(
  account: MaybeLoadedAccount | null | undefined,
): account is LoadedAccount {
  return (
    account != null &&
    account.root != null &&
    account.root.folders != null &&
    account.$jazz?.id != null
  );
}

/**
 * Type guard to check if a value is iterable (like a CoList or Array).
 * Jazz CoLists implement the Iterable protocol, so this works for both
 * plain arrays and CoList types.
 *
 * @example
 * ```typescript
 * if (isIterableSessions<SessionData>(template.sessions)) {
 *   for (const session of template.sessions) {
 *     // session is properly typed as SessionData
 *   }
 * }
 * ```
 */
export function isIterableSessions<T>(sessions: unknown): sessions is Iterable<T> {
  return (
    sessions != null &&
    typeof sessions === 'object' &&
    Symbol.iterator in sessions &&
    typeof (sessions as Record<symbol, unknown>)[Symbol.iterator] === 'function'
  );
}

/**
 * Safely iterate over sessions regardless of their underlying type.
 * Handles CoList, plain arrays, and undefined/null values.
 *
 * This function eliminates the need for `as any` casts when iterating
 * over Jazz sessions which may be CoList or plain array types.
 *
 * @param sessions - Sessions from a template (may be CoList, array, or undefined)
 * @returns Array of sessions, or empty array if sessions is falsy
 *
 * @example
 * ```typescript
 * const sessionList = iterateSessions<SessionData>(template.sessions);
 * const activeSession = sessionList.find(s => s.id === sessionId);
 * ```
 */
export function iterateSessions<T = SessionData>(sessions: unknown): T[] {
  if (!sessions) return [];
  if (Array.isArray(sessions)) return sessions as T[];
  if (isIterableSessions<T>(sessions)) return Array.from(sessions);
  return [];
}

/**
 * Valid subscription tier values.
 */
const VALID_TIERS: readonly SubscriptionTier[] = ['free', 'plus', 'premium', 'enterprise'] as const;

/**
 * Type guard to check if a value is a valid subscription tier.
 *
 * @example
 * ```typescript
 * const tierValue = userSettings?.subscriptionTier;
 * if (isValidTier(tierValue)) {
 *   // tierValue is now typed as SubscriptionTier
 *   applyTierLimits(tierValue);
 * } else {
 *   // Default to free tier
 *   applyTierLimits('free');
 * }
 * ```
 */
export function isValidTier(value: unknown): value is SubscriptionTier {
  return typeof value === 'string' && VALID_TIERS.includes(value as SubscriptionTier);
}

/**
 * Get a valid subscription tier with a default fallback.
 * Useful when the tier may be undefined or invalid.
 *
 * @param value - Potentially invalid tier value
 * @param defaultTier - Fallback tier (defaults to 'free')
 * @returns Valid subscription tier
 *
 * @example
 * ```typescript
 * const tier = getValidTier(userSettings?.subscriptionTier);
 * // tier is guaranteed to be a valid SubscriptionTier
 * ```
 */
export function getValidTier(
  value: unknown,
  defaultTier: SubscriptionTier = 'free',
): SubscriptionTier {
  return isValidTier(value) ? value : defaultTier;
}

/**
 * Type guard to check if a root object has folders loaded.
 * This is a more granular check than isAccountLoaded for cases
 * where you only need to verify folders are available.
 */
export function hasLoadedFolders(
  root: MaybeLoadedAccount['root'],
): root is NonNullable<MaybeLoadedAccount['root']> & { folders: NonNullable<unknown> } {
  return root != null && root.folders != null;
}

/**
 * Type guard to check if a root object has viewState loaded.
 */
export function hasLoadedViewState(
  root: MaybeLoadedAccount['root'],
): root is NonNullable<MaybeLoadedAccount['root']> & { viewState: NonNullable<unknown> } {
  return root != null && root.viewState != null;
}

/**
 * Type guard to check if a root object has userSettings loaded.
 */
export function hasLoadedUserSettings(
  root: MaybeLoadedAccount['root'],
): root is NonNullable<MaybeLoadedAccount['root']> & { userSettings: NonNullable<unknown> } {
  return root != null && root.userSettings != null;
}
