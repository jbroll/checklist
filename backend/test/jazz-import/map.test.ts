import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExportUser } from '../../../migration/jazz-export/src/format.js';
import { planUser } from '../../scripts/jazz-import/map.js';

const fixture = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, 'fixtures/backup', name), 'utf8')) as ExportUser;

const orderOf = (map: Record<string, { __order: string }>) =>
  Object.entries(map).sort(([, a], [, b]) => (a.__order < b.__order ? -1 : 1)).map(([id]) => id);

describe('planUser', () => {
  const plan = planUser(fixture('user-owner.json'));
  const byId = new Map(plan.folders.map((f) => [f.id, f]));

  it('writes owned folders parents before children and skips foreign subtrees', () => {
    expect(plan.folders.map((f) => f.id)).toEqual(['F1', 'T1', 'F2', 'T2']);
    expect(byId.get('T2')?.parent_id).toBe('F2');
    expect(byId.get('F1')?.parent_id).toBeNull();
    expect(plan.notCarried.foreignFolders).toEqual(['S1']);
    expect(plan.notCarried.ownedUnderForeign).toEqual(['S2']);
  });

  it('remaps created_by to the user id and dates to epoch-ms', () => {
    const t1 = byId.get('T1');
    expect(t1?.created_by).toBe('user-owner');
    expect(typeof t1?.created_at).toBe('number');
    expect(Object.values(t1?.items ?? {}).every((i) => typeof i.createdAt === 'number')).toBe(true);
  });

  it('orders items by sortOrder then createdAt and sessions by createdAt', () => {
    const t1 = byId.get('T1');
    expect(orderOf(t1?.items ?? {})).toEqual(['item-a', 'item-b', 'item-c']);
    expect(orderOf(t1?.sessions ?? {})).toEqual(['session-old', 'session-new']);
  });

  it('keeps notes, archived items and archived sessions', () => {
    const t1 = byId.get('T1');
    const items = Object.values(t1?.items ?? {});
    expect(items.some((i) => i.notes !== undefined)).toBe(true);
    expect(items.some((i) => i.archived)).toBe(true);
    const sessions = Object.values(t1?.sessions ?? {});
    expect(sessions.some((s) => s.archived)).toBe(true);
    const state = sessions.flatMap((s) => Object.values(s.itemStates)).find((st) => st.notes !== undefined);
    expect(typeof state?.selectedAt).toBe('number');
    expect(typeof state?.checkedAt).toBe('number');
  });

  it('fills app defaults for missing optionals', () => {
    expect(byId.get('T2')).toMatchObject({
      items: {},
      sessions: {},
      default_items: {},
      show_zone_headings: false,
      auto_categorize_enabled: false,
      autocomplete_domain: 'none',
      expanded: false,
    });
    expect(byId.get('F1')?.archived).toBe(false);
  });

  it('reports what it cannot carry', () => {
    expect(plan.notCarried.archivedAt).toEqual(['F2']);
    expect(plan.notCarried.siblingOrderParents).toBe(1); // F1 has T1 and F2; root has only F1 imported
  });

  it('maps user settings and view state onto the singleton row', () => {
    expect(plan.userSettings).toMatchObject({
      id: 'user-owner',
      owner_group_id: 'user-owner',
      enable_auto_categorization: false,
      subscription_tier: 'plus',
      subscription_status: 'beta',
      default_autocomplete_domain: 'none',
      max_lists: 3,
      session_retention_days: -1,
      subscription_ends_at: 0,
      subscription_synced_at: 0,
      view_folder_expanded: { F1: true },
      view_template_category_expanded: { T1: { c: true } },
      view_session_category_expanded: {},
    });
  });

  it('counts what it will write', () => {
    expect(plan.counts).toEqual({ folders: 4, items: 3, sessions: 2 });
  });

  it('builds default settings when the export has none', () => {
    const other = planUser(fixture('user-other.json'));
    expect(other.folders.map((f) => f.id)).toEqual(['S1']);
    expect(other.userSettings).toMatchObject({ id: 'user-other', enable_auto_categorization: true, view_folder_expanded: {} });
  });

  it('reports 0 duplicate ids for the fixture user', () => {
    expect(plan.notCarried.duplicateItemIds).toBe(0);
    expect(plan.notCarried.duplicateSessionIds).toBe(0);
  });

  it('preserves an explicit sessionRetentionDays from the export instead of defaulting to unlimited', () => {
    const withRetention: ExportUser = {
      userId: 'user-retention',
      accountId: 'co_zRetention',
      rootFolderIds: [],
      folders: [],
      userSettings: { sessionRetentionDays: 14 },
      viewState: null,
    };
    const retentionPlan = planUser(withRetention);
    expect(retentionPlan.userSettings.session_retention_days).toBe(14);
  });
});

