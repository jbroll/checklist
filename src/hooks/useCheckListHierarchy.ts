/**
 * useCheckListHierarchy - CheckList-specific wrapper around jbr-jazz useHierarchy
 *
 * Provides folder hierarchy operations with CheckList-specific folder creation.
 * This hook integrates with CheckList's FolderNode schema and subscription system.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { me } = useAccount(Account);
 *   const { folders, addFolder, archiveNode } = useCheckListHierarchy(me);
 *
 *   const handleCreate = () => {
 *     addFolder('New List', undefined, true); // isTemplate = true
 *   };
 * }
 * ```
 */

import {
  DEFAULT_TIER_LIMITS,
  type SubscriptionStatus,
  type SubscriptionTier,
} from '@jbr-jazz/billing-shared';
import { type UseHierarchyResult, useHierarchy } from '@jbr-jazz/hierarchy-client';
import { ItemLimitExceededError } from '@jbr-jazz/hierarchy-shared';
import type { InstanceOfSchema } from 'jazz-tools';
import { useCallback, useMemo } from 'react';
import { co, Group } from '@/jazz';
import { type Account, FolderNode } from '../schema';

type FolderType = InstanceOfSchema<typeof FolderNode>;
type AccountType = InstanceOfSchema<typeof Account>;

// Jazz root with folders list
interface CheckListRoot {
  folders?: FolderType[];
  viewState?: unknown;
  userSettings?: {
    subscriptionTier?: SubscriptionTier;
    subscriptionStatus?: SubscriptionStatus;
  };
}

/**
 * Options for useCheckListHierarchy
 */
export interface UseCheckListHierarchyOptions {
  /** Whether to show archived folders in the folders list */
  showArchived?: boolean;
}

/**
 * Result from useCheckListHierarchy - extends jbr-jazz useHierarchy result
 * with CheckList-specific operations
 */
export interface UseCheckListHierarchyResult
  extends Omit<UseHierarchyResult<FolderType>, 'addFolder' | 'duplicateNode'> {
  /**
   * Create a new folder (organizational or template)
   * @param name - Folder name
   * @param parent - Optional parent folder
   * @param isTemplate - If true, creates a template-folder with items/sessions (default: true)
   */
  addFolder: (name: string, parent?: FolderType, isTemplate?: boolean) => FolderType | null;

  /**
   * Duplicate a template folder with all items (no sessions)
   */
  duplicateTemplate: (folder: FolderType) => FolderType | null;

  /**
   * Get all template folders (for subscription counting)
   */
  getAllTemplateFolders: () => FolderType[];

  /**
   * Check if a folder is a template folder
   */
  isTemplateFolder: (folder: FolderType) => boolean;

  /**
   * Delete all user data (for account deletion)
   */
  deleteAllUserData: () => void;
}

/**
 * Create a Jazz Group for a new folder with proper permission inheritance
 */
function createFolderGroup(account: AccountType, parent: FolderType | undefined): Group {
  const folderGroup = Group.create({ owner: account });
  folderGroup.addMember(account, 'admin');

  if (parent) {
    const parentGroup = parent.$jazz.owner as Group;
    folderGroup.addMember(parentGroup);
  }

  return folderGroup;
}

/**
 * Create a new CheckList folder node
 */
function createFolderNode(
  name: string,
  account: AccountType,
  parent: FolderType | undefined,
  isTemplate: boolean,
): FolderType {
  const now = new Date();
  const folderGroup = createFolderGroup(account, parent);

  const baseData = {
    name,
    type: isTemplate ? 'template-folder' : 'folder',
    sharingMode: 'private' as const,
    expanded: !isTemplate,
    archived: false,
    createdBy: account.$jazz.id,
    createdAt: now,
    updatedAt: now,
    parent: parent || undefined,
    owner: account,
  };

  return isTemplate
    ? FolderNode.create(
        { ...baseData, items: [], sessions: [], showZoneHeadings: false },
        { owner: folderGroup },
      )
    : FolderNode.create(
        { ...baseData, children: co.list(FolderNode).create([], { owner: folderGroup }) },
        { owner: folderGroup },
      );
}

/**
 * Check if a folder is a template folder
 */
export function isTemplateFolder(folder: FolderType): boolean {
  return folder.type === 'template-folder' || folder.items !== undefined;
}

/**
 * Check if a folder is an organizational folder (has children)
 */
export function isOrganizationalFolder(folder: FolderType): boolean {
  return folder.type === 'folder' || folder.children !== undefined;
}

/**
 * Recursively collect all template folders
 */
function collectTemplateFolders(
  folders: (FolderType | null | undefined)[],
  showArchived = false,
): FolderType[] {
  const templates: FolderType[] = [];

  for (const folder of folders) {
    if (!folder) continue;
    if (!showArchived && folder.archived) continue;

    if (isTemplateFolder(folder)) {
      templates.push(folder);
    } else if (folder.children && Array.isArray(folder.children)) {
      templates.push(...collectTemplateFolders([...folder.children], showArchived));
    }
  }

  return templates;
}

/**
 * useCheckListHierarchy - CheckList-specific hierarchy management hook
 *
 * Wraps jbr-jazz's useHierarchy with CheckList-specific folder creation
 * and template management.
 *
 * @param account - The user's account (must have root loaded)
 * @param options - Additional options
 */
