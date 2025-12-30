/**
 * Unit tests for file download utilities
 *
 * Tests browser-based file download functionality.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv, downloadFile, downloadJson, downloadText } from './fileDownload';

describe('fileDownload', () => {
  let mockLink: {
    href: string;
    download: string;
    click: ReturnType<typeof vi.fn>;
  };
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;
  let appendedElements: HTMLElement[];

  beforeEach(() => {
    mockLink = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    appendedElements = [];

    // Mock document.createElement
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return mockLink as unknown as HTMLAnchorElement;
      }
      return document.createElement(tag);
    });

    // Mock document.body.appendChild and removeChild
    vi.spyOn(document.body, 'appendChild').mockImplementation((el: Node) => {
      appendedElements.push(el as HTMLElement);
      return el;
    });
    vi.spyOn(document.body, 'removeChild').mockImplementation((el: Node) => {
      const index = appendedElements.indexOf(el as HTMLElement);
      if (index > -1) {
        appendedElements.splice(index, 1);
      }
      return el;
    });

    // Mock URL.createObjectURL and revokeObjectURL
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    mockRevokeObjectURL = vi.fn();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('downloadFile', () => {
    it('creates a blob with correct content and type', () => {
      downloadFile('test content', 'test.txt', 'text/plain');

      expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
      const blob = mockCreateObjectURL.mock.calls[0][0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('text/plain');
    });

    it('sets correct href and download attributes', () => {
      downloadFile('test content', 'myfile.txt', 'text/plain');

      expect(mockLink.href).toBe('blob:mock-url');
      expect(mockLink.download).toBe('myfile.txt');
    });

    it('clicks the link to trigger download', () => {
      downloadFile('test content', 'test.txt', 'text/plain');

      expect(mockLink.click).toHaveBeenCalledTimes(1);
    });

    it('appends and removes link from document', () => {
      downloadFile('test content', 'test.txt', 'text/plain');

      expect(document.body.appendChild).toHaveBeenCalled();
      expect(document.body.removeChild).toHaveBeenCalled();
      expect(appendedElements).toHaveLength(0); // Element should be removed
    });

    it('revokes object URL after download', () => {
      downloadFile('test content', 'test.txt', 'text/plain');

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('handles empty content', () => {
      downloadFile('', 'empty.txt', 'text/plain');

      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockLink.click).toHaveBeenCalled();
    });

    it('handles special characters in filename', () => {
      downloadFile('content', 'file with spaces.txt', 'text/plain');

      expect(mockLink.download).toBe('file with spaces.txt');
    });
  });

  describe('downloadJson', () => {
    it('stringifies data with formatting', () => {
      const data = { key: 'value', nested: { a: 1 } };
      downloadJson(data, 'data.json');

      const blob = mockCreateObjectURL.mock.calls[0][0];
      expect(blob.type).toBe('application/json');
    });

    it('sets correct filename', () => {
      downloadJson({ test: true }, 'export.json');

      expect(mockLink.download).toBe('export.json');
    });

    it('handles arrays', () => {
      const data = [1, 2, 3];
      downloadJson(data, 'array.json');

      expect(mockLink.click).toHaveBeenCalled();
    });

    it('handles null', () => {
      downloadJson(null, 'null.json');

      expect(mockLink.click).toHaveBeenCalled();
    });

    it('handles complex nested objects', () => {
      const data = {
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        metadata: {
          version: '1.0',
          exportedAt: '2025-01-01',
        },
      };

      downloadJson(data, 'complex.json');

      expect(mockLink.click).toHaveBeenCalled();
    });
  });

  describe('downloadText', () => {
    it('downloads with text/plain mime type', () => {
      downloadText('Hello World', 'hello.txt');

      const blob = mockCreateObjectURL.mock.calls[0][0];
      expect(blob.type).toBe('text/plain');
    });

    it('sets correct filename', () => {
      downloadText('content', 'notes.txt');

      expect(mockLink.download).toBe('notes.txt');
    });

    it('handles multiline text', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      downloadText(text, 'multiline.txt');

      expect(mockLink.click).toHaveBeenCalled();
    });

    it('handles unicode text', () => {
      const text = 'Hello 世界 🌍';
      downloadText(text, 'unicode.txt');

      expect(mockLink.click).toHaveBeenCalled();
    });
  });

  describe('downloadCsv', () => {
    it('downloads with text/csv mime type', () => {
      downloadCsv('name,value\na,1', 'data.csv');

      const blob = mockCreateObjectURL.mock.calls[0][0];
      expect(blob.type).toBe('text/csv');
    });

    it('sets correct filename', () => {
      downloadCsv('a,b,c', 'export.csv');

      expect(mockLink.download).toBe('export.csv');
    });

    it('handles csv with special characters', () => {
      const csv = 'name,value\n"Smith, John",100\n"O\'Brien",200';
      downloadCsv(csv, 'special.csv');

      expect(mockLink.click).toHaveBeenCalled();
    });

    it('handles csv with newlines in values', () => {
      const csv = 'name,description\n"Item","Multi\nline\ndesc"';
      downloadCsv(csv, 'newlines.csv');

      expect(mockLink.click).toHaveBeenCalled();
    });
  });
});
