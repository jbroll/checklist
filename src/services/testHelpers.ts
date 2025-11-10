/**
 * Test Helpers
 *
 * Exposes services to window for E2E testing.
 * Only imported in test environments.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, DirectoryEntry, Session, Template, TemplateItem } from '../schemas';
import * as DirectoryService from './directoryService';
import * as ExportService from './export/exportService';
import { importJson } from './import/jsonImporter';
import type { TxtImportResult } from './import/txtImporter';
import { importItemsFromText } from './import/txtImporter';
import type { ImportResult } from './import/types';
import * as ItemService from './itemService';
import * as SessionService from './sessionService';
import * as TemplateService from './templateService';

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
  window.__testServices = {
    // Directory operations (for creating/managing folders and template references)
    directory: {
      create: (name: string, isTemplate: boolean, parentPath?: string | null) =>
        withAccount((acc) =>
          DirectoryService.createDirectoryEntry(acc, name, isTemplate, parentPath),
        ),
      get: (entryId: string) =>
        withAccount((acc) => DirectoryService.getDirectoryEntry(acc, entryId)),
      getAll: () => withAccount((acc) => DirectoryService.getAllDirectoryEntries(acc)),
      rename: (entryId: string, newName: string) =>
        withAccount((acc) => DirectoryService.renameDirectoryEntry(acc, entryId, newName)),
      archive: (entryId: string) =>
        withAccount((acc) => DirectoryService.archiveDirectoryEntry(acc, entryId)),
      exists: (entryId: string) => withAccount((acc) => DirectoryService.entryExists(acc, entryId)),
    },

    // Template operations (for accessing template data)
    template: {
      get: (templateId: string) =>
        withAccount((acc) => TemplateService.getTemplate(acc, templateId)),
      getAll: () => withAccount((acc) => TemplateService.getAllTemplates(acc)),
      exists: (templateId: string) =>
        withAccount((acc) => TemplateService.templateExists(acc, templateId)),
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
      createCategory: (templateId: string, name: string, parentPath?: string, color?: string) =>
        withAccount((acc) => ItemService.createCategory(acc, templateId, name, parentPath, color)),
      get: (templateId: string, itemId: string) =>
        withAccount((acc) => ItemService.getItem(acc, templateId, itemId)),
      getAll: (templateId: string) => withAccount((acc) => ItemService.getItems(acc, templateId)),
      rename: (templateId: string, itemId: string, newName: string) =>
        withAccount((acc) => ItemService.renameItem(acc, templateId, itemId, newName)),
      archive: (templateId: string, itemId: string) =>
        withAccount((acc) => ItemService.archiveItem(acc, templateId, itemId)),
      updateColor: (templateId: string, itemId: string, color: string) =>
        withAccount((acc) => ItemService.updateItemColor(acc, templateId, itemId, color)),
      toggleCategoryExpanded: (templateId: string, itemId: string) =>
        withAccount((acc) => ItemService.toggleCategoryExpanded(acc, templateId, itemId)),
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
      itemsFromTxt: async (templateId: string, txtContent: string) =>
        withAccount((acc) => {
          const template = TemplateService.getTemplate(acc, templateId);
          if (!template) throw new Error(`Template ${templateId} not found`);
          return importItemsFromText(txtContent, template, acc);
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
      directory: {
        create: (
          name: string,
          isTemplate: boolean,
          parentPath?: string | null,
        ) => { entryId: string; templateId?: string };
        get: (entryId: string) => DirectoryEntry | null;
        getAll: () => DirectoryEntry[];
        rename: (entryId: string, newName: string) => void;
        archive: (entryId: string) => void;
        exists: (entryId: string) => boolean;
      };
      template: {
        get: (templateId: string) => InstanceOfSchema<typeof Template> | null;
        getAll: () => Array<InstanceOfSchema<typeof Template>>;
        exists: (templateId: string) => boolean;
      };
      item: {
        createItem: (
          templateId: string,
          name: string,
          parentPath?: string,
          defaultQuantity?: string,
        ) => string;
        createCategory: (
          templateId: string,
          name: string,
          parentPath?: string,
          color?: string,
        ) => string;
        get: (templateId: string, itemId: string) => TemplateItem | null;
        getAll: (templateId: string) => TemplateItem[];
        rename: (templateId: string, itemId: string, newName: string) => void;
        archive: (templateId: string, itemId: string) => void;
        updateColor: (templateId: string, itemId: string, color: string) => void;
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
        create: (templateId: string, sessionName?: string) => string;
        get: (templateId: string, sessionId: string) => InstanceOfSchema<typeof Session> | null;
        getAll: (templateId: string) => Array<InstanceOfSchema<typeof Session>>;
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
