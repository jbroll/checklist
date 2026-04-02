/**
 * Unit tests for file content validation (security: MIME type / magic number checks)
 */

import { describe, expect, it } from 'vitest';
import { validateFileContent } from './fileUpload';

describe('validateFileContent', () => {
  describe('binary detection', () => {
    it('should reject files containing null bytes', async () => {
      const binary = new File(['hello\0world'], 'sneaky.json', { type: 'application/json' });
      const result = await validateFileContent(binary, 'json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('binary');
    });

    it('should accept normal text files', async () => {
      const text = new File(['hello world'], 'data.txt', { type: 'text/plain' });
      const result = await validateFileContent(text, 'txt');
      expect(result.valid).toBe(true);
    });
  });

  describe('JSON content validation', () => {
    it('should accept JSON starting with {', async () => {
      const file = new File(['{"key": "value"}'], 'data.json', { type: 'application/json' });
      const result = await validateFileContent(file, 'json');
      expect(result.valid).toBe(true);
    });

    it('should accept JSON starting with [', async () => {
      const file = new File(['[1, 2, 3]'], 'data.json', { type: 'application/json' });
      const result = await validateFileContent(file, 'json');
      expect(result.valid).toBe(true);
    });

    it('should accept JSON with leading whitespace', async () => {
      const file = new File(['  \n  {"key": "value"}'], 'data.json', { type: 'application/json' });
      const result = await validateFileContent(file, 'json');
      expect(result.valid).toBe(true);
    });

    it('should reject non-JSON content in a .json file', async () => {
      const file = new File(['This is not JSON at all'], 'data.json', { type: 'application/json' });
      const result = await validateFileContent(file, 'json');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('JSON');
    });

    it('should reject HTML disguised as JSON', async () => {
      const file = new File(['<html><body>hi</body></html>'], 'page.json', {
        type: 'application/json',
      });
      const result = await validateFileContent(file, 'json');
      expect(result.valid).toBe(false);
    });

    it('should reject XML disguised as JSON', async () => {
      const file = new File(['<?xml version="1.0"?><root/>'], 'data.json', {
        type: 'application/json',
      });
      const result = await validateFileContent(file, 'json');
      expect(result.valid).toBe(false);
    });
  });

  describe('CSV content validation', () => {
    it('should accept valid CSV content', async () => {
      const file = new File(['name,quantity\napple,3\nbanana,2'], 'data.csv', {
        type: 'text/csv',
      });
      const result = await validateFileContent(file, 'csv');
      expect(result.valid).toBe(true);
    });

    it('should not apply JSON checks to CSV files', async () => {
      const file = new File(['This is plain text, not JSON'], 'data.csv', { type: 'text/csv' });
      const result = await validateFileContent(file, 'csv');
      expect(result.valid).toBe(true);
    });
  });

  describe('TXT content validation', () => {
    it('should accept plain text content', async () => {
      const file = new File(['Just some text'], 'list.txt', { type: 'text/plain' });
      const result = await validateFileContent(file, 'txt');
      expect(result.valid).toBe(true);
    });

    it('should accept empty text files', async () => {
      const file = new File([''], 'empty.txt', { type: 'text/plain' });
      const result = await validateFileContent(file, 'txt');
      expect(result.valid).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty JSON file', async () => {
      const file = new File([''], 'empty.json', { type: 'application/json' });
      const result = await validateFileContent(file, 'json');
      // Empty file has no { or [ so should fail JSON check
      expect(result.valid).toBe(false);
    });

    it('should handle whitespace-only JSON file', async () => {
      const file = new File(['   \n\t  '], 'spaces.json', { type: 'application/json' });
      const result = await validateFileContent(file, 'json');
      expect(result.valid).toBe(false);
    });
  });
});
