/**
 * Unit tests for directory service
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DirectoryEntry } from '../schemas';
import * as directoryService from './directoryService';

// Mock the Template schema
vi.mock('../schemas', async () => {
  const actual = await vi.importActual('../schemas');
  return {
    ...actual,
    Template: {
      create: vi.fn((data: any) => ({
        $jazz: {
          id: `template-${crypto.randomUUID()}`,
        },
        ...data,
      })),
    },
  };
});

// Mock crypto.randomUUID
const mockUUIDs = ['mock-uuid-1', 'mock-uuid-2', 'mock-uuid-3', 'mock-uuid-4', 'mock-uuid-5'];
let uuidIndex = 0;

vi.stubGlobal('crypto', {
  randomUUID: () => mockUUIDs[uuidIndex++] || `mock-uuid-${uuidIndex}`,
});

// Mock Account with directory structure
const createMockAccount = (existingEntries: DirectoryEntry[] = []) => {
  const templates: any[] = [];

  return {
    root: {
      directory: [...existingEntries],
      templates: {
        $jazz: {
          push: vi.fn((template: any) => {
            templates.push(template);
          }),
        },
      },
      $jazz: {
        set: vi.fn((key: string, value: any) => {
          if (key === 'directory') {
            // Update the directory in place
            (createMockAccount as any).lastDirectory = value;
          }
        }),
      },
    },
    templates,
  } as any;
};

describe('directoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidIndex = 0;
  });

  describe('createDirectoryEntry', () => {
    it('should create a folder entry at root level', () => {
      const account = createMockAccount();
      const result = directoryService.createDirectoryEntry(account, 'My Folder', false);

      expect(result.entryId).toBeDefined();
      expect(typeof result.entryId).toBe('string');
      expect(result.entryId.length).toBeGreaterThan(0);
      expect(result.templateId).toBeUndefined();
      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          id: result.entryId,
          name: 'My Folder',
          type: 'folder',
          path: 'My-Folder',
          expanded: true,
          archived: false,
        }),
      ]);
    });

    it('should create a folder entry with parent path', () => {
      const account = createMockAccount();
      const result = directoryService.createDirectoryEntry(
        account,
        'Subfolder',
        false,
        'parent/path',
      );

      expect(result.entryId).toBeDefined();
      expect(typeof result.entryId).toBe('string');
      expect(result.entryId.length).toBeGreaterThan(0);
      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          id: result.entryId,
          path: 'parent/path/Subfolder',
          name: 'Subfolder',
          type: 'folder',
        }),
      ]);
    });

    it('should create a template-ref entry and template', () => {
      const account = createMockAccount();
      const result = directoryService.createDirectoryEntry(account, 'My List', true);

      expect(result.entryId).toBeDefined();
      expect(typeof result.entryId).toBe('string');
      expect(result.entryId.length).toBeGreaterThan(0);
      expect(result.templateId).toBeDefined();

      // Verify templates.push was called
      expect(account.root.templates.$jazz.push).toHaveBeenCalled();

      // Verify directory entry was created with correct structure
      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          id: result.entryId,
          name: 'My List',
          type: 'template-ref',
          path: 'My-List',
          expanded: false,
          archived: false,
          templateId: expect.any(String),
        }),
      ]);
    });

    it('should normalize names with spaces to paths with hyphens', () => {
      const account = createMockAccount();
      directoryService.createDirectoryEntry(account, 'My Grocery List', false);

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          name: 'My Grocery List',
          path: 'My-Grocery-List',
        }),
      ]);
    });

    it('should handle multiple spaces in names', () => {
      const account = createMockAccount();
      directoryService.createDirectoryEntry(account, 'My   Big   List', false);

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          path: 'My-Big-List',
        }),
      ]);
    });

    it('should throw error if root not initialized', () => {
      const account = { root: null } as any;

      expect(() => {
        directoryService.createDirectoryEntry(account, 'Test', false);
      }).toThrow('Account root not initialized');
    });
  });

  describe('getDirectoryEntry', () => {
    it('should return entry by ID', () => {
      const existingEntry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Test',
        type: 'folder',
        path: 'test',
        expanded: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([existingEntry]);
      const result = directoryService.getDirectoryEntry(account, 'entry-1');

      expect(result).toEqual(existingEntry);
    });

    it('should return null if entry not found', () => {
      const account = createMockAccount();
      const result = directoryService.getDirectoryEntry(account, 'nonexistent');

      expect(result).toBeNull();
    });

    it('should return null if directory is null', () => {
      const account = { root: { directory: null } } as any;
      const result = directoryService.getDirectoryEntry(account, 'any-id');

      expect(result).toBeNull();
    });
  });

  describe('getAllDirectoryEntries', () => {
    it('should return all non-archived entries', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'Active',
          type: 'folder',
          path: 'active',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Archived',
          type: 'folder',
          path: 'archived',
          expanded: false,
          archived: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      const result = directoryService.getAllDirectoryEntries(account);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return only archived entries when showArchived=true', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'Active',
          type: 'folder',
          path: 'active',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Archived',
          type: 'folder',
          path: 'archived',
          expanded: false,
          archived: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          name: 'Another Archived',
          type: 'template-ref',
          path: 'another-archived',
          expanded: false,
          archived: true,
          templateId: 'template-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      const result = directoryService.getAllDirectoryEntries(account, true);

      expect(result).toHaveLength(2);
      expect(result.map((e) => e.id)).toContain('2');
      expect(result.map((e) => e.id)).toContain('3');
      expect(result.map((e) => e.id)).not.toContain('1');
    });

    it('should return only non-archived when showArchived=false (explicit)', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'Active',
          type: 'folder',
          path: 'active',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Archived',
          type: 'folder',
          path: 'archived',
          expanded: false,
          archived: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      const result = directoryService.getAllDirectoryEntries(account, false);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array if directory is null', () => {
      const account = { root: { directory: null } } as any;
      const result = directoryService.getAllDirectoryEntries(account);

      expect(result).toEqual([]);
    });

    it('should return empty array if root is null', () => {
      const account = { root: null } as any;
      const result = directoryService.getAllDirectoryEntries(account);

      expect(result).toEqual([]);
    });
  });

  describe('getTemplateRefEntries', () => {
    it('should return only template-ref entries', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'Folder',
          type: 'folder',
          path: 'folder',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Template',
          type: 'template-ref',
          path: 'template',
          expanded: false,
          archived: false,
          templateId: 'template-123',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      const result = directoryService.getTemplateRefEntries(account);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('template-ref');
      expect(result[0].templateId).toBe('template-123');
    });

    it('should exclude archived template-refs', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'Active',
          type: 'template-ref',
          path: 'active',
          expanded: false,
          archived: false,
          templateId: 'template-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Archived',
          type: 'template-ref',
          path: 'archived',
          expanded: false,
          archived: true,
          templateId: 'template-2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      const result = directoryService.getTemplateRefEntries(account);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });
  });

  describe('renameDirectoryEntry', () => {
    it('should rename a folder entry', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Old Name',
        type: 'folder',
        path: 'old-name',
        expanded: false,
        archived: false,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const account = createMockAccount([entry]);
      directoryService.renameDirectoryEntry(account, 'entry-1', 'New Name');

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          id: 'entry-1',
          name: 'New Name',
          updatedAt: expect.any(Date),
        }),
      ]);
    });

    it('should rename template-ref and update template name', () => {
      const mockTemplate = {
        $jazz: {
          id: 'template-123',
          set: vi.fn(),
        },
      };

      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Old Template',
        type: 'template-ref',
        path: 'old-template',
        expanded: false,
        archived: false,
        templateId: 'template-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([entry]);
      account.root.templates = [mockTemplate];

      directoryService.renameDirectoryEntry(account, 'entry-1', 'New Template');

      expect(mockTemplate.$jazz.set).toHaveBeenCalledWith('name', 'New Template');
      expect(mockTemplate.$jazz.set).toHaveBeenCalledWith('updatedAt', expect.any(Date));
    });

    it('should throw error if entry not found', () => {
      const account = createMockAccount();

      expect(() => {
        directoryService.renameDirectoryEntry(account, 'nonexistent', 'New Name');
      }).toThrow('Entry nonexistent not found');
    });

    it('should throw error if directory not initialized', () => {
      const account = { root: { directory: null } } as any;

      expect(() => {
        directoryService.renameDirectoryEntry(account, 'any-id', 'New Name');
      }).toThrow('Directory not initialized');
    });
  });

  describe('archiveDirectoryEntry', () => {
    it('should set archived to true', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Test',
        type: 'folder',
        path: 'test',
        expanded: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date('2024-01-01'),
      };

      const account = createMockAccount([entry]);
      directoryService.archiveDirectoryEntry(account, 'entry-1');

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          id: 'entry-1',
          archived: true,
          updatedAt: expect.any(Date),
        }),
      ]);
    });

    it('should not affect other entries', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'Keep',
          type: 'folder',
          path: 'keep',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Archive',
          type: 'folder',
          path: 'archive',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      directoryService.archiveDirectoryEntry(account, '2');

      const calls = account.root.$jazz.set.mock.calls[0];
      const updatedDirectory = calls[1];

      expect(updatedDirectory[0].archived).toBe(false);
      expect(updatedDirectory[1].archived).toBe(true);
    });

    it('should throw error if directory not initialized', () => {
      const account = { root: { directory: null } } as any;

      expect(() => {
        directoryService.archiveDirectoryEntry(account, 'any-id');
      }).toThrow('Directory not initialized');
    });

    it('should cascade archive to child entries when archiving a folder', () => {
      const entries: DirectoryEntry[] = [
        {
          id: 'folder-1',
          name: 'Parent Folder',
          type: 'folder',
          path: 'parent',
          expanded: true,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'template-1',
          name: 'Child Template',
          type: 'template-ref',
          path: 'parent/child',
          templateId: 'template-id-1',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'folder-2',
          name: 'Nested Folder',
          type: 'folder',
          path: 'parent/nested',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'template-2',
          name: 'Deeply Nested Template',
          type: 'template-ref',
          path: 'parent/nested/deep',
          templateId: 'template-id-2',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'other-1',
          name: 'Unrelated',
          type: 'folder',
          path: 'other',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      directoryService.archiveDirectoryEntry(account, 'folder-1');

      const calls = account.root.$jazz.set.mock.calls[0];
      const updatedDirectory = calls[1];

      // Parent folder should be archived
      expect(updatedDirectory[0].archived).toBe(true);
      // Child template should be archived
      expect(updatedDirectory[1].archived).toBe(true);
      // Nested folder should be archived
      expect(updatedDirectory[2].archived).toBe(true);
      // Deeply nested template should be archived
      expect(updatedDirectory[3].archived).toBe(true);
      // Unrelated entry should NOT be archived
      expect(updatedDirectory[4].archived).toBe(false);
    });

    it('should not cascade when archiving a template-ref', () => {
      const entries: DirectoryEntry[] = [
        {
          id: 'folder-1',
          name: 'Parent Folder',
          type: 'folder',
          path: 'parent',
          expanded: true,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'template-1',
          name: 'Template',
          type: 'template-ref',
          path: 'parent/template',
          templateId: 'template-id-1',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      directoryService.archiveDirectoryEntry(account, 'template-1');

      const calls = account.root.$jazz.set.mock.calls[0];
      const updatedDirectory = calls[1];

      // Parent folder should NOT be archived
      expect(updatedDirectory[0].archived).toBe(false);
      // Only the template should be archived
      expect(updatedDirectory[1].archived).toBe(true);
    });
  });

  describe('unarchiveDirectoryEntry', () => {
    it('should set archived to false', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Test',
        type: 'folder',
        path: 'test',
        expanded: false,
        archived: true,
        createdAt: new Date(),
        updatedAt: new Date('2024-01-01'),
      };

      const account = createMockAccount([entry]);
      directoryService.unarchiveDirectoryEntry(account, 'entry-1');

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          id: 'entry-1',
          archived: false,
          updatedAt: expect.any(Date),
        }),
      ]);
    });

    it('should cascade unarchive to child entries when unarchiving a folder', () => {
      const entries: DirectoryEntry[] = [
        {
          id: 'folder-1',
          name: 'Parent Folder',
          type: 'folder',
          path: 'parent',
          expanded: true,
          archived: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'template-1',
          name: 'Child Template',
          type: 'template-ref',
          path: 'parent/child',
          templateId: 'template-id-1',
          expanded: false,
          archived: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'folder-2',
          name: 'Nested Folder',
          type: 'folder',
          path: 'parent/nested',
          expanded: false,
          archived: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      directoryService.unarchiveDirectoryEntry(account, 'folder-1');

      const calls = account.root.$jazz.set.mock.calls[0];
      const updatedDirectory = calls[1];

      // Parent folder should be unarchived
      expect(updatedDirectory[0].archived).toBe(false);
      // Child template should be unarchived
      expect(updatedDirectory[1].archived).toBe(false);
      // Nested folder should be unarchived
      expect(updatedDirectory[2].archived).toBe(false);
    });
  });

  describe('toggleEntryExpanded', () => {
    it('should toggle expanded from false to true', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Test',
        type: 'folder',
        path: 'test',
        expanded: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([entry]);
      directoryService.toggleEntryExpanded(account, 'entry-1');

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          id: 'entry-1',
          expanded: true,
        }),
      ]);
    });

    it('should toggle expanded from true to false', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Test',
        type: 'folder',
        path: 'test',
        expanded: true,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([entry]);
      directoryService.toggleEntryExpanded(account, 'entry-1');

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          expanded: false,
        }),
      ]);
    });

    it('should do nothing if directory is null', () => {
      const account = { root: { directory: null } } as any;
      directoryService.toggleEntryExpanded(account, 'any-id');
      // Should not throw
    });
  });

  describe('moveDirectoryEntry', () => {
    it('should move entry to new parent path', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'MovableFolder',
        type: 'folder',
        path: 'old-parent/MovableFolder',
        expanded: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([entry]);
      directoryService.moveDirectoryEntry(account, 'entry-1', 'new-parent');

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          id: 'entry-1',
          path: 'new-parent/MovableFolder',
        }),
      ]);
    });

    it('should move entry to root (undefined parent)', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'MovableFolder',
        type: 'folder',
        path: 'parent/MovableFolder',
        expanded: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([entry]);
      directoryService.moveDirectoryEntry(account, 'entry-1', undefined);

      expect(account.root.$jazz.set).toHaveBeenCalledWith('directory', [
        expect.objectContaining({
          path: 'MovableFolder',
        }),
      ]);
    });

    it('should update descendant paths when moving folder', () => {
      const entries: DirectoryEntry[] = [
        {
          id: 'parent',
          name: 'Parent',
          type: 'folder',
          path: 'old/Parent',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'child',
          name: 'Child',
          type: 'folder',
          path: 'old/Parent/Child',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      directoryService.moveDirectoryEntry(account, 'parent', 'new');

      const calls = account.root.$jazz.set.mock.calls[0];
      const updatedDirectory = calls[1];

      expect(updatedDirectory[0].path).toBe('new/Parent');
      expect(updatedDirectory[1].path).toBe('new/Parent/Child');
    });

    it('should do nothing if already at location', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Folder',
        type: 'folder',
        path: 'parent/Folder',
        expanded: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([entry]);
      directoryService.moveDirectoryEntry(account, 'entry-1', 'parent');

      // Should not call set if already at location
      expect(account.root.$jazz.set).not.toHaveBeenCalled();
    });

    it('should throw error if entry not found', () => {
      const account = createMockAccount();

      expect(() => {
        directoryService.moveDirectoryEntry(account, 'nonexistent', 'new-parent');
      }).toThrow('Entry nonexistent not found');
    });

    it('should throw error if directory not initialized', () => {
      const account = { root: { directory: null } } as any;

      expect(() => {
        directoryService.moveDirectoryEntry(account, 'any-id', 'new-parent');
      }).toThrow('Directory not initialized');
    });
  });

  describe('entryExists', () => {
    it('should return true for existing non-archived entry', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Test',
        type: 'folder',
        path: 'test',
        expanded: false,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([entry]);
      const result = directoryService.entryExists(account, 'entry-1');

      expect(result).toBe(true);
    });

    it('should return false for archived entry', () => {
      const entry: DirectoryEntry = {
        id: 'entry-1',
        name: 'Test',
        type: 'folder',
        path: 'test',
        expanded: false,
        archived: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const account = createMockAccount([entry]);
      const result = directoryService.entryExists(account, 'entry-1');

      expect(result).toBe(false);
    });

    it('should return false for nonexistent entry', () => {
      const account = createMockAccount();
      const result = directoryService.entryExists(account, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('reorderDirectoryEntry', () => {
    it('should move entry from position 0 to position 2', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'First',
          type: 'folder',
          path: 'first',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Second',
          type: 'folder',
          path: 'second',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          name: 'Third',
          type: 'folder',
          path: 'third',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      directoryService.reorderDirectoryEntry(account, '1', 2);

      expect(account.root.$jazz.set).toHaveBeenCalled();
      const setCall = account.root.$jazz.set.mock.calls[0];
      expect(setCall[0]).toBe('directory');
      const newDirectory = setCall[1] as DirectoryEntry[];

      // Check order: Second, Third, First
      expect(newDirectory[0].id).toBe('2');
      expect(newDirectory[1].id).toBe('3');
      expect(newDirectory[2].id).toBe('1');
    });

    it('should move entry from position 2 to position 0', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'First',
          type: 'folder',
          path: 'first',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Second',
          type: 'folder',
          path: 'second',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          name: 'Third',
          type: 'folder',
          path: 'third',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      directoryService.reorderDirectoryEntry(account, '3', 0);

      const setCall = account.root.$jazz.set.mock.calls[0];
      const newDirectory = setCall[1] as DirectoryEntry[];

      // Check order: Third, First, Second
      expect(newDirectory[0].id).toBe('3');
      expect(newDirectory[1].id).toBe('1');
      expect(newDirectory[2].id).toBe('2');
    });

    it('should throw error for nonexistent entry', () => {
      const account = createMockAccount([]);

      expect(() => {
        directoryService.reorderDirectoryEntry(account, 'nonexistent', 0);
      }).toThrow('Entry nonexistent not found');
    });

    it('should handle reordering within middle positions', () => {
      const entries: DirectoryEntry[] = [
        {
          id: '1',
          name: 'A',
          type: 'folder',
          path: 'a',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'B',
          type: 'folder',
          path: 'b',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          name: 'C',
          type: 'folder',
          path: 'c',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '4',
          name: 'D',
          type: 'folder',
          path: 'd',
          expanded: false,
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const account = createMockAccount(entries);
      directoryService.reorderDirectoryEntry(account, '2', 3);

      const setCall = account.root.$jazz.set.mock.calls[0];
      const newDirectory = setCall[1] as DirectoryEntry[];

      // Check order: A, C, D, B
      expect(newDirectory.map((e) => e.id)).toEqual(['1', '3', '4', '2']);
    });
  });
});
