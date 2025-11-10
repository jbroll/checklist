/**
 * Unit tests for template service
 */

import { beforeEach, describe, expect, it } from 'vitest';
import * as templateService from './templateService';

// Mock Template for testing
const createMockTemplate = (id: string, name: string) => ({
  $jazz: { id },
  name,
  items: [],
  sessions: [],
  currentSessionId: undefined,
  showZoneHeadings: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// Mock Account with templates
const createMockAccount = (templates: any[] = []) =>
  ({
    root: {
      templates,
    },
  }) as any;

describe('templateService', () => {
  beforeEach(() => {
    // Reset any state between tests
  });

  describe('getTemplate', () => {
    it('should return template by ID', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');
      const template2 = createMockTemplate('template-2', 'Shopping List');

      const account = createMockAccount([template1, template2]);
      const result = templateService.getTemplate(account, 'template-1');

      expect(result).toEqual(template1);
      expect(result?.name).toBe('Grocery List');
    });

    it('should return null if template not found', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');

      const account = createMockAccount([template1]);
      const result = templateService.getTemplate(account, 'nonexistent-id');

      expect(result).toBeNull();
    });

    it('should return null if templates array is empty', () => {
      const account = createMockAccount([]);
      const result = templateService.getTemplate(account, 'any-id');

      expect(result).toBeNull();
    });

    it('should return null if root.templates is undefined', () => {
      const account = { root: {} } as any;
      const result = templateService.getTemplate(account, 'any-id');

      expect(result).toBeNull();
    });

    it('should return null if root is undefined', () => {
      const account = {} as any;
      const result = templateService.getTemplate(account, 'any-id');

      expect(result).toBeNull();
    });

    it('should handle multiple templates and return correct one', () => {
      const templates = [
        createMockTemplate('template-1', 'List 1'),
        createMockTemplate('template-2', 'List 2'),
        createMockTemplate('template-3', 'List 3'),
        createMockTemplate('template-4', 'List 4'),
      ];

      const account = createMockAccount(templates);
      const result = templateService.getTemplate(account, 'template-3');

      expect(result?.name).toBe('List 3');
      expect(result?.$jazz.id).toBe('template-3');
    });
  });

  describe('getAllTemplates', () => {
    it('should return all templates', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');
      const template2 = createMockTemplate('template-2', 'Shopping List');

      const account = createMockAccount([template1, template2]);
      const result = templateService.getAllTemplates(account);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Grocery List');
      expect(result[1].name).toBe('Shopping List');
    });

    it('should return empty array if no templates exist', () => {
      const account = createMockAccount([]);
      const result = templateService.getAllTemplates(account);

      expect(result).toEqual([]);
    });

    it('should return empty array if root.templates is undefined', () => {
      const account = { root: {} } as any;
      const result = templateService.getAllTemplates(account);

      expect(result).toEqual([]);
    });

    it('should return empty array if root is undefined', () => {
      const account = {} as any;
      const result = templateService.getAllTemplates(account);

      expect(result).toEqual([]);
    });

    it('should filter out null templates', () => {
      const template1 = createMockTemplate('template-1', 'List 1');
      const template2 = null;
      const template3 = createMockTemplate('template-3', 'List 3');

      const account = createMockAccount([template1, template2, template3]);
      const result = templateService.getAllTemplates(account);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('List 1');
      expect(result[1].name).toBe('List 3');
    });

    it('should filter out undefined templates', () => {
      const template1 = createMockTemplate('template-1', 'List 1');
      const template2 = undefined;
      const template3 = createMockTemplate('template-3', 'List 3');

      const account = createMockAccount([template1, template2, template3]);
      const result = templateService.getAllTemplates(account);

      expect(result).toHaveLength(2);
    });
  });

  describe('templateExists', () => {
    it('should return true if template exists', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');
      const template2 = createMockTemplate('template-2', 'Shopping List');

      const account = createMockAccount([template1, template2]);
      const result = templateService.templateExists(account, 'template-1');

      expect(result).toBe(true);
    });

    it('should return false if template does not exist', () => {
      const template1 = createMockTemplate('template-1', 'Grocery List');

      const account = createMockAccount([template1]);
      const result = templateService.templateExists(account, 'nonexistent-id');

      expect(result).toBe(false);
    });

    it('should return false if templates array is empty', () => {
      const account = createMockAccount([]);
      const result = templateService.templateExists(account, 'any-id');

      expect(result).toBe(false);
    });

    it('should return false if root.templates is undefined', () => {
      const account = { root: {} } as any;
      const result = templateService.templateExists(account, 'any-id');

      expect(result).toBe(false);
    });

    it('should return false if root is undefined', () => {
      const account = {} as any;
      const result = templateService.templateExists(account, 'any-id');

      expect(result).toBe(false);
    });

    it('should work correctly with multiple templates', () => {
      const templates = [
        createMockTemplate('template-1', 'List 1'),
        createMockTemplate('template-2', 'List 2'),
        createMockTemplate('template-3', 'List 3'),
      ];

      const account = createMockAccount(templates);

      expect(templateService.templateExists(account, 'template-1')).toBe(true);
      expect(templateService.templateExists(account, 'template-2')).toBe(true);
      expect(templateService.templateExists(account, 'template-3')).toBe(true);
      expect(templateService.templateExists(account, 'template-4')).toBe(false);
    });

    it('should handle null template in array', () => {
      const template1 = createMockTemplate('template-1', 'List 1');
      const template2 = null;

      const account = createMockAccount([template1, template2]);

      expect(templateService.templateExists(account, 'template-1')).toBe(true);
      expect(templateService.templateExists(account, 'template-2')).toBe(false);
    });
  });
});
