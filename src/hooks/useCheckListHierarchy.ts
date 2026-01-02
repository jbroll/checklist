/**
 * useCheckListHierarchy - React hook wrapper around folderService
 *
 * This hook provides memoized folder operations for React components.
 * The underlying logic lives in folderService.ts as standalone functions
 * that can be used by non-React code (services, utilities).
 *
 * Pattern:
 * - folderService.ts = standalone functions (for services)
 * - useCheckListHierarchy = React hook wrapper (for components)
 *
 * @example
 * ```tsx
 * // In React components - use the hook
 * function MyComponent() {
 *   const { me } = useAccount(Account);
 *   const { addFolder, deleteFolder } = useCheckListHierarchy(me);
 *   // Functions are memoized and close over account
 * }
 *
 * // In services - use folderService directly
 * import * as folderService from '@/services/folderService';
 * folderService.createFolder(account, name, isTemplate, parent);
 * ```
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { useCallback, useMemo } from 'react';
import type { Account, FolderNode } from '../schemas';
import * as folderService from '../services/folderService';
import * as subscriptionService from '../services/subscriptionService';

type FolderType = InstanceOfSchema<typeof FolderNode>;
type AccountType = InstanceOfSchema<typeof Account>;

/**
 * Options for useCheckListHierarchy
 */
export interface UseCheckListHierarchyOptions {
  /** Whether to show archived folders in the folders list */
  showArchived?: boolean;
}

/**
 * Result from useCheckListHierarchy
 */
export interface UseCheckListHierarchyResult {
  // Query operations
  findById: (folderId: string) => FolderType | null;
  getAllTemplateFolders: () => FolderType[];
  archivedFolders: FolderType[];

  // CRUD operations
  addFolder: (name: string, parent?: FolderType, isTemplate?: boolean) => FolderType | null;
  renameNode: (folder: FolderType, newName: string) => void;
  deleteNode: (folder: FolderType) => void;
  duplicateTemplate: (folder: FolderType) => FolderType | null;

  // Archive operations
  archiveNode: (folder: FolderType) => void;
  unarchiveNode: (folder: FolderType) => void;
  emptyTrash: () => number;

  // Move operations
  moveNode: (folder: FolderType, newParent?: FolderType | null) => void;
  moveNodeToIndex: (
    folder: FolderType,
    newParent: FolderType | null | undefined,
    index: number,
  ) => void;

  // Utilities
  generateUniqueName: (baseName: string, parent?: FolderType | null) => string;
  deleteAllUserData: () => void;

  // Subscription info (from subscriptionService)
  canCreate: boolean;
  maxItems: number;
}

/**
 * useCheckListHierarchy - React hook for folder hierarchy management
 *
 * Wraps folderService functions with useCallback for React optimization.
 * All operations close over the account parameter so callers don't need to pass it.
 *
 * @param account - The user's account (must have root loaded)
 * @param options - Additional options
 */
export function useCheckListHierarchy(
  account: AccountType | null | undefined,
  options: UseCheckListHierarchyOptions = {},
): UseCheckListHierarchyResult {
  const { showArchived = false } = options;

  // Subscription info
  const canCreate = account ? subscriptionService.canCreateList(account) : false;
  const maxItems = account ? subscriptionService.getMaxLists(account) : 0;

  // Query operations
  const findById = useCallback(
    (folderId: string): FolderType | null => {
      if (!account) return null;
      return folderService.findFolderById(account, folderId);
    },
    [account],
  );

  const getAllTemplateFolders = useCallback((): FolderType[] => {
    if (!account) return [];
    return folderService.getAllTemplateFolders(account, showArchived);
  }, [account, showArchived]);

  const archivedFolders = useMemo((): FolderType[] => {
    if (!account) return [];
    return folderService.getArchivedFolders(account);
  }, [account]);

  // CRUD operations
  const addFolder = useCallback(
    (name: string, parent?: FolderType, isTemplate = true): FolderType | null => {
      if (!account) return null;
      return folderService.createFolder(account, name, isTemplate, parent);
    },
    [account],
  );

  const renameNode = useCallback((folder: FolderType, newName: string): void => {
    folderService.renameFolder(folder, newName);
  }, []);

  const deleteNode = useCallback(
    (folder: FolderType): void => {
      if (!account) return;
      folderService.deleteFolder(account, folder);
    },
    [account],
  );

  const duplicateTemplate = useCallback(
    (folder: FolderType): FolderType | null => {
      if (!account) return null;
      return folderService.duplicateTemplate(account, folder);
    },
    [account],
  );

  // Archive operations
  const archiveNode = useCallback((folder: FolderType): void => {
    folderService.archiveFolder(folder);
  }, []);

  const unarchiveNode = useCallback((folder: FolderType): void => {
    folderService.unarchiveFolder(folder);
  }, []);

  const emptyTrash = useCallback((): number => {
    if (!account) return 0;
    return folderService.emptyTrash(account);
  }, [account]);

  // Move operations
  const moveNode = useCallback(
    (folder: FolderType, newParent?: FolderType | null): void => {
      if (!account) return;
      folderService.moveFolder(account, folder, newParent);
    },
    [account],
  );

  const moveNodeToIndex = useCallback(
    (folder: FolderType, newParent: FolderType | null | undefined, index: number): void => {
      if (!account) return;
      folderService.moveFolderToIndex(account, folder, newParent, index);
    },
    [account],
  );

  // Utilities
  const generateUniqueName = useCallback(
    (baseName: string, parent?: FolderType | null): string => {
      if (!account) return baseName;
      return folderService.generateUniqueFolderName(baseName, account, parent);
    },
    [account],
  );

  const deleteAllUserData = useCallback((): void => {
    if (!account) return;
    folderService.deleteAllUserData(account);
  }, [account]);

  return {
    // Query
    findById,
    getAllTemplateFolders,
    archivedFolders,
    // CRUD
    addFolder,
    renameNode,
    deleteNode,
    duplicateTemplate,
    // Archive
    archiveNode,
    unarchiveNode,
    emptyTrash,
    // Move
    moveNode,
    moveNodeToIndex,
    // Utilities
    generateUniqueName,
    deleteAllUserData,
    // Subscription
    canCreate,
    maxItems,
  };
}

// Re-export standalone functions for convenience
// Components can import from @/hooks, services import from @/services/folderService
// Re-export as ItemLimitExceededError for jbr-jazz compatibility
export {
  isOrganizationalFolder,
  isTemplateFolder,
  ListLimitExceededError,
  ListLimitExceededError as ItemLimitExceededError,
} from '../services/folderService';
