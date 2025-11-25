/**
 * Unit tests for Import Service
 *
 * Tests importAsNewTemplate functionality including:
 * - Metadata-based template naming
 * - Duplicate name detection
 * - Fallback to filename
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as folderService from '../folderService';
import { parseTextMetadata } from './txtImporter';

// Mock folderService
vi.mock('../folderService', () => ({
  createFolder: vi.fn(),
}));

// Mock file reading - include all exports used by importService
vi.mock('../../utils/fileUpload', () => ({
  readFileAsText: vi.fn(),
  isValidFileType: vi.fn().mockReturnValue(true),
  isValidFileSize: vi.fn().mockReturnValue(true),
  getFileExtension: vi.fn((name: string) => name.split('.').pop() || ''),
  formatFileSize: vi.fn((bytes: number) => `${bytes} bytes`),
}));

import { readFileAsText } from '../../utils/fileUpload';
import { importAsNewTemplate } from './importService';

// Create mock file
function createMockFile(name: string, content: string): File {
  const blob = new Blob([content], { type: 'text/plain' });
  return new File([blob], name, { type: 'text/plain' });
}

// Mock account
const createMockAccount = () => ({
  root: {
    folders: [] as any[],
  },
  $jazz: { id: 'account-1' },
});

// Mock template (returned by createFolder)
const createMockTemplate = () => ({
  name: 'Test Template',
  items: [] as any[],
  $jazz: {
    set: vi.fn(),
  },
});

describe('importService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('importAsNewTemplate', () => {
    describe('template naming', () => {
      it('uses metadata name when present in TXT file', async () => {
        const fileContent = `
# name: My Custom List
# description: Test description

Item1
Item2
        `.trim();

        const file = createMockFile('some-filename.txt', fileContent);
        const account = createMockAccount();
        const mockTemplate = createMockTemplate();

        vi.mocked(readFileAsText).mockResolvedValue(fileContent);
        vi.mocked(folderService.createFolder).mockReturnValue(mockTemplate as any);

        await importAsNewTemplate(file, account as any, undefined, 'txt');

        // Should use metadata name, not filename
        expect(folderService.createFolder).toHaveBeenCalledWith(
          account,
          'My Custom List',
          true,
          undefined,
        );
      });

      it('uses provided templateName over metadata name', async () => {
        const fileContent = `
# name: Metadata Name

Item1
        `.trim();

        const file = createMockFile('filename.txt', fileContent);
        const account = createMockAccount();
        const mockTemplate = createMockTemplate();

        vi.mocked(readFileAsText).mockResolvedValue(fileContent);
        vi.mocked(folderService.createFolder).mockReturnValue(mockTemplate as any);

        await importAsNewTemplate(file, account as any, 'Explicit Name', 'txt');

        // Should use explicit name, not metadata
        expect(folderService.createFolder).toHaveBeenCalledWith(
          account,
          'Explicit Name',
          true,
          undefined,
        );
      });

      it('falls back to filename when no metadata and no explicit name', async () => {
        const fileContent = `
Item1
Item2
        `.trim();

        const file = createMockFile('my-shopping-list.txt', fileContent);
        const account = createMockAccount();
        const mockTemplate = createMockTemplate();

        vi.mocked(readFileAsText).mockResolvedValue(fileContent);
        vi.mocked(folderService.createFolder).mockReturnValue(mockTemplate as any);

        await importAsNewTemplate(file, account as any, undefined, 'txt');

        // Should use filename without extension
        expect(folderService.createFolder).toHaveBeenCalledWith(
          account,
          'my-shopping-list',
          true,
          undefined,
        );
      });

      it('does not use metadata for CSV files', async () => {
        const fileContent = `name,category
Item1,Cat1
Item2,Cat2`;

        const file = createMockFile('data.csv', fileContent);
        const account = createMockAccount();
        const mockTemplate = createMockTemplate();

        vi.mocked(readFileAsText).mockResolvedValue(fileContent);
        vi.mocked(folderService.createFolder).mockReturnValue(mockTemplate as any);

        await importAsNewTemplate(file, account as any, undefined, 'csv');

        // Should use filename, not try to parse CSV for metadata
        expect(folderService.createFolder).toHaveBeenCalledWith(account, 'data', true, undefined);
      });
    });

    describe('error handling', () => {
      it('returns error when folder creation fails', async () => {
        const fileContent = `# name: Test\n\nItem1`;
        const file = createMockFile('test.txt', fileContent);
        const account = createMockAccount();

        vi.mocked(readFileAsText).mockResolvedValue(fileContent);
        vi.mocked(folderService.createFolder).mockReturnValue(null as any);

        const result = await importAsNewTemplate(file, account as any, undefined, 'txt');

        expect(result.success).toBe(false);
        expect(result.errors[0]).toContain('Failed to create template');
      });
    });
  });

  describe('parseTextMetadata', () => {
    it('extracts name from well-formatted metadata', () => {
      const content = `# name: Grocery List\n# description: Weekly shopping\n\nApples\nBananas`;
      const metadata = parseTextMetadata(content);

      expect(metadata.name).toBe('Grocery List');
      expect(metadata.description).toBe('Weekly shopping');
    });

    it('handles various spacing patterns', () => {
      const content = `#name:NoSpaces\n#  name:  Extra Spaces  \n# NAME: Uppercase`;
      const metadata = parseTextMetadata(content);

      // Last one wins (all same key normalized to lowercase)
      expect(metadata.name).toBe('Uppercase');
    });
  });
});