describe('planUser duplicate ids', () => {
  const dupUser: ExportUser = {
    userId: 'user-dup',
    accountId: 'co_zDup',
    rootFolderIds: ['T1'],
    folders: [
      {
        id: 'T1',
        parentId: null,
        childIds: [],
        ownerAccountId: 'co_zDup',
        groupId: 'co_zDup',
        members: [{ accountId: 'co_zDup', role: 'admin' }],
        name: 'Dup List',
        type: 'template-folder',
        sharingMode: 'private',
        createdBy: 'co_zDup',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        items: [
          {
            id: 'item-dup',
            name: 'First',
            type: 'item',
            path: '',
            expanded: false,
            sortOrder: 0,
            archived: false,
            defaultQuantity: '1',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'item-dup',
            name: 'Second',
            type: 'item',
            path: '',
            expanded: false,
            sortOrder: 1,
            archived: false,
            defaultQuantity: '1',
            createdAt: '2024-01-02T00:00:00.000Z',
          },
        ],
        sessions: [
          {
            id: 'session-dup',
            itemStates: {},
            archived: false,
            categoryExpanded: {},
            viewMode: 'flat',
            selectedCount: 0,
            checkedCount: 0,
            remainingCount: 0,
            createdAt: '2024-02-01T00:00:00.000Z',
            lastActivityAt: '2024-02-01T00:00:00.000Z',
          },
          {
            id: 'session-dup',
            itemStates: {},
            archived: false,
            categoryExpanded: {},
            viewMode: 'flat',
            selectedCount: 0,
            checkedCount: 0,
            remainingCount: 0,
            createdAt: '2024-02-02T00:00:00.000Z',
            lastActivityAt: '2024-02-02T00:00:00.000Z',
          },
        ],
      },
    ],
    userSettings: null,
    viewState: null,
  };

  it('counts elements lost to duplicate item and session ids within a folder', () => {
    const plan = planUser(dupUser);
    expect(plan.notCarried.duplicateItemIds).toBe(1);
    expect(plan.notCarried.duplicateSessionIds).toBe(1);
  });
});

describe('planUser legacy folder defaults', () => {
  // Folders created before the Jazz app wrote type/sharingMode/createdBy, matching the prod
  // export findings: no `type`, no `sharingMode`, no `createdBy`, but with items.
  const legacyUser: ExportUser = {
    userId: 'user-legacy',
    accountId: 'co_zLegacy',
    rootFolderIds: ['no-type-with-items', 'no-type-no-items', 'no-sharing-mode', 'explicit'],
    folders: [
      {
        id: 'no-type-with-items',
        parentId: null,
        childIds: [],
        ownerAccountId: 'co_zLegacy',
        groupId: 'co_zLegacy',
        members: [],
        name: 'ToDo',
        sharingMode: 'private',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: [],
      },
      {
        id: 'no-type-no-items',
        parentId: null,
        childIds: [],
        ownerAccountId: 'co_zLegacy',
        groupId: 'co_zLegacy',
        members: [],
        name: 'Organizer',
        sharingMode: 'private',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'no-sharing-mode',
        parentId: null,
        childIds: [],
        ownerAccountId: 'co_zLegacy',
        groupId: 'co_zLegacy',
        members: [],
        name: 'Untyped Sharing',
        type: 'folder',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'explicit',
        parentId: null,
        childIds: [],
        ownerAccountId: 'co_zLegacy',
        groupId: 'co_zLegacy',
        members: [],
        name: 'Shopping',
        type: 'template-folder',
        sharingMode: 'shared',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        items: [],
      },
    ],
    userSettings: null,
    viewState: null,
  };

  const plan = planUser(legacyUser);
  const byId = new Map(plan.folders.map((f) => [f.id, f]));

  it('defaults a typeless folder with an items array to template-folder', () => {
    expect(byId.get('no-type-with-items')?.type).toBe('template-folder');
  });

  it('defaults a typeless folder with no items key to folder', () => {
    expect(byId.get('no-type-no-items')?.type).toBe('folder');
  });

  it('defaults a missing sharingMode to private', () => {
    expect(byId.get('no-sharing-mode')?.sharing_mode).toBe('private');
  });

  it('keeps an explicit type and sharingMode unchanged', () => {
    expect(byId.get('explicit')).toMatchObject({ type: 'template-folder', sharing_mode: 'shared' });
  });

  it('counts defaulted type and sharingMode per user', () => {
    expect(plan.notCarried.defaultedType).toBe(2);
    expect(plan.notCarried.defaultedSharingMode).toBe(1);
  });
});
