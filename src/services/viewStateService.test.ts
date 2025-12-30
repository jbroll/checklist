/**
 * Unit tests for view state service
 *
 * Tests folder/category expanded state and garbage collection.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  cleanupViewState,
  collapseAllSessionCategories,
  expandAllSessionCategories,
  getFolderExpanded,
  getSessionCategoryExpanded,
  getTemplateCategoryExpanded,
  setFolderExpanded,
  setSessionCategoryExpanded,
  setTemplateCategoryExpanded,
  toggleFolderExpanded,
  toggleSessionCategoryExpanded,
  toggleTemplateCategoryExpanded,
} from './viewStateService';

// Mock ViewState.create to return a properly structured object
vi.mock('../schemas', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as object),
    ViewState: {
      create: vi.fn((data: any, _options: any) => {
        const viewState = {
          ...data,
          $jazz: {
            set: vi.fn((key: string, value: any) => {
              (viewState as any)[key] = value;
            }),
          },
        };
        return viewState;
      }),
    },
  };
});

// Helper to create mock view state
const createMockViewState = (
  data: {
    folderExpanded?: Record<string, boolean>;
    templateCategoryExpanded?: Record<string, Record<string, boolean>>;
    sessionCategoryExpanded?: Record<string, Record<string, boolean>>;
  } = {},
) => ({
  folderExpanded: data.folderExpanded || {},
  templateCategoryExpanded: data.templateCategoryExpanded || {},
  sessionCategoryExpanded: data.sessionCategoryExpanded || {},
  $jazz: {
    set: vi.fn((key: string, value: any) => {
      (data as any)[key] = value;
    }),
  },
});

// Helper to create mock account with proper viewState storage
const createMockAccount = (viewState?: ReturnType<typeof createMockViewState>) => {
  const account: any = {
    root: {
      viewState,
      $jazz: {
        set: vi.fn((key: string, value: any) => {
          if (key === 'viewState') {
            account.root.viewState = value;
          }
        }),
      },
    },
  };
  return account;
};

describe('viewStateService', () => {
  describe('getFolderExpanded', () => {
    it('returns false by default when no viewState', () => {
      const account = createMockAccount();
      expect(getFolderExpanded(account as any, 'folder-1')).toBe(false);
    });

    it('returns false for unknown folder', () => {
      const viewState = createMockViewState({ folderExpanded: { 'folder-1': true } });
      const account = createMockAccount(viewState);
      expect(getFolderExpanded(account as any, 'folder-unknown')).toBe(false);
    });

    it('returns true for expanded folder', () => {
      const viewState = createMockViewState({ folderExpanded: { 'folder-1': true } });
      const account = createMockAccount(viewState);
      expect(getFolderExpanded(account as any, 'folder-1')).toBe(true);
    });

    it('returns false for collapsed folder', () => {
      const viewState = createMockViewState({ folderExpanded: { 'folder-1': false } });
      const account = createMockAccount(viewState);
      expect(getFolderExpanded(account as any, 'folder-1')).toBe(false);
    });
  });

  describe('setFolderExpanded', () => {
    it('creates viewState if not exists', () => {
      const account = createMockAccount();

      // Call setFolderExpanded which should create viewState
      setFolderExpanded(account as any, 'folder-1', true);

      // Verify viewState was created and set on account.root
      expect(account.root.$jazz.set).toHaveBeenCalledWith('viewState', expect.any(Object));
      expect(account.root.viewState).toBeDefined();
    });

    it('sets folder expanded state', () => {
      const viewState = createMockViewState({ folderExpanded: {} });
      const account = createMockAccount(viewState);

      setFolderExpanded(account as any, 'folder-1', true);

      expect(viewState.$jazz.set).toHaveBeenCalledWith('folderExpanded', { 'folder-1': true });
    });

    it('preserves other folder states', () => {
      const viewState = createMockViewState({ folderExpanded: { 'folder-1': true } });
      const account = createMockAccount(viewState);

      setFolderExpanded(account as any, 'folder-2', false);

      expect(viewState.$jazz.set).toHaveBeenCalledWith('folderExpanded', {
        'folder-1': true,
        'folder-2': false,
      });
    });

    it('throws error when account root not initialized', () => {
      expect(() => {
        setFolderExpanded({ root: null } as any, 'folder-1', true);
      }).toThrow('Account root not initialized');
    });
  });

  describe('toggleFolderExpanded', () => {
    it('toggles from collapsed to expanded', () => {
      const viewState = createMockViewState({ folderExpanded: { 'folder-1': false } });
      const account = createMockAccount(viewState);

      toggleFolderExpanded(account as any, 'folder-1');

      expect(viewState.$jazz.set).toHaveBeenCalledWith('folderExpanded', { 'folder-1': true });
    });

    it('toggles from expanded to collapsed', () => {
      const viewState = createMockViewState({ folderExpanded: { 'folder-1': true } });
      const account = createMockAccount(viewState);

      toggleFolderExpanded(account as any, 'folder-1');

      expect(viewState.$jazz.set).toHaveBeenCalledWith('folderExpanded', { 'folder-1': false });
    });
  });

  describe('getTemplateCategoryExpanded', () => {
    it('returns true by default when no viewState', () => {
      const account = createMockAccount();
      expect(getTemplateCategoryExpanded(account as any, 'template-1', 'category-1')).toBe(true);
    });

    it('returns true for unknown template', () => {
      const viewState = createMockViewState({
        templateCategoryExpanded: { 'template-1': { 'cat-1': false } },
      });
      const account = createMockAccount(viewState);
      expect(getTemplateCategoryExpanded(account as any, 'unknown', 'cat-1')).toBe(true);
    });

    it('returns true for unknown category in known template', () => {
      const viewState = createMockViewState({
        templateCategoryExpanded: { 'template-1': { 'cat-1': false } },
      });
      const account = createMockAccount(viewState);
      expect(getTemplateCategoryExpanded(account as any, 'template-1', 'unknown')).toBe(true);
    });

    it('returns stored value', () => {
      const viewState = createMockViewState({
        templateCategoryExpanded: { 'template-1': { 'cat-1': false } },
      });
      const account = createMockAccount(viewState);
      expect(getTemplateCategoryExpanded(account as any, 'template-1', 'cat-1')).toBe(false);
    });
  });

  describe('setTemplateCategoryExpanded', () => {
    it('creates nested structure for new template', () => {
      const viewState = createMockViewState({});
      const account = createMockAccount(viewState);

      setTemplateCategoryExpanded(account as any, 'template-1', 'cat-1', false);

      expect(viewState.$jazz.set).toHaveBeenCalledWith('templateCategoryExpanded', {
        'template-1': { 'cat-1': false },
      });
    });

    it('preserves other categories in template', () => {
      const viewState = createMockViewState({
        templateCategoryExpanded: { 'template-1': { 'cat-1': true } },
      });
      const account = createMockAccount(viewState);

      setTemplateCategoryExpanded(account as any, 'template-1', 'cat-2', false);

      expect(viewState.$jazz.set).toHaveBeenCalledWith('templateCategoryExpanded', {
        'template-1': { 'cat-1': true, 'cat-2': false },
      });
    });
  });

  describe('toggleTemplateCategoryExpanded', () => {
    it('toggles category state', () => {
      const viewState = createMockViewState({
        templateCategoryExpanded: { 'template-1': { 'cat-1': true } },
      });
      const account = createMockAccount(viewState);

      toggleTemplateCategoryExpanded(account as any, 'template-1', 'cat-1');

      expect(viewState.$jazz.set).toHaveBeenCalledWith('templateCategoryExpanded', {
        'template-1': { 'cat-1': false },
      });
    });
  });

  describe('getSessionCategoryExpanded', () => {
    it('returns true by default when no viewState', () => {
      const account = createMockAccount();
      expect(getSessionCategoryExpanded(account as any, 'session-1', 'zone-1')).toBe(true);
    });

    it('returns stored value', () => {
      const viewState = createMockViewState({
        sessionCategoryExpanded: { 'session-1': { 'zone-1': false } },
      });
      const account = createMockAccount(viewState);
      expect(getSessionCategoryExpanded(account as any, 'session-1', 'zone-1')).toBe(false);
    });
  });

  describe('setSessionCategoryExpanded', () => {
    it('sets session category state', () => {
      const viewState = createMockViewState({});
      const account = createMockAccount(viewState);

      setSessionCategoryExpanded(account as any, 'session-1', 'zone-1', false);

      expect(viewState.$jazz.set).toHaveBeenCalledWith('sessionCategoryExpanded', {
        'session-1': { 'zone-1': false },
      });
    });
  });

  describe('toggleSessionCategoryExpanded', () => {
    it('toggles session category state', () => {
      const viewState = createMockViewState({
        sessionCategoryExpanded: { 'session-1': { 'zone-1': true } },
      });
      const account = createMockAccount(viewState);

      toggleSessionCategoryExpanded(account as any, 'session-1', 'zone-1');

      expect(viewState.$jazz.set).toHaveBeenCalledWith('sessionCategoryExpanded', {
        'session-1': { 'zone-1': false },
      });
    });
  });

  describe('expandAllSessionCategories', () => {
    it('expands all specified categories', () => {
      const viewState = createMockViewState({});
      const account = createMockAccount(viewState);

      expandAllSessionCategories(account as any, 'session-1', ['zone-1', 'zone-2', 'zone-3']);

      expect(viewState.$jazz.set).toHaveBeenCalledWith('sessionCategoryExpanded', {
        'session-1': { 'zone-1': true, 'zone-2': true, 'zone-3': true },
      });
    });

    it('preserves other sessions', () => {
      const viewState = createMockViewState({
        sessionCategoryExpanded: { 'session-other': { 'z-1': false } },
      });
      const account = createMockAccount(viewState);

      expandAllSessionCategories(account as any, 'session-1', ['zone-1']);

      expect(viewState.$jazz.set).toHaveBeenCalledWith('sessionCategoryExpanded', {
        'session-other': { 'z-1': false },
        'session-1': { 'zone-1': true },
      });
    });
  });

  describe('collapseAllSessionCategories', () => {
    it('collapses all specified categories', () => {
      const viewState = createMockViewState({});
      const account = createMockAccount(viewState);

      collapseAllSessionCategories(account as any, 'session-1', ['zone-1', 'zone-2']);

      expect(viewState.$jazz.set).toHaveBeenCalledWith('sessionCategoryExpanded', {
        'session-1': { 'zone-1': false, 'zone-2': false },
      });
    });
  });

  describe('cleanupViewState', () => {
    it('returns zeros when no viewState', () => {
      const account = createMockAccount();
      const result = cleanupViewState(
        account as any,
        new Set(['f1']),
        new Set(['t1']),
        new Set(['s1']),
      );

      expect(result).toEqual({
        foldersRemoved: 0,
        templatesRemoved: 0,
        sessionsRemoved: 0,
      });
    });

    it('removes stale folder entries', () => {
      const viewState = createMockViewState({
        folderExpanded: { 'valid-folder': true, 'stale-folder': true },
      });
      const account = createMockAccount(viewState);

      const result = cleanupViewState(
        account as any,
        new Set(['valid-folder']),
        new Set(),
        new Set(),
      );

      expect(result.foldersRemoved).toBe(1);
      expect(viewState.$jazz.set).toHaveBeenCalledWith('folderExpanded', { 'valid-folder': true });
    });

    it('removes stale template entries', () => {
      const viewState = createMockViewState({
        templateCategoryExpanded: {
          'valid-template': { cat: true },
          'stale-template': { cat: false },
        },
      });
      const account = createMockAccount(viewState);

      const result = cleanupViewState(
        account as any,
        new Set(),
        new Set(['valid-template']),
        new Set(),
      );

      expect(result.templatesRemoved).toBe(1);
      expect(viewState.$jazz.set).toHaveBeenCalledWith('templateCategoryExpanded', {
        'valid-template': { cat: true },
      });
    });

    it('removes stale session entries', () => {
      const viewState = createMockViewState({
        sessionCategoryExpanded: {
          'valid-session': { zone: true },
          'stale-session-1': { zone: false },
          'stale-session-2': { zone: true },
        },
      });
      const account = createMockAccount(viewState);

      const result = cleanupViewState(
        account as any,
        new Set(),
        new Set(),
        new Set(['valid-session']),
      );

      expect(result.sessionsRemoved).toBe(2);
      expect(viewState.$jazz.set).toHaveBeenCalledWith('sessionCategoryExpanded', {
        'valid-session': { zone: true },
      });
    });

    it('handles empty valid sets (removes all)', () => {
      const viewState = createMockViewState({
        folderExpanded: { f1: true, f2: false },
        templateCategoryExpanded: { t1: { c: true } },
        sessionCategoryExpanded: { s1: { z: true } },
      });
      const account = createMockAccount(viewState);

      const result = cleanupViewState(account as any, new Set(), new Set(), new Set());

      expect(result.foldersRemoved).toBe(2);
      expect(result.templatesRemoved).toBe(1);
      expect(result.sessionsRemoved).toBe(1);
    });

    it('keeps all when all are valid', () => {
      const viewState = createMockViewState({
        folderExpanded: { f1: true, f2: false },
        templateCategoryExpanded: { t1: { c: true } },
        sessionCategoryExpanded: { s1: { z: true } },
      });
      const account = createMockAccount(viewState);

      const result = cleanupViewState(
        account as any,
        new Set(['f1', 'f2']),
        new Set(['t1']),
        new Set(['s1']),
      );

      expect(result.foldersRemoved).toBe(0);
      expect(result.templatesRemoved).toBe(0);
      expect(result.sessionsRemoved).toBe(0);
      // $jazz.set should not be called when nothing changes
    });
  });
});
