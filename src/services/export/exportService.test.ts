/**
 * Unit tests for exportService
 */

import { describe, expect, it } from 'vitest';
import { generateFilename } from './exportService';

describe('exportService', () => {
  describe('generateFilename', () => {
    it('should generate filename for all-folders export with JSON format', () => {
      const scope = { type: 'all-folders' as const };
      const filename = generateFilename(scope, 'json');

      // Should match pattern: bubblelist-data-YYYY-MM-DD.json
      expect(filename).toMatch(/^bubblelist-data-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should generate filename for all-folders export with different formats', () => {
      const scope = { type: 'all-folders' as const };

      expect(generateFilename(scope, 'txt')).toMatch(/\.txt$/);
      expect(generateFilename(scope, 'csv')).toMatch(/\.csv$/);
    });

    it('should generate filename for single-folder export with folder name', () => {
      const scope = { type: 'single-folder' as const, folderId: 'test-id' };
      const filename = generateFilename(scope, 'json', 'Shopping List');

      // Should sanitize folder name and include it
      expect(filename).toMatch(/^shopping-list-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should sanitize folder names with special characters', () => {
      const scope = { type: 'single-folder' as const, folderId: 'test-id' };
      const filename = generateFilename(scope, 'json', 'My Folder #1!');

      // Should replace non-alphanumeric characters with hyphens (# becomes - and ! becomes -)
      expect(filename).toMatch(/^my-folder--1--\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should use default folder name when folderName is not provided', () => {
      const scope = { type: 'single-folder' as const, folderId: 'test-id' };
      const filename = generateFilename(scope, 'json');

      expect(filename).toMatch(/^folder-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('should include current date in YYYY-MM-DD format', () => {
      const scope = { type: 'all-folders' as const };
      const filename = generateFilename(scope, 'json');
      const today = new Date().toISOString().split('T')[0];

      expect(filename).toContain(today);
    });
  });
});
