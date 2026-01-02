/**
 * CheckList Hooks
 *
 * Re-exports all custom hooks for the application.
 *
 * Pattern:
 * - React components: import { useCheckListHierarchy } from '@/hooks'
 * - Services: import * as folderService from '@/services/folderService'
 */

export type {
  UseCheckListHierarchyOptions,
  UseCheckListHierarchyResult,
} from './useCheckListHierarchy';
// Hierarchy management hook
// Standalone utility functions (re-exported from folderService)
export {
  ItemLimitExceededError,
  isOrganizationalFolder,
  isTemplateFolder,
  ListLimitExceededError,
  useCheckListHierarchy,
} from './useCheckListHierarchy';

// View state cleanup
export { useViewStateCleanup } from './useViewStateCleanup';
