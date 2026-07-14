/**
 * CheckList Hooks
 *
 * Re-exports all custom hooks for the application.
 */

export type {
  UseCheckListHierarchyOptions,
  UseCheckListHierarchyResult,
} from './useCheckListHierarchy';
// Hierarchy management
export {
  arraysEqualById,
  CircularReferenceError,
  ItemLimitExceededError,
  isOrganizationalFolder,
  isTemplateFolder,
  useCheckListHierarchy,
} from './useCheckListHierarchy';

// `useViewStateCleanup` is a Jazz-account hook (reads `account.root.viewState`) and is out of
// slice-2 scope — `viewStateService` is now rowboat-graph-based, so the hook no longer typechecks
// against it. It is excluded from `tsc` (see tsconfig) and re-wired in the component/hook slice;
// dropping the re-export keeps it out of the app's entry graph, matching the other excluded files.
