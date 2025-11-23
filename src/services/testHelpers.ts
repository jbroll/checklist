/**
 * Test Helpers
 *
 * Exposes services to window for E2E testing.
 * Only imported in test environments.
 *
 * Rewritten for FolderNode hierarchy (folder migration).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, FolderNode, SessionData, TemplateItem } from '../schemas';
import * as ExportService from './export/exportService';
import * as FolderService from './folderService';
import { importJson } from './import/jsonImporter';
import type { TxtImportResult } from './import/txtImporter';
import { importItemsFromText } from './import/txtImporter';
import type { ImportResult } from './import/types';
import * as SessionService from './sessionService';
import * as ItemService from './templateService';

/**
 * Expose all services to window for E2E tests
 */
export function exposeServicesToWindow(
  getAccount: () => InstanceOfSchema<typeof Account> | null,
): void {
  // Only expose in development/test
  if (import.meta.env.PROD) return;

  // Helper to get account with error handling
  const withAccount = <T>(fn: (account: InstanceOfSchema<typeof Account>) => T): T => {
    const account = getAccount();
    if (!account) throw new Error('Account not initialized');
    return fn(account);
  };

  // Expose services
  const services = {
    // Direct account access for legacy tests
    get account() {
      return getAccount();
    },

    // Folder operations (replaces old directory service)
    folderService: {
      create: (name: string, isTemplate: boolean, parentFolderId?: string | null) =>
        withAccount((acc) => {
          const parent = parentFolderId ? findFolderById(acc, parentFolderId) : null;
          const folder = FolderService.createFolder(acc, name, isTemplate, parent);
          return {
            folderId: folder.$jazz.id,
            path: FolderService.getFolderDisplayPath(folder),
          };
        }),
      get: (folderId: string) => withAccount((acc) => findFolderById(acc, folderId)),
      getAll: () => withAccount((acc) => FolderService.getRootFolders(acc)),
      getAllTemplates: () => withAccount((acc) => FolderService.getAllTemplateFolders(acc)),
      rename: (folderId: string, newName: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, folderId);
          if (!folder) throw new Error(`Folder ${folderId} not found`);
          FolderService.renameFolder(folder, newName);
        }),
      archive: (folderId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, folderId);
          if (!folder) throw new Error(`Folder ${folderId} not found`);
          FolderService.archiveFolder(folder);
        }),
      unarchive: (folderId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, folderId);
          if (!folder) throw new Error(`Folder ${folderId} not found`);
          FolderService.unarchiveFolder(folder);
        }),
      delete: (folderId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, folderId);
          if (!folder) throw new Error(`Folder ${folderId} not found`);
          FolderService.deleteFolder(acc, folder);
        }),
      move: (folderId: string, newParentId?: string | null) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, folderId);
          if (!folder) throw new Error(`Folder ${folderId} not found`);
          const newParent = newParentId ? findFolderById(acc, newParentId) : null;
          FolderService.moveFolder(acc, folder, newParent);
        }),
      exists: (folderId: string) => withAccount((acc) => findFolderById(acc, folderId) !== null),
    },

    // Legacy directory API for E2E test compatibility
    directory: {
      create: (name: string, isTemplate: boolean, parentPath?: string | null) =>
        withAccount((acc) => {
          // Convert path to parent folder
          let parent: InstanceOfSchema<typeof FolderNode> | null = null;
          if (parentPath) {
            const segments = parentPath.split('/').filter((s) => s.length > 0);
            parent = FolderService.findFolderByPath(acc, segments);
            if (!parent) {
              throw new Error(`Parent folder not found: ${parentPath}`);
            }
          }

          const folder = FolderService.createFolder(acc, name, isTemplate, parent);
          return {
            entryId: folder.$jazz.id,
            templateId: isTemplate ? folder.$jazz.id : undefined,
            path: FolderService.getFolderDisplayPath(folder),
          };
        }),
      get: (entryId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, entryId);
          if (!folder) return null;
          return {
            id: folder.$jazz.id,
            name: folder.name,
            type: FolderService.isTemplateFolder(folder) ? 'template-ref' : 'folder',
            archived: folder.archived || false,
            path: FolderService.getFolderDisplayPath(folder),
          };
        }),
      exists: (entryId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, entryId);
          // Archived folders are considered non-existent
          return folder !== null && !folder.archived;
        }),
      getAll: () =>
        withAccount((acc) => {
          const folders = FolderService.getRootFolders(acc);
          return folders.map((f) => ({
            id: f.$jazz.id,
            name: f.name,
            type: FolderService.isTemplateFolder(f) ? 'template-ref' : 'folder',
            path: FolderService.getFolderDisplayPath(f),
          }));
        }),
      rename: (entryId: string, newName: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, entryId);
          if (!folder) throw new Error(`Folder ${entryId} not found`);
          FolderService.renameFolder(folder, newName);
        }),
      archive: (entryId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, entryId);
          if (!folder) throw new Error(`Folder ${entryId} not found`);
          FolderService.archiveFolder(folder);
        }),
      unarchive: (entryId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, entryId);
          if (!folder) throw new Error(`Folder ${entryId} not found`);
          FolderService.unarchiveFolder(folder);
        }),
      delete: (entryId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, entryId);
          if (!folder) throw new Error(`Folder ${entryId} not found`);
          FolderService.deleteFolder(acc, folder);
        }),
    },

    // Legacy directoryService for backwards compatibility with E2E tests
    directoryService: {
      createDirectoryEntry: (
        account: InstanceOfSchema<typeof Account>,
        name: string,
        isTemplate: boolean,
        parentPath?: string | null,
      ) => {
        // Convert path to parent folder
        let parent: InstanceOfSchema<typeof FolderNode> | null = null;
        if (parentPath) {
          const segments = parentPath.split('/').filter((s) => s.length > 0);
          parent = FolderService.findFolderByPath(account, segments);
          if (!parent) {
            throw new Error(`Parent folder not found: ${parentPath}`);
          }
        }

        const folder = FolderService.createFolder(account, name, isTemplate, parent);
        return {
          entryId: folder.$jazz.id,
          templateId: isTemplate ? folder.$jazz.id : undefined,
          path: FolderService.getFolderDisplayPath(folder),
        };
      },
    },

    // Template operations (now works with FolderNodes that are templates)
    templateService: {
      get: (templateId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, templateId);
          if (!folder || !FolderService.isTemplateFolder(folder)) {
            return null;
          }
          return folder;
        }),
      getAll: () => withAccount((acc) => FolderService.getAllTemplateFolders(acc)),
      exists: (templateId: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, templateId);
          return folder !== null && FolderService.isTemplateFolder(folder);
        }),
      createItem: (
        account: InstanceOfSchema<typeof Account>,
        templateId: string,
        name: string,
        type: 'item' | 'category',
        parentPath?: string,
        defaultQuantity?: string,
      ) => {
        const folder = findFolderById(account, templateId);
        if (!folder || !FolderService.isTemplateFolder(folder)) {
          throw new Error(`Template ${templateId} not found`);
        }
        if (type === 'category') {
          return ItemService.createCategory(account, templateId, name, parentPath);
        } else {
          return ItemService.createItem(account, templateId, name, parentPath, defaultQuantity);
        }
      },
    },

    // Item operations
    item: {
      createItem: (
        templateId: string,
        name: string,
        parentPath?: string,
        defaultQuantity?: string,
      ) =>
        withAccount((acc) =>
          ItemService.createItem(acc, templateId, name, parentPath, defaultQuantity),
        ),
      createCategory: (templateId: string, name: string, parentPath?: string) =>
        withAccount((acc) => ItemService.createCategory(acc, templateId, name, parentPath)),
      get: (templateId: string, itemId: string) =>
        withAccount((acc) => ItemService.getItem(acc, templateId, itemId)),
      getAll: (templateId: string) => withAccount((acc) => ItemService.getItems(acc, templateId)),
      rename: (templateId: string, itemId: string, newName: string) =>
        withAccount((acc) => ItemService.renameItem(acc, templateId, itemId, newName)),
      archive: (templateId: string, itemId: string) =>
        withAccount((acc) => ItemService.archiveItem(acc, templateId, itemId)),
      toggleCategoryExpanded: (templateId: string, itemId: string) =>
        withAccount((acc) => ItemService.toggleCategoryExpanded(acc, templateId, itemId)),
    },

    // Export operations
    export: {
      toJson: () =>
        withAccount((acc) => ExportService.exportToJsonString(acc, { type: 'all-folders' })),
    },

    // Import operations
    import: {
      fromJson: async (jsonData: string) => withAccount((acc) => importJson(jsonData, acc)),
      itemsFromTxt: async (templateId: string, txtContent: string) =>
        withAccount((acc) => {
          const folder = findFolderById(acc, templateId);
          if (!folder || !FolderService.isTemplateFolder(folder)) {
            throw new Error(`Template ${templateId} not found`);
          }
          return importItemsFromText(txtContent, folder, acc);
        }),
    },

    // Session operations
    session: {
      create: (templateId: string) =>
        withAccount((acc) => SessionService.createSession(acc, templateId)),
      get: (templateId: string, sessionId: string) =>
        withAccount((acc) => SessionService.getSession(acc, templateId, sessionId)),
      getAll: (templateId: string) =>
        withAccount((acc) => SessionService.getSessions(acc, templateId)),
      toggleItemSelected: (templateId: string, sessionId: string, itemId: string) =>
        withAccount((acc) => SessionService.toggleItemSelected(acc, templateId, sessionId, itemId)),
      toggleItemChecked: (templateId: string, sessionId: string, itemId: string) =>
        withAccount((acc) => SessionService.toggleItemChecked(acc, templateId, sessionId, itemId)),
      updateCounts: (templateId: string, sessionId: string) =>
        withAccount((acc) => SessionService.updateSessionCounts(acc, templateId, sessionId)),
    },

    // Sharing operations
    sharing: {
      createInvite: async (
        folderId: string,
        recipientEmail: string,
        permission: 'view' | 'edit' | 'admin' = 'edit',
        expiresInDays = 7,
      ) => {
        const response = await fetch('/api/shares/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            recipientEmail,
            folderCoValueId: folderId,
            permission,
            expiresInDays,
          }),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Unknown error' }));
          throw new Error(
            error.error || error.message || `Failed to create invite (${response.status})`,
          );
        }

        const data = await response.json();

        // Add agent to folder if needed
        if (data.agentAccountId) {
          return withAccount(async (acc) => {
            const folder = findFolderById(acc, folderId);
            if (!folder) throw new Error(`Folder ${folderId} not found`);

            // Import Account from jazz-tools
            const { Account } = await import('jazz-tools');
            const agentAccount = await Account.load(data.agentAccountId, {
              loadAs: folder.$jazz.owner,
            });

            if (agentAccount) {
              const isMember = folder.$jazz.owner.members.some(
                (m: { id: string }) => m.id === data.agentAccountId,
              );

              if (!isMember) {
                folder.$jazz.owner.addMember(agentAccount, 'admin');
              }
            }

            return {
              token: data.token,
              shareUrl: data.shareUrl,
            };
          });
        }

        return {
          token: data.token,
          shareUrl: data.shareUrl,
        };
      },

      acceptInvite: async (token: string) => {
        const response = await fetch('/api/shares/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ token }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to accept invite');
        }

        const data = await response.json();
        return { folderId: data.folderId };
      },

      getInvites: async (folderId: string) => {
        const response = await fetch(`/api/shares/folders/${folderId}/invites`, {
          credentials: 'include',
        });

        if (!response.ok) {
          throw new Error('Failed to get invites');
        }

        const data = await response.json();
        return data.invites;
      },
    },

    // Utility operations
    util: {
      waitForSync: async () => {
        // Wait for Jazz sync
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    },
  };

  // Expose to both window properties
  window.testExports = services;
  window.__testServices = services;

  console.log('[Test Helpers] Services exposed to window.testExports and window.__testServices');
}

