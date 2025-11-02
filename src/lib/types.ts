/**
 * Type utilities for working with Jazz CoValues and strict TypeScript settings
 */

import type { CoList } from 'jazz-tools';

/**
 * NonNullableCoList - Helper type to strip null from CoList elements
 * Use this when you know a CoList should never have null elements
 * despite Jazz's type inference adding | null with exactOptionalPropertyTypes
 */
export type NonNullableCoList<T> = CoList<NonNullable<T>>;

/**
 * Helper to assert that a CoList doesn't contain null elements
 * Use when you know the list was properly initialized
 */
export function assertNonNullableList<T>(_list: CoList<T>): asserts _list is NonNullableCoList<T> {
  // No runtime check needed - this is a type assertion only
}
