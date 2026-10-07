import { describe, expect, it } from 'vitest';
import type { FolderRow, SessionData } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import { exportAllFolders, toJsonString } from '../export/jsonExporter';
import type { ExportedData } from '../export/types';
import * as folderOps from '../folderOps';
import { importJson, type JsonImportContext } from './jsonImporter';

const NOV_1_ISO = '2024-11-01T00:00:00.000Z';

const ctx: JsonImportContext = { createdBy: 'user-1', mintGroup: async () => 'group-new' };

function session(extra: Partial<SessionData> = {}): SessionData {
  return {
    id: 'session-1',
    itemStates: {},
    archived: false,
    categoryExpanded: {},
    viewMode: 'flat',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: 1_700_000_000_000,
    lastActivityAt: 1_700_000_000_000,
    ...extra,
  };
}

function templateFolder(sessions: SessionData[]): FolderRow {
  return {
    id: 't1',
    owner_group_id: 'group-1',
    name: 'Groceries',
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: 0,
    updated_at: 0,
    items: [],
    sessions,
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
  };
}

function importedSessionName(g: ReturnType<typeof makeGraph>): string | undefined {
  const row = folderOps.findById(g, 't1');
  if (!row) throw new Error('folder t1 not found after import');
  return row.sessions[0].name;
}

describe('jsonImporter session names', () => {
  it('round-trips a user-set session name through export and import', async () => {
    const source = makeGraph({ folder: [templateFolder([session({ name: 'Party prep' })])] });

    const g = makeGraph();
    const result = await importJson(g, toJsonString(exportAllFolders(source)), ctx);

    expect(result.success).toBe(true);
    expect(importedSessionName(g)).toBe('Party prep');
  });

  it('leaves the session unnamed when the export carries only a generated name', async () => {
    const exportData: ExportedData = {
      version: '2.1',
      exportDate: NOV_1_ISO,
      appVersion: '1.0.0',
      folders: [
        {
          id: 't1',
          name: 'Groceries',
          type: 'template-folder',
          parentId: null,
          sessions: [
            {
              id: 'session-1',
              name: '2024-11-01',
              archived: false,
              viewMode: 'flat',
              itemStates: {},
              createdAt: NOV_1_ISO,
              lastActivityAt: NOV_1_ISO,
            },
          ],
          createdAt: NOV_1_ISO,
          updatedAt: NOV_1_ISO,
        },
      ],
    };

    const g = makeGraph();
    const result = await importJson(g, JSON.stringify(exportData), ctx);

    expect(result.success).toBe(true);
    expect(importedSessionName(g)).toBeUndefined();
  });
});
