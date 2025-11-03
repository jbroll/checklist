/**
 * Test Helpers
 *
 * Exposes services to window for E2E testing.
 * Only imported in test environments.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { FolderNode, GroceriesAccount, ShoppingSession, TemplateItem } from '../schemas';
import * as ExportService from './export/exportService';
import * as FolderService from './folderService';
import { importJson } from './import/jsonImporter';
import type { TxtImportResult } from './import/txtImporter';
import { importItemsFromText } from './import/txtImporter';
import type { ImportResult } from './import/types';
import * as ItemService from './itemService';
import * as SessionService from './sessionService';

/**
 * Expose all services to window for E2E tests
 */
export function exposeServicesToWindow(
  getAccount: () => InstanceOfSchema<typeof GroceriesAccount> | null,
): void {
  // Only expose in development/test
  if (import.meta.env.PROD) return;

  // Helper to get account with error handling
  const withAccount = <T>(fn: (account: InstanceOfSchema<typeof GroceriesAccount>) => T): T => {
    const account = getAccount();
    if (!account) throw new Error('Account not initialized');
    return fn(account);
  };

  // Expose services
  window.__testServices = {
    // Folder operations
    folder: {
      create: (name: string, isTemplate = false) =>
        withAccount((acc) => FolderService.createFolder(acc, name, isTemplate)),
      get: (folderId: string) => withAccount((acc) => FolderService.getFolder(acc, folderId)),
      getAll: () => withAccount((acc) => FolderService.getAllFolders(acc)),
      getTemplates: () => withAccount((acc) => FolderService.getTemplateFolders(acc)),
      rename: (folderId: string, newName: string) =>
        withAccount((acc) => FolderService.renameFolder(acc, folderId, newName)),
      archive: (folderId: string) =>
        withAccount((acc) => FolderService.archiveFolder(acc, folderId)),
      exists: (folderId: string) => withAccount((acc) => FolderService.folderExists(acc, folderId)),
    },

    // Item operations
    item: {
      createItem: (
        folderId: string,
        name: string,
        parentPath?: string,
        defaultQuantity?: string,
        icon?: string,
      ) =>
        withAccount((acc) =>
          ItemService.createItem(acc, folderId, name, parentPath, defaultQuantity, icon),
        ),
      createCategory: (
        folderId: string,
        name: string,
        parentPath?: string,
        icon?: string,
        color?: string,
      ) =>
        withAccount((acc) =>
          ItemService.createCategory(acc, folderId, name, parentPath, icon, color),
        ),
      get: (folderId: string, itemId: string) =>
        withAccount((acc) => ItemService.getItem(acc, folderId, itemId)),
      getAll: (folderId: string) => withAccount((acc) => ItemService.getItems(acc, folderId)),
      rename: (folderId: string, itemId: string, newName: string) =>
        withAccount((acc) => ItemService.renameItem(acc, folderId, itemId, newName)),
      archive: (folderId: string, itemId: string) =>
        withAccount((acc) => ItemService.archiveItem(acc, folderId, itemId)),
      updateIcon: (folderId: string, itemId: string, icon: string) =>
        withAccount((acc) => ItemService.updateItemIcon(acc, folderId, itemId, icon)),
      updateColor: (folderId: string, itemId: string, color: string) =>
        withAccount((acc) => ItemService.updateItemColor(acc, folderId, itemId, color)),
    },

    // Export operations
    export: {
      toJson: () =>
        withAccount((acc) =>
          ExportService.ExportService.exportToJsonString(acc, { type: 'all-folders' }),
        ),
    },

    // Import operations
    import: {
      fromJson: async (jsonData: string) => withAccount((acc) => importJson(jsonData, acc)),
      itemsFromTxt: async (folderId: string, txtContent: string) =>
        withAccount((acc) => {
          const folder = FolderService.getFolder(acc, folderId);
          if (!folder) throw new Error(`Folder ${folderId} not found`);
          return importItemsFromText(txtContent, folder, acc);
        }),
    },

    // Session operations
    session: {
      create: (folderId: string, sessionName?: string) =>
        withAccount((acc) => SessionService.createSession(acc, folderId, sessionName)),
      get: (folderId: string, sessionId: string) =>
        withAccount((acc) => SessionService.getSession(acc, folderId, sessionId)),
      getAll: (folderId: string) => withAccount((acc) => SessionService.getSessions(acc, folderId)),
      toggleItemInCart: (folderId: string, sessionId: string, itemId: string) =>
        withAccount((acc) => SessionService.toggleItemInCart(acc, folderId, sessionId, itemId)),
      toggleItemPurchased: (folderId: string, sessionId: string, itemId: string) =>
        withAccount((acc) => SessionService.toggleItemPurchased(acc, folderId, sessionId, itemId)),
      updateCounts: (folderId: string, sessionId: string) =>
        withAccount((acc) => SessionService.updateSessionCounts(acc, folderId, sessionId)),
      complete: (folderId: string, sessionId: string) =>
        withAccount((acc) => SessionService.completeSession(acc, folderId, sessionId)),
      abandon: (folderId: string, sessionId: string) =>
        withAccount((acc) => SessionService.abandonSession(acc, folderId, sessionId)),
    },

    // Utility operations
    util: {
      waitForSync: async () => {
        // Wait for Jazz sync
        await new Promise((resolve) => setTimeout(resolve, 100));
      },
    },
  };

  console.log('[Test Helpers] Services exposed to window.__testServices');
}