export function useCheckListHierarchy(
  account: AccountType | null | undefined,
  options: UseCheckListHierarchyOptions = {},
): UseCheckListHierarchyResult {
  const { showArchived = false } = options;

  // Get subscription tier from account settings
  const root = account?.root as CheckListRoot | undefined;
  const subscriptionTier = root?.userSettings?.subscriptionTier ?? 'free';

  // Compute limits from subscription tier
  const limits = useMemo(() => {
    const tierLimits = DEFAULT_TIER_LIMITS[subscriptionTier] ?? DEFAULT_TIER_LIMITS.free;
    return {
      maxItems: tierLimits.maxItems === -1 ? Infinity : tierLimits.maxItems,
    };
  }, [subscriptionTier]);

  // Create a stable createNode function for templates (default)
  const createNode = useCallback(
    (name: string, _owner: unknown, parent?: FolderType) => {
      if (!account) throw new Error('Account not loaded');
      return createFolderNode(name, account, parent, true); // Default to template
    },
    [account],
  );

  // Count only template folders for subscription limits (not organizational folders)
  const countNode = useMemo(() => {
    return (node: FolderType) => isTemplateFolder(node);
  }, []);

  // Check if creation is allowed given limits and current count
  const checkCanCreate = useCallback(
    (lim: { maxItems: number }, count: number) => lim.maxItems === Infinity || count < lim.maxItems,
    [],
  );

  // Call the base useHierarchy hook with type assertion for cross-package compatibility
  // biome-ignore lint/suspicious/noExplicitAny: Jazz type compatibility between packages
  const baseResult = useHierarchy<FolderType, any, { maxItems: number }>({
    root: root as unknown as { folders?: unknown },
    // biome-ignore lint/suspicious/noExplicitAny: Jazz type compatibility between packages
    owner: account as any,
    createNode,
    countNode,
    limits,
    checkCanCreate,
  });

  // Override addFolder to support isTemplate parameter
  const addFolder = useCallback(
    (name: string, parent?: FolderType, isTemplate = true): FolderType | null => {
      if (!account?.root?.folders) return null;

      // Check subscription limit only for template folders
      // jbr-jazz's canCreate uses our countNode predicate (isTemplateFolder)
      if (isTemplate && !baseResult.canCreate) {
        throw new ItemLimitExceededError(limits.maxItems);
      }

      const newFolder = createFolderNode(name, account, parent, isTemplate);

      if (parent?.children) {
        parent.children.$jazz.push(newFolder);
      } else {
        account.root.folders.$jazz.push(newFolder);
      }

      return newFolder;
    },
    [account, baseResult.canCreate, limits.maxItems],
  );

  // Duplicate template folder with deep copy of items
  const duplicateTemplate = useCallback(
    (folder: FolderType): FolderType | null => {
      if (!account?.root?.folders) return null;
      if (!isTemplateFolder(folder)) {
        throw new Error('Can only duplicate template folders');
      }

      const baseName = `${folder.name} (Copy)`;
      const uniqueName = baseResult.generateUniqueName(baseName, folder.parent);
      const now = new Date();
      const folderGroup = createFolderGroup(account, folder.parent);

      // Deep copy non-archived items with new IDs
      const copiedItems = (folder.items || [])
        .filter((item: { archived?: boolean } | null) => item && !item.archived)
        .map((item: NonNullable<(typeof folder.items)[number]>) => ({
          ...item,
          id: crypto.randomUUID(),
          createdAt: now,
        }));

      const duplicatedFolder = FolderNode.create(
        {
          name: uniqueName,
          type: 'template-folder',
          sharingMode: 'private' as const,
          expanded: false,
          archived: false,
          createdBy: account.$jazz.id,
          createdAt: now,
          updatedAt: now,
          items: copiedItems,
          sessions: [],
          showZoneHeadings: folder.showZoneHeadings ?? false,
          parent: folder.parent || undefined,
          owner: account,
        },
        { owner: folderGroup },
      );

      // Add to parent
      if (folder.parent?.children) {
        folder.parent.children.$jazz.push(duplicatedFolder);
      } else {
        account.root.folders.$jazz.push(duplicatedFolder);
      }

      return duplicatedFolder;
    },
    [account, baseResult.generateUniqueName],
  );

  // Get all template folders (for subscription counting, etc.)
  const getAllTemplateFolders = useCallback((): FolderType[] => {
    if (!account?.root?.folders) return [];
    return collectTemplateFolders([...account.root.folders], showArchived);
  }, [account, showArchived]);

  // Delete all user data
  const deleteAllUserData = useCallback(() => {
    if (!account?.root?.folders) return;

    while (account.root.folders.length > 0) {
      const folder = account.root.folders[0];
      if (folder) {
        try {
          baseResult.deleteNode(folder);
        } catch {
          // Force remove if delete fails
          try {
            account.root.folders.$jazz.splice(0, 1);
          } catch {
            break;
          }
        }
      } else {
        try {
          account.root.folders.$jazz.splice(0, 1);
        } catch {
          break;
        }
      }
    }
  }, [account, baseResult.deleteNode]);

  return {
    ...baseResult,
    addFolder,
    duplicateTemplate,
    getAllTemplateFolders,
    isTemplateFolder,
    deleteAllUserData,
  };
}

// Re-export error types for convenience
export { CircularReferenceError, ItemLimitExceededError } from '@jbr-jazz/hierarchy-shared';
