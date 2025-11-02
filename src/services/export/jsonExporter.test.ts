/**
 * Unit tests for JSON exporter functions
 */

import { describe, expect, it } from 'vitest';
import { toJsonString } from './jsonExporter';
import type { ExportedData } from './types';

describe('jsonExporter', () => {
  describe('toJsonString', () => {
    it('should convert exported data to JSON string with pretty formatting', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, true);

      // Should be pretty-printed with indentation
      expect(result).toContain('\n');
      expect(result).toContain('  '); // Indentation
      expect(result).toContain('"version": "1.0"');
    });

    it('should convert exported data to compact JSON string', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, false);

      // Should be compact (no unnecessary whitespace)
      expect(result).not.toContain('\n  ');
      expect(result).toContain('{"version":"1.0"');
    });

    it('should handle complex nested data structures', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test Folder',
            type: 'template-folder',
            path: '/test-folder',
            items: [
              {
                name: 'Test Item',
                category: 'produce',
                sortOrder: 0,
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = toJsonString(data, true);

      expect(result).toContain('"Test Folder"');
      expect(result).toContain('"Test Item"');
      expect(result).toContain('"produce"');
    });

    it('should preserve date strings in ISO format', () => {
      const dateStr = '2024-11-01T12:00:00.000Z';
      const data: ExportedData = {
        version: '1.0',
        exportDate: dateStr,
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, false);

      expect(result).toContain(dateStr);
    });

    it('should handle empty folders array', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [],
      };

      const result = toJsonString(data, true);

      expect(result).toContain('"folders": []');
    });

    it('should handle optional fields correctly', () => {
      const data: ExportedData = {
        version: '1.0',
        exportDate: '2024-11-01T00:00:00.000Z',
        appVersion: '1.0.0',
        folders: [
          {
            name: 'Test',
            type: 'template-folder',
            path: '/test',
            items: [
              {
                name: 'Item',
                category: 'other',
                sortOrder: 0,
                // defaultQuantity is optional and not provided
              },
            ],
            sessions: [],
          },
        ],
      };

      const result = toJsonString(data, false);

      // Should not include undefined optional fields
      expect(JSON.parse(result)).toBeDefined();
      expect(result).toContain('"name":"Item"');
    });
  });
});
