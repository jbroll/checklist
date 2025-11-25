/**
 * FolderService Unit Tests
 *
 * Tests for hierarchical folder management using FolderNode CoValues.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock jazz-tools Group and co.list before importing
let groupIdCounter = 0;
let listIdCounter = 0;
vi.mock('jazz-tools', async () => {
  const actual: any = await vi.importActual('jazz-tools');

  // Wrapper for co.list that mocks the create method
  const mockCoList = (schema: any) => {
    const originalListSchema = actual.co.list(schema);
    return {
      ...originalListSchema,
      create: vi.fn((data: any[], options: any) => {
        const list: any[] = [...data];
        list.$jazz = {
          id: `list-${listIdCounter++}`,
          push: (item: any) => list.push(item),
          splice: (index: number, deleteCount: number, ...items: any[]) =>
            list.splice(index, deleteCount, ...items),
        };
        return list;
      }),
    };
  };

  return {
    ...actual,
    Group: {
      create: vi.fn((options: any) => {
        const id = `group-${groupIdCounter++}`;
        const members: any[] = [];
        return {
          $jazz: { id, owner: options.owner },
          members,
          addMember: vi.fn((memberOrGroup: any, role?: string) => {
            // Handle both Account and Group members
            const memberId = memberOrGroup.$jazz?.id || memberOrGroup.id;
            members.push({ id: memberId, role: role || 'member' });
          }),
          removeMember: vi.fn((memberOrGroup: any) => {
            const memberId = memberOrGroup.$jazz?.id || memberOrGroup.id;
            const index = members.findIndex((m: any) => m.id === memberId);
            if (index !== -1) {
              members.splice(index, 1);
            }
          }),
        };
      }),
    },
    co: {
      ...actual.co,
      list: mockCoList,
    },
  };
});

import type { InstanceOfSchema } from 'jazz-tools';
import { type Account, FolderNode } from '../schemas';
import {
  archiveFolder,
  createFolder,
  deleteFolder,
  expandAncestorFolders,
  findFolderByPath,
  folderNameExists,
  generateUniqueFolderName,
  getAllTemplateFolders,
  getChildFolders,
  getFolderDisplayPath,
  getFolderPath,
  getRootFolders,
  isOrganizationalFolder,
  isTemplateFolder,
  moveFolder,
  renameFolder,
  reorderFolder,
  setFolderExpanded,
  toggleFolderExpanded,
  unarchiveFolder,
} from './folderService';

// Spy on FolderNode.create
let folderIdCounter = 0;

// Mock FolderNode.create before tests
(FolderNode as any).create = vi.fn((data: any, options: any) => {
  const id = `folder-${folderIdCounter++}`;
  const folder: any = { ...data };

  folder.$jazz = {
    id,
    owner: options?.owner, // Include the owner (Group) from options
    set: (key: string, value: any) => {
      folder[key] = value;
    },
  };

  // For template folders, wrap sessions array with $jazz methods
  if (data.sessions !== undefined) {
    const sessions: any[] = [...(data.sessions || [])];
    sessions.$jazz = {
      push: (item: any) => sessions.push(item),
      splice: (index: number, deleteCount: number, ...items: any[]) =>
        sessions.splice(index, deleteCount, ...items),
    };
    folder.sessions = sessions;
  }

  // items are plain arrays
  return folder;
});

// Mock Jazz CoValues
const createMockAccount = (): InstanceOfSchema<typeof Account> => {
  const folders: any[] = [];
  folders.$jazz = {
    push: (folder: any) => folders.push(folder),
    splice: (index: number, deleteCount: number, ...items: any[]) =>
      folders.splice(index, deleteCount, ...items),
  };

  const account: any = {
    root: {
      folders,
      $jazz: {
        set: () => {},
      },
    },
    $jazz: {
      id: 'account-1',
    },
  };

  // Mock the owner property to return the account
  account._owner = account;

  return account as InstanceOfSchema<typeof Account>;
};

const createMockFolder = (
  name: string,
  isTemplate: boolean,
  parent?: InstanceOfSchema<typeof FolderNode>,
): InstanceOfSchema<typeof FolderNode> => {
  const folder: any = {
    name,
    expanded: !isTemplate,
    archived: false,
    parent,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  if (isTemplate) {
    // Template folder
    folder.items = [];
    const sessions: any[] = [];
    sessions.$jazz = {
      push: (s: any) => sessions.push(s),
      splice: (index: number, deleteCount: number, ...items: any[]) =>
        sessions.splice(index, deleteCount, ...items),
    };
    folder.sessions = sessions;
    folder.showZoneHeadings = false;
  } else {
    // Organizational folder
    const children: any[] = [];
    children.$jazz = {
      push: (c: any) => children.push(c),
      splice: (index: number, deleteCount: number, ...items: any[]) =>
        children.splice(index, deleteCount, ...items),
    };
    folder.children = children;
  }

  folder.$jazz = {
    id: `folder-${Math.random().toString(36).substring(7)}`,
    set: (key: string, value: any) => {
      folder[key] = value;
    },
  };

  return folder as InstanceOfSchema<typeof FolderNode>;
};

describe('FolderService', () => {
  let account: InstanceOfSchema<typeof Account>;

  beforeEach(() => {
    account = createMockAccount();
  });

  describe('isTemplateFolder', () => {
    it('should return true for template folders', () => {
      const template = createMockFolder('Template', true);
      expect(isTemplateFolder(template)).toBe(true);
    });

    it('should return false for organizational folders', () => {
      const folder = createMockFolder('Folder', false);
      expect(isTemplateFolder(folder)).toBe(false);
    });
  });

  describe('isOrganizationalFolder', () => {
    it('should return true for organizational folders', () => {
      const folder = createMockFolder('Folder', false);
      expect(isOrganizationalFolder(folder)).toBe(true);
    });

    it('should return false for template folders', () => {
      const template = createMockFolder('Template', true);
      expect(isOrganizationalFolder(template)).toBe(false);
    });
  });

  describe('createFolder', () => {
    it('should create an organizational folder at root', () => {
      const folder = createFolder(account, 'My Folder', false);

      expect(folder.name).toBe('My Folder');
      expect(folder.expanded).toBe(true);
      expect(folder.archived).toBe(false);
      expect(folder.children).toBeDefined();
      expect(folder.items).toBeUndefined();
      expect(account.root.folders).toContain(folder);
    });

    it('should create a template folder at root', () => {
      const template = createFolder(account, 'My Template', true);

      expect(template.name).toBe('My Template');
      expect(template.expanded).toBe(false);
      expect(template.archived).toBe(false);
      expect(template.items).toBeDefined();
      expect(template.sessions).toBeDefined();
      expect(template.showZoneHeadings).toBe(false);
      expect(template.children).toBeUndefined();
      expect(account.root.folders).toContain(template);
    });

    it('should create a nested folder under a parent', () => {
      const parent = createFolder(account, 'Parent', false);
      const child = createFolder(account, 'Child', false, parent);

      expect(child.parent).toBe(parent);
      expect(parent.children).toContain(child);
    });

    it('should create a template under an organizational folder', () => {
      const parent = createFolder(account, 'Parent', false);
      const template = createFolder(account, 'Template', true, parent);

      expect(template.parent).toBe(parent);
      expect(parent.children).toContain(template);
      expect(isTemplateFolder(template)).toBe(true);
    });
  });

  describe('getRootFolders', () => {
    it('should return all root folders', () => {
      createFolder(account, 'Folder 1', false);
      createFolder(account, 'Folder 2', false);
      createFolder(account, 'Template 1', true);

      const roots = getRootFolders(account);
      expect(roots).toHaveLength(3);
    });

    it('should exclude archived folders by default', () => {
      const folder1 = createFolder(account, 'Folder 1', false);
      const folder2 = createFolder(account, 'Folder 2', false);
      archiveFolder(folder2);

      const roots = getRootFolders(account);
      expect(roots).toHaveLength(1);
      expect(roots[0]).toBe(folder1);
    });

    it('should include archived folders when requested', () => {
      createFolder(account, 'Folder 1', false);
      const folder2 = createFolder(account, 'Folder 2', false);
      archiveFolder(folder2);

      const roots = getRootFolders(account, true);
      expect(roots).toHaveLength(2);
    });

    it('should return empty array if no root folders', () => {
      const roots = getRootFolders(account);
      expect(roots).toEqual([]);
    });
  });

  describe('getChildFolders', () => {
    it('should return children of organizational folder', () => {
      const parent = createFolder(account, 'Parent', false);
      createFolder(account, 'Child 1', false, parent);
      createFolder(account, 'Child 2', true, parent);

      const children = getChildFolders(parent);
      expect(children).toHaveLength(2);
    });

    it('should exclude archived children by default', () => {
      const parent = createFolder(account, 'Parent', false);
      createFolder(account, 'Child 1', false, parent);
      const child2 = createFolder(account, 'Child 2', false, parent);
      archiveFolder(child2);

      const children = getChildFolders(parent);
      expect(children).toHaveLength(1);
    });

    it('should return empty array for template folders', () => {
      const template = createFolder(account, 'Template', true);
      const children = getChildFolders(template);
      expect(children).toEqual([]);
    });
  });

  describe('renameFolder', () => {
    it('should rename a folder', () => {
      const folder = createFolder(account, 'Old Name', false);
      const oldUpdatedAt = folder.updatedAt;

      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        renameFolder(folder, 'New Name');

        expect(folder.name).toBe('New Name');
        expect(folder.updatedAt.getTime()).toBeGreaterThan(oldUpdatedAt.getTime());
      }, 10);
    });
  });

  describe('archiveFolder', () => {
    it('should archive a folder', () => {
      const folder = createFolder(account, 'Folder', false);

      archiveFolder(folder);

      expect(folder.archived).toBe(true);
    });

    it('should recursively archive children', () => {
      const parent = createFolder(account, 'Parent', false);
      const child1 = createFolder(account, 'Child 1', false, parent);
      const child2 = createFolder(account, 'Child 2', true, parent);

      archiveFolder(parent);

      expect(parent.archived).toBe(true);
      expect(child1.archived).toBe(true);
      expect(child2.archived).toBe(true);
    });

    it('should not re-archive already archived children', () => {
      const parent = createFolder(account, 'Parent', false);
      const child = createFolder(account, 'Child', false, parent);
      archiveFolder(child);
      const childUpdatedAt = child.updatedAt;

      archiveFolder(parent);

      // Child's updatedAt should not change since it was already archived
      expect(child.updatedAt).toEqual(childUpdatedAt);
    });
  });

  describe('unarchiveFolder', () => {
    it('should unarchive a folder', () => {
      const folder = createFolder(account, 'Folder', false);
      archiveFolder(folder);

      unarchiveFolder(folder);

      expect(folder.archived).toBe(false);
    });

    it('should recursively unarchive children', () => {
      const parent = createFolder(account, 'Parent', false);
      const child1 = createFolder(account, 'Child 1', false, parent);
      const child2 = createFolder(account, 'Child 2', true, parent);
      archiveFolder(parent);

      unarchiveFolder(parent);

      expect(parent.archived).toBe(false);
      expect(child1.archived).toBe(false);
      expect(child2.archived).toBe(false);
    });
  });

  describe('deleteFolder', () => {
    it('should delete a folder from root', () => {
      const folder = createFolder(account, 'Folder', false);
      expect(account.root.folders).toContain(folder);

      deleteFolder(account, folder);

      expect(account.root.folders).not.toContain(folder);
    });

    it('should delete a folder from parent', () => {
      const parent = createFolder(account, 'Parent', false);
      const child = createFolder(account, 'Child', false, parent);
      expect(parent.children).toContain(child);

      deleteFolder(account, child);

      expect(parent.children).not.toContain(child);
    });

    it('should recursively delete children', () => {
      const parent = createFolder(account, 'Parent', false);
      const child1 = createFolder(account, 'Child 1', false, parent);
      const _child2 = createFolder(account, 'Child 2', false, child1);

      deleteFolder(account, parent);

      expect(account.root.folders).not.toContain(parent);
      // Children should have been deleted as well
      expect(parent.children).toHaveLength(0);
    });

    it('should clean up sessions for template folders', () => {
      const template = createFolder(account, 'Template', true);
      // Mock some sessions
      template.sessions?.$jazz.push({} as any);
      template.sessions?.$jazz.push({} as any);
      expect(template.sessions).toHaveLength(2);

      deleteFolder(account, template);

      expect(template.sessions).toHaveLength(0);
    });
  });

  describe('toggleFolderExpanded', () => {
    it('should toggle expanded state from false to true', () => {
      const folder = createFolder(account, 'Folder', true); // Templates start collapsed
      expect(folder.expanded).toBe(false);

      toggleFolderExpanded(folder);

      expect(folder.expanded).toBe(true);
    });

    it('should toggle expanded state from true to false', () => {
      const folder = createFolder(account, 'Folder', false); // Org folders start expanded
      expect(folder.expanded).toBe(true);

      toggleFolderExpanded(folder);

      expect(folder.expanded).toBe(false);
    });
  });

  describe('setFolderExpanded', () => {
    it('should set expanded to true', () => {
      const folder = createFolder(account, 'Folder', true);
      expect(folder.expanded).toBe(false);

      setFolderExpanded(folder, true);

      expect(folder.expanded).toBe(true);
    });

    it('should set expanded to false', () => {
      const folder = createFolder(account, 'Folder', false);
      expect(folder.expanded).toBe(true);

      setFolderExpanded(folder, false);

      expect(folder.expanded).toBe(false);
    });
  });

  describe('expandAncestorFolders', () => {
    it('should expand all ancestor folders', () => {
      const root = createFolder(account, 'Root', false);
      setFolderExpanded(root, false);

      const level1 = createFolder(account, 'Level 1', false, root);
      setFolderExpanded(level1, false);

      const level2 = createFolder(account, 'Level 2', true, level1);

      expandAncestorFolders(level2);

      expect(root.expanded).toBe(true);
      expect(level1.expanded).toBe(true);
      expect(level2.expanded).toBe(false); // The folder itself is not expanded
    });

    it('should do nothing for root-level folders', () => {
      const folder = createFolder(account, 'Root Folder', false);
      setFolderExpanded(folder, false);

      expandAncestorFolders(folder);

      expect(folder.expanded).toBe(false);
    });
  });

  describe('moveFolder', () => {
    it('should move folder from root to parent', () => {
      const folder = createFolder(account, 'Folder', false);
      const newParent = createFolder(account, 'Parent', false);

      expect(account.root.folders).toContain(folder);
      expect(newParent.children).not.toContain(folder);

      moveFolder(account, folder, newParent);

      expect(account.root.folders).not.toContain(folder);
      expect(newParent.children).toContain(folder);
      expect(folder.parent).toBe(newParent);
    });

    it('should move folder from parent to root', () => {
      const parent = createFolder(account, 'Parent', false);
      const folder = createFolder(account, 'Folder', false, parent);

      expect(parent.children).toContain(folder);
      expect(account.root.folders).not.toContain(folder);

      moveFolder(account, folder, null);

      expect(parent.children).not.toContain(folder);
      expect(account.root.folders).toContain(folder);
      expect(folder.parent).toBeUndefined();
    });

    it('should move folder between parents', () => {
      const parent1 = createFolder(account, 'Parent 1', false);
      const parent2 = createFolder(account, 'Parent 2', false);
      const folder = createFolder(account, 'Folder', false, parent1);

      moveFolder(account, folder, parent2);

      expect(parent1.children).not.toContain(folder);
      expect(parent2.children).toContain(folder);
      expect(folder.parent).toBe(parent2);
    });

    it('should prevent moving folder into itself', () => {
      const folder = createFolder(account, 'Folder', false);

      expect(() => moveFolder(account, folder, folder)).toThrow(
        'Cannot move folder into itself or its descendants',
      );
    });

    it('should prevent moving folder into its descendant', () => {
      const parent = createFolder(account, 'Parent', false);
      const child = createFolder(account, 'Child', false, parent);
      const grandchild = createFolder(account, 'Grandchild', false, child);

      expect(() => moveFolder(account, parent, grandchild)).toThrow(
        'Cannot move folder into itself or its descendants',
      );
    });
  });

  describe('getFolderPath', () => {
    it('should return single-segment path for root folder', () => {
      const folder = createFolder(account, 'Root Folder', false);
      const path = getFolderPath(folder);

      expect(path).toEqual(['Root Folder']);
    });

    it('should return multi-segment path for nested folder', () => {
      const level1 = createFolder(account, 'Level 1', false);
      const level2 = createFolder(account, 'Level 2', false, level1);
      const level3 = createFolder(account, 'Level 3', true, level2);

      const path = getFolderPath(level3);

      expect(path).toEqual(['Level 1', 'Level 2', 'Level 3']);
    });

    it('should handle deeply nested hierarchies', () => {
      let current = createFolder(account, 'Level 0', false);
      for (let i = 1; i <= 10; i++) {
        current = createFolder(account, `Level ${i}`, false, current);
      }

      const path = getFolderPath(current);

      expect(path).toHaveLength(11);
      expect(path[0]).toBe('Level 0');
      expect(path[10]).toBe('Level 10');
    });
  });

  describe('getFolderDisplayPath', () => {
    it('should return slash-separated path', () => {
      const level1 = createFolder(account, 'Level 1', false);
      const level2 = createFolder(account, 'Level 2', false, level1);
      const level3 = createFolder(account, 'Level 3', true, level2);

      const displayPath = getFolderDisplayPath(level3);

      expect(displayPath).toBe('Level 1/Level 2/Level 3');
    });
  });

  describe('findFolderByPath', () => {
    it('should find root-level folder', () => {
      const folder = createFolder(account, 'My Folder', false);

      const found = findFolderByPath(account, ['My Folder']);

      expect(found).toBe(folder);
    });

    it('should find nested folder', () => {
      const level1 = createFolder(account, 'Level 1', false);
      const level2 = createFolder(account, 'Level 2', false, level1);
      const level3 = createFolder(account, 'Level 3', true, level2);

      const found = findFolderByPath(account, ['Level 1', 'Level 2', 'Level 3']);

      expect(found).toBe(level3);
    });

    it('should return null for non-existent path', () => {
      createFolder(account, 'Folder', false);

      const found = findFolderByPath(account, ['Nonexistent']);

      expect(found).toBeNull();
    });

    it('should return null for partial path', () => {
      const level1 = createFolder(account, 'Level 1', false);
      createFolder(account, 'Level 2', false, level1);

      const found = findFolderByPath(account, ['Level 1', 'Nonexistent']);

      expect(found).toBeNull();
    });

    it('should return null for empty path', () => {
      createFolder(account, 'Folder', false);

      const found = findFolderByPath(account, []);

      expect(found).toBeNull();
    });
  });

  describe('reorderFolder', () => {
    it('should reorder folder within root', () => {
      const folder1 = createFolder(account, 'Folder 1', false);
      const folder2 = createFolder(account, 'Folder 2', false);
      const folder3 = createFolder(account, 'Folder 3', false);

      // Move folder3 to position 0
      reorderFolder(account, folder3, 0);

      expect(account.root.folders[0]).toBe(folder3);
      expect(account.root.folders[1]).toBe(folder1);
      expect(account.root.folders[2]).toBe(folder2);
    });

    it('should reorder folder within parent', () => {
      const parent = createFolder(account, 'Parent', false);
      const child1 = createFolder(account, 'Child 1', false, parent);
      const child2 = createFolder(account, 'Child 2', false, parent);
      const child3 = createFolder(account, 'Child 3', false, parent);

      // Move child3 to position 1
      reorderFolder(account, child3, 1);

      expect(parent.children?.[0]).toBe(child1);
      expect(parent.children?.[1]).toBe(child3);
      expect(parent.children?.[2]).toBe(child2);
    });

    it('should throw error if folder not found in parent', () => {
      const folder = createMockFolder('Orphan', false);

      expect(() => reorderFolder(account, folder, 0)).toThrow('Folder not found in parent');
    });
  });

  describe('getAllTemplateFolders', () => {
    it('should return all template folders', () => {
      createFolder(account, 'Org 1', false);
      createFolder(account, 'Template 1', true);
      const parent = createFolder(account, 'Org 2', false);
      createFolder(account, 'Template 2', true, parent);

      const templates = getAllTemplateFolders(account);

      expect(templates).toHaveLength(2);
      expect(templates.every(isTemplateFolder)).toBe(true);
    });

    it('should exclude archived templates by default', () => {
      createFolder(account, 'Template 1', true);
      const template2 = createFolder(account, 'Template 2', true);
      archiveFolder(template2);

      const templates = getAllTemplateFolders(account);

      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Template 1');
    });

    it('should include archived templates when requested', () => {
      createFolder(account, 'Template 1', true);
      const template2 = createFolder(account, 'Template 2', true);
      archiveFolder(template2);

      const templates = getAllTemplateFolders(account, true);

      expect(templates).toHaveLength(2);
    });

    it('should find templates in deeply nested structures', () => {
      const level1 = createFolder(account, 'Level 1', false);
      const level2 = createFolder(account, 'Level 2', false, level1);
      const level3 = createFolder(account, 'Level 3', false, level2);
      createFolder(account, 'Deep Template', true, level3);

      const templates = getAllTemplateFolders(account);

      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Deep Template');
    });

    it('should return empty array if no templates', () => {
      createFolder(account, 'Org 1', false);
      createFolder(account, 'Org 2', false);

      const templates = getAllTemplateFolders(account);

      expect(templates).toEqual([]);
    });

    it('should not include organizational folders', () => {
      createFolder(account, 'Org 1', false);
      createFolder(account, 'Template 1', true);
      createFolder(account, 'Org 2', false);

      const templates = getAllTemplateFolders(account);

      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Template 1');
    });
  });

  describe('folderNameExists', () => {
    it('should return true if name exists at root level', () => {
      createFolder(account, 'My Folder', true);

      expect(folderNameExists('My Folder', account)).toBe(true);
    });

    it('should return false if name does not exist', () => {
      createFolder(account, 'Other Folder', true);

      expect(folderNameExists('My Folder', account)).toBe(false);
    });

    it('should check case-insensitively', () => {
      createFolder(account, 'My Folder', true);

      expect(folderNameExists('MY FOLDER', account)).toBe(true);
      expect(folderNameExists('my folder', account)).toBe(true);
    });

    it('should ignore archived folders', () => {
      const folder = createFolder(account, 'Archived Folder', true);
      archiveFolder(folder);

      expect(folderNameExists('Archived Folder', account)).toBe(false);
    });

    it('should check within parent folder when provided', () => {
      const parent = createFolder(account, 'Parent', false);
      createFolder(account, 'Child', true, parent);

      expect(folderNameExists('Child', account, parent)).toBe(true);
      expect(folderNameExists('Child', account)).toBe(false); // Not at root
    });

    it('should allow same name in different locations', () => {
      createFolder(account, 'Common Name', true);
      const parent = createFolder(account, 'Parent', false);

      // "Common Name" exists at root, but not in parent
      expect(folderNameExists('Common Name', account)).toBe(true);
      expect(folderNameExists('Common Name', account, parent)).toBe(false);
    });
  });

  describe('generateUniqueFolderName', () => {
    it('should return original name if not duplicate', () => {
      const name = generateUniqueFolderName('New Folder', account);

      expect(name).toBe('New Folder');
    });

    it('should add (2) suffix if name exists', () => {
      createFolder(account, 'My Folder', true);

      const name = generateUniqueFolderName('My Folder', account);

      expect(name).toBe('My Folder (2)');
    });

    it('should increment suffix until unique', () => {
      createFolder(account, 'My Folder', true);
      createFolder(account, 'My Folder (2)', true);
      createFolder(account, 'My Folder (3)', true);

      const name = generateUniqueFolderName('My Folder', account);

      expect(name).toBe('My Folder (4)');
    });

    it('should work within parent folder context', () => {
      const parent = createFolder(account, 'Parent', false);
      createFolder(account, 'Child', true, parent);

      const name = generateUniqueFolderName('Child', account, parent);

      expect(name).toBe('Child (2)');
    });

    it('should allow same name in different locations', () => {
      createFolder(account, 'Common Name', true);
      const parent = createFolder(account, 'Parent', false);

      // Should not need suffix because parent doesn't have "Common Name"
      const name = generateUniqueFolderName('Common Name', account, parent);

      expect(name).toBe('Common Name');
    });
  });
});