// Type declaration for window
declare global {
  interface Window {
    __testServices?: {
      folder: {
        create: (name: string, isTemplate?: boolean) => string;
        get: (folderId: string) => InstanceOfSchema<typeof FolderNode> | null;
        getAll: () => Array<InstanceOfSchema<typeof FolderNode>>;
        getTemplates: () => Array<InstanceOfSchema<typeof FolderNode>>;
        rename: (folderId: string, newName: string) => void;
        archive: (folderId: string) => void;
        exists: (folderId: string) => boolean;
      };
      item: {
        createItem: (
          folderId: string,
          name: string,
          parentPath?: string,
          defaultQuantity?: string,
          icon?: string,
        ) => string;
        createCategory: (
          folderId: string,
          name: string,
          parentPath?: string,
          icon?: string,
          color?: string,
        ) => string;
        get: (folderId: string, itemId: string) => InstanceOfSchema<typeof TemplateItem> | null;
        getAll: (folderId: string) => Array<InstanceOfSchema<typeof TemplateItem>>;
        rename: (folderId: string, itemId: string, newName: string) => void;
        archive: (folderId: string, itemId: string) => void;
        updateIcon: (folderId: string, itemId: string, icon: string) => void;
        updateColor: (folderId: string, itemId: string, color: string) => void;
      };
      export: {
        toJson: () => string;
      };
      import: {
        fromJson: (jsonData: string) => Promise<ImportResult>;
        itemsFromTxt: (folderId: string, txtContent: string) => Promise<TxtImportResult>;
      };
      session: {
        create: (folderId: string, sessionName?: string) => string;
        get: (
          folderId: string,
          sessionId: string,
        ) => InstanceOfSchema<typeof ShoppingSession> | null;
        getAll: (folderId: string) => Array<InstanceOfSchema<typeof ShoppingSession>>;
        toggleItemInCart: (folderId: string, sessionId: string, itemId: string) => void;
        toggleItemPurchased: (folderId: string, sessionId: string, itemId: string) => void;
        updateCounts: (folderId: string, sessionId: string) => void;
        complete: (folderId: string, sessionId: string) => void;
        abandon: (folderId: string, sessionId: string) => void;
      };
      util: {
        waitForSync: () => Promise<void>;
      };
    };
  }
}
