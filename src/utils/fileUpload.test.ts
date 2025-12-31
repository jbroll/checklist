/**
 * Unit tests for file upload utilities
 */

import { describe, expect, it } from 'vitest';
import {
  formatFileSize,
  getFileExtension,
  isValidFileSize,
  isValidFileType,
  isValidMimeType,
} from './fileUpload';

describe('fileUpload utilities', () => {
  describe('isValidFileType', () => {
    it('should accept files with allowed extensions', () => {
      const file = new File(['content'], 'test.json', { type: 'application/json' });
      expect(isValidFileType(file, ['json'])).toBe(true);
    });

    it('should reject files with disallowed extensions', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      expect(isValidFileType(file, ['json'])).toBe(false);
    });

    it('should handle multiple allowed extensions', () => {
      const jsonFile = new File(['{}'], 'data.json', { type: 'application/json' });
      const csvFile = new File(['a,b'], 'data.csv', { type: 'text/csv' });
      const txtFile = new File(['text'], 'data.txt', { type: 'text/plain' });

      expect(isValidFileType(jsonFile, ['json', 'csv', 'txt'])).toBe(true);
      expect(isValidFileType(csvFile, ['json', 'csv', 'txt'])).toBe(true);
      expect(isValidFileType(txtFile, ['json', 'csv', 'txt'])).toBe(true);
    });

    it('should be case-insensitive', () => {
      const file = new File(['content'], 'TEST.JSON', { type: 'application/json' });
      expect(isValidFileType(file, ['json'])).toBe(true);
    });

    it('should handle files with multiple dots in name', () => {
      const file = new File(['content'], 'my.data.file.json', { type: 'application/json' });
      expect(isValidFileType(file, ['json'])).toBe(true);
    });

    it('should reject files with no extension', () => {
      const file = new File(['content'], 'noextension', { type: 'text/plain' });
      expect(isValidFileType(file, ['json'])).toBe(false);
    });

    it('should reject files with mismatched MIME type', () => {
      // File claims to be .json but has executable MIME type
      const file = new File(['content'], 'malware.json', { type: 'application/x-executable' });
      expect(isValidFileType(file, ['json'])).toBe(false);
    });

    it('should accept files with correct MIME type', () => {
      const jsonFile = new File(['{}'], 'data.json', { type: 'application/json' });
      const csvFile = new File(['a,b'], 'data.csv', { type: 'text/csv' });
      const txtFile = new File(['text'], 'data.txt', { type: 'text/plain' });

      expect(isValidFileType(jsonFile, ['json'])).toBe(true);
      expect(isValidFileType(csvFile, ['csv'])).toBe(true);
      expect(isValidFileType(txtFile, ['txt'])).toBe(true);
    });

    it('should accept text/plain as generic MIME type for text files', () => {
      // Browsers sometimes report text/plain for csv files
      const csvWithPlainMime = new File(['a,b'], 'data.csv', { type: 'text/plain' });
      expect(isValidFileType(csvWithPlainMime, ['csv'])).toBe(true);

      // JSON files might also be reported as text/plain
      const jsonWithPlainMime = new File(['{}'], 'data.json', { type: 'text/plain' });
      expect(isValidFileType(jsonWithPlainMime, ['json'])).toBe(true);
    });

    it('should accept empty MIME type (drag-and-drop edge case)', () => {
      const file = new File(['content'], 'data.json', { type: '' });
      expect(isValidFileType(file, ['json'])).toBe(true);
    });

    it('should accept application/octet-stream as fallback', () => {
      // Some browsers use this for unknown file types
      const file = new File(['{}'], 'data.json', { type: 'application/octet-stream' });
      expect(isValidFileType(file, ['json'])).toBe(true);
    });
  });

  describe('isValidMimeType', () => {
    it('should accept correct MIME types for JSON', () => {
      expect(isValidMimeType('application/json', 'json')).toBe(true);
      expect(isValidMimeType('text/json', 'json')).toBe(true);
    });

    it('should accept correct MIME types for CSV', () => {
      expect(isValidMimeType('text/csv', 'csv')).toBe(true);
      expect(isValidMimeType('application/csv', 'csv')).toBe(true);
      expect(isValidMimeType('text/comma-separated-values', 'csv')).toBe(true);
    });

    it('should accept correct MIME types for TXT', () => {
      expect(isValidMimeType('text/plain', 'txt')).toBe(true);
    });

    it('should accept generic text types for all text extensions', () => {
      expect(isValidMimeType('text/plain', 'json')).toBe(true);
      expect(isValidMimeType('text/plain', 'csv')).toBe(true);
      expect(isValidMimeType('', 'json')).toBe(true);
      expect(isValidMimeType('application/octet-stream', 'csv')).toBe(true);
    });

    it('should reject invalid MIME types', () => {
      expect(isValidMimeType('application/x-executable', 'json')).toBe(false);
      expect(isValidMimeType('application/zip', 'csv')).toBe(false);
      expect(isValidMimeType('image/png', 'txt')).toBe(false);
    });

    it('should be case-insensitive for MIME types', () => {
      expect(isValidMimeType('APPLICATION/JSON', 'json')).toBe(true);
      expect(isValidMimeType('Text/CSV', 'csv')).toBe(true);
    });

    it('should handle whitespace in MIME types', () => {
      expect(isValidMimeType('  application/json  ', 'json')).toBe(true);
      expect(isValidMimeType('text/csv ', 'csv')).toBe(true);
    });

    it('should handle unknown extensions with generic types only', () => {
      expect(isValidMimeType('text/plain', 'xyz')).toBe(true);
      expect(isValidMimeType('', 'xyz')).toBe(true);
      expect(isValidMimeType('application/xyz', 'xyz')).toBe(false);
    });
  });

  describe('getFileExtension', () => {
    it('should extract extension from filename', () => {
      expect(getFileExtension('test.json')).toBe('json');
      expect(getFileExtension('data.csv')).toBe('csv');
      expect(getFileExtension('file.txt')).toBe('txt');
    });

    it('should return lowercase extension', () => {
      expect(getFileExtension('FILE.JSON')).toBe('json');
      expect(getFileExtension('Data.CSV')).toBe('csv');
    });

    it('should handle files with multiple dots', () => {
      expect(getFileExtension('my.data.file.json')).toBe('json');
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
    });

    it('should return empty string for files with no extension', () => {
      expect(getFileExtension('noextension')).toBe('');
    });

    it('should handle paths with directories', () => {
      expect(getFileExtension('/path/to/file.json')).toBe('json');
      expect(getFileExtension('C:\\Users\\test\\data.csv')).toBe('csv');
    });
  });

  describe('isValidFileSize', () => {
    it('should accept files within size limit', () => {
      const file = new File(['x'.repeat(1024)], 'test.txt'); // 1 KB
      expect(isValidFileSize(file, 1)).toBe(true); // 1 MB limit
    });

    it('should accept files exactly at size limit', () => {
      const size = 5 * 1024 * 1024; // 5 MB
      const content = new Array(size).fill('x').join('');
      const file = new File([content], 'test.txt');
      expect(isValidFileSize(file, 5)).toBe(true);
    });

    it('should reject files over size limit', () => {
      const size = 6 * 1024 * 1024; // 6 MB
      const content = new Array(size).fill('x').join('');
      const file = new File([content], 'test.txt');
      expect(isValidFileSize(file, 5)).toBe(false); // 5 MB limit
    });

    it('should handle zero-byte files', () => {
      const file = new File([], 'empty.txt');
      expect(isValidFileSize(file, 1)).toBe(true);
    });

    it('should handle very large size limits', () => {
      const file = new File(['small content'], 'test.txt');
      expect(isValidFileSize(file, 1000)).toBe(true); // 1 GB limit
    });

    it('should convert MB to bytes correctly', () => {
      // 1 MB = 1024 * 1024 bytes = 1048576 bytes
      const file = new File([new Array(1048577).fill('x').join('')], 'test.txt');
      expect(isValidFileSize(file, 1)).toBe(false); // Just over 1 MB
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(500)).toBe('500 Bytes');
      expect(formatFileSize(1023)).toBe('1023 Bytes');
    });

    it('should format kilobytes', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10 KB');
    });

    it('should format megabytes', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB');
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10 MB');
    });

    it('should format gigabytes', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('should round to 2 decimal places', () => {
      expect(formatFileSize(1234)).toBe('1.21 KB');
      expect(formatFileSize(1234567)).toBe('1.18 MB');
    });

    it('should handle very small sizes', () => {
      expect(formatFileSize(1)).toBe('1 Bytes');
    });
  });
});