/**
 * Helper to find a folder by ID (searches recursively)
 */
function findFolderById(
  account: InstanceOfSchema<typeof Account>,
  folderId: string,
): InstanceOfSchema<typeof FolderNode> | null {
  if (!account.root?.folders) return null;

  function searchFolders(
    folders: InstanceOfSchema<typeof FolderNode>[],
  ): InstanceOfSchema<typeof FolderNode> | null {
    for (const folder of folders) {
      if (!folder) continue;
      if (folder.$jazz.id === folderId) return folder;

      // Search children if organizational folder
      if (folder.children) {
        const found = searchFolders(folder.children);
        if (found) return found;
      }
    }
    return null;
  }

  return searchFolders(Array.from(account.root.folders));
}

// Type declaration for window
declare global {
  interface Window {
    __testServices?: {
      account: InstanceOfSchema<typeof Account> | null;
      directory: {
        create: (
          name: string,
          isTemplate: boolean,
          parentPath?: string | null,
        ) => { entryId: string; templateId?: string; path: string };
        get: (entryId: string) => {
          id: string;
          name: string;
          type: string;
          archived: boolean;
          path: string;
        } | null;
        exists: (entryId: string) => boolean;
        getAll: () => Array<{ id: string; name: string; type: string; path: string }>;
        rename: (entryId: string, newName: string) => void;
        archive: (entryId: string) => void;
        unarchive: (entryId: string) => void;
        delete: (entryId: string) => void;
      };
      folderService: {
        create: (
          name: string,
          isTemplate: boolean,
          parentFolderId?: string | null,
        ) => { folderId: string; path: string };
        get: (folderId: string) => InstanceOfSchema<typeof FolderNode> | null;
        getAll: () => InstanceOfSchema<typeof FolderNode>[];
        getAllTemplates: () => InstanceOfSchema<typeof FolderNode>[];
        rename: (folderId: string, newName: string) => void;
        archive: (folderId: string) => void;
        unarchive: (folderId: string) => void;
        delete: (folderId: string) => void;
        move: (folderId: string, newParentId?: string | null) => void;
        exists: (folderId: string) => boolean;
      };
      directoryService: {
        createDirectoryEntry: (
          account: InstanceOfSchema<typeof Account>,
          name: string,
          isTemplate: boolean,
          parentPath?: string | null,
        ) => { entryId: string; templateId?: string; path: string };
      };
      templateService: {
        get: (templateId: string) => InstanceOfSchema<typeof FolderNode> | null;
        getAll: () => Array<InstanceOfSchema<typeof FolderNode>>;
        exists: (templateId: string) => boolean;
        createItem: (
          account: InstanceOfSchema<typeof Account>,
          templateId: string,
          name: string,
          type: 'item' | 'category',
          parentPath?: string,
          defaultQuantity?: string,
        ) => string;
      };
      item: {
        createItem: (
          templateId: string,
          name: string,
          parentPath?: string,
          defaultQuantity?: string,
        ) => string;
        createCategory: (templateId: string, name: string, parentPath?: string) => string;
        get: (templateId: string, itemId: string) => TemplateItem | null;
        getAll: (templateId: string) => TemplateItem[];
        rename: (templateId: string, itemId: string, newName: string) => void;
        archive: (templateId: string, itemId: string) => void;
        toggleCategoryExpanded: (templateId: string, itemId: string) => void;
      };
      export: {
        toJson: () => string;
      };
      import: {
        fromJson: (jsonData: string) => Promise<ImportResult>;
        itemsFromTxt: (templateId: string, txtContent: string) => Promise<TxtImportResult>;
      };
      session: {
        create: (templateId: string) => string;
        get: (templateId: string, sessionId: string) => SessionData | null;
        getAll: (templateId: string) => Array<SessionData>;
        toggleItemSelected: (templateId: string, sessionId: string, itemId: string) => void;
        toggleItemChecked: (templateId: string, sessionId: string, itemId: string) => void;
        updateCounts: (templateId: string, sessionId: string) => void;
      };
      util: {
        waitForSync: () => Promise<void>;
      };
    };
    testExports?: {
      account: InstanceOfSchema<typeof Account> | null;
      directory: {
        create: (
          name: string,
          isTemplate: boolean,
          parentPath?: string | null,
        ) => { entryId: string; templateId?: string; path: string };
        get: (entryId: string) => {
          id: string;
          name: string;
          type: string;
          archived: boolean;
          path: string;
        } | null;
        exists: (entryId: string) => boolean;
        getAll: () => Array<{ id: string; name: string; type: string; path: string }>;
        rename: (entryId: string, newName: string) => void;
        archive: (entryId: string) => void;
        unarchive: (entryId: string) => void;
        delete: (entryId: string) => void;
      };
      folderService: {
        create: (
          name: string,
          isTemplate: boolean,
          parentFolderId?: string | null,
        ) => { folderId: string; path: string };
        get: (folderId: string) => InstanceOfSchema<typeof FolderNode> | null;
        getAll: () => InstanceOfSchema<typeof FolderNode>[];
        getAllTemplates: () => InstanceOfSchema<typeof FolderNode>[];
        rename: (folderId: string, newName: string) => void;
        archive: (folderId: string) => void;
        unarchive: (folderId: string) => void;
        delete: (folderId: string) => void;
        move: (folderId: string, newParentId?: string | null) => void;
        exists: (folderId: string) => boolean;
      };
      directoryService: {
        createDirectoryEntry: (
          account: InstanceOfSchema<typeof Account>,
          name: string,
          isTemplate: boolean,
          parentPath?: string | null,
        ) => { entryId: string; templateId?: string; path: string };
      };
      templateService: {
        get: (templateId: string) => InstanceOfSchema<typeof FolderNode> | null;
        getAll: () => Array<InstanceOfSchema<typeof FolderNode>>;
        exists: (templateId: string) => boolean;
        createItem: (
          account: InstanceOfSchema<typeof Account>,
          templateId: string,
          name: string,
          type: 'item' | 'category',
          parentPath?: string,
          defaultQuantity?: string,
        ) => string;
      };
      item: {
        createItem: (
          templateId: string,
          name: string,
          parentPath?: string,
          defaultQuantity?: string,
        ) => string;
        createCategory: (templateId: string, name: string, parentPath?: string) => string;
        get: (templateId: string, itemId: string) => TemplateItem | null;
        getAll: (templateId: string) => TemplateItem[];
        rename: (templateId: string, itemId: string, newName: string) => void;
        archive: (templateId: string, itemId: string) => void;
        toggleCategoryExpanded: (templateId: string, itemId: string) => void;
      };
      export: {
        toJson: () => string;
      };
      import: {
        fromJson: (jsonData: string) => Promise<ImportResult>;
        itemsFromTxt: (templateId: string, txtContent: string) => Promise<TxtImportResult>;
      };
      session: {
        create: (templateId: string) => string;
        get: (templateId: string, sessionId: string) => SessionData | null;
        getAll: (templateId: string) => Array<SessionData>;
        toggleItemSelected: (templateId: string, sessionId: string, itemId: string) => void;
        toggleItemChecked: (templateId: string, sessionId: string, itemId: string) => void;
        updateCounts: (templateId: string, sessionId: string) => void;
      };
      util: {
        waitForSync: () => Promise<void>;
      };
    };
  }
}
