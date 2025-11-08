/**
 * Helper functions for creating import result objects
 *
 * Reduces duplication in error handling across import services.
 */

import type { ImportResult } from './types';

/**
 * Creates an error ImportResult with standardized structure
 *
 * @param error - Error message or Error object
 * @param warnings - Optional warning messages
 * @returns ImportResult with success=false
 */
export function createErrorResult(error: string | Error, warnings: string[] = []): ImportResult {
  const errorMessage = error instanceof Error ? error.message : error;

  return {
    success: false,
    errors: [errorMessage],
    warnings,
    stats: {},
  };
}

/**
 * Creates a success ImportResult with provided stats
 *
 * @param stats - Statistics about the import operation
 * @param warnings - Optional warning messages
 * @param data - Optional additional data about created entities
 * @returns ImportResult with success=true
 */
export function createSuccessResult(
  stats: ImportResult['stats'],
  warnings: string[] = [],
  data?: ImportResult['data'],
): ImportResult {
  return {
    success: true,
    errors: [],
    warnings,
    stats,
    data,
  };
}
