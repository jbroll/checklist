/**
 * Round-trip test: `exportAllFolders` → `importJson` into a fresh graph must preserve
 * everything in the rowboat schema — the folder tree (organizational + template, nesting,
 * archived flags), item notes, session ids/notes/categoryExpanded, per-folder settings,
 * `default_items`, and the `user_settings` row.
 */

import { describe, expect, it } from 'vitest';
import { parseUserSettingsRow } from '@/schema/userSettingsData';
import { makeGraph } from '@/test/rowboat';
import type { FolderRow, SessionData, TemplateItem, UserSettingsRow } from '../../shared/schema.js';
import { PATH_SEPARATOR } from '../utils/pathUtils';
import { exportAllFolders } from './export/jsonExporter';
import * as folderOps from './folderOps';
import { importJson, type JsonImportContext } from './import/jsonImporter';

const NOV_1 = new Date('2024-11-01T00:00:00.000Z').getTime();

function item(
  id: string,
  name: string,
  type: 'category' | 'item',
  path: string,
  sortOrder: number,
  extra: Partial<TemplateItem> = {},
): TemplateItem {
  return {
    id,
    name,
    type,
    path,
    expanded: type === 'category',
    sortOrder,
    archived: false,
    defaultQuantity: '',
    createdAt: NOV_1,
    ...extra,
  };
}

function session(
  id: string,
  itemStates: SessionData['itemStates'],
  extra: Partial<SessionData> = {},
): SessionData {
  return {
    id,
    itemStates,
    archived: false,
    categoryExpanded: {},
    viewMode: 'flat',
    selectedCount: 0,
    checkedCount: 0,
    remainingCount: 0,
    createdAt: NOV_1,
    lastActivityAt: NOV_1,
    ...extra,
  };
}

function folder(
  id: string,
  name: string,
  type: 'folder' | 'template-folder',
  extra: Partial<FolderRow> = {},
): FolderRow {
  return {
    id,
    owner_group_id: 'group-1',
    name,
    type,
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: NOV_1,
    updated_at: NOV_1,
    items: [],
    sessions: [],
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
    ...extra,
  };
}

function settingsRow(id: string, extra: Partial<UserSettingsRow> = {}): UserSettingsRow {
  return {
    id,
    owner_group_id: id,
    default_autocomplete_domain: 'none',
    enable_auto_categorization: true,
    subscription_tier: 'free',
    subscription_status: 'beta',
    subscription_ends_at: 0,
    max_lists: 3,
    session_retention_days: 30,
    subscription_synced_at: 0,
    view_folder_expanded: {},
    view_template_category_expanded: {},
    view_session_category_expanded: {},
    ...extra,
  };
}

function ctx(): JsonImportContext {
  return { createdBy: 'user-1', mintGroup: async () => 'group-new' };
}

describe('JSON export → import round trip', () => {
  it('preserves the full schema: tree, notes, sessions, settings, user_settings', async () => {
    const g = makeGraph({
      folder: [
        folder('org-1', 'Home', 'folder'),
        folder('archived-org', 'Old Projects', 'folder', { archived: true }),
        folder('tpl-1', 'Groceries', 'template-folder', {
          parent_id: 'org-1',
          items: [
            item('cat-1', 'Produce', 'category', 'Produce', 0, { notes: 'organic only' }),
            item('item-1', 'Apples', 'item', `Produce${PATH_SEPARATOR}Apples`, 0, {
              defaultQuantity: '5 lbs',
              notes: 'granny smith',
            }),
          ],
          sessions: [
            session(
              'session-1',
              { 'item-1': { selected: true, checked: true, notes: 'bought 3' } },
              {
                categoryExpanded: { 'cat-1': true },
                viewMode: 'zone-in-hierarchy',
                selectedCount: 1,
                checkedCount: 1,
                remainingCount: 0,
              },
            ),
          ],
          default_items: { 'item-1': true },
          show_zone_headings: true,
          autocomplete_domain: 'grocery',
          auto_categorize_enabled: true,
        }),
        folder('tpl-2', 'Tools', 'template-folder', { parent_id: 'archived-org' }),
      ],
      user_settings: [
        settingsRow('user-1', {
          default_autocomplete_domain: 'grocery',
          enable_auto_categorization: true,
          subscription_tier: 'plus',
          subscription_status: 'active',
          subscription_ends_at: 1767225600000,
          max_lists: 50,
          session_retention_days: 365,
          subscription_synced_at: 1730419200000,
          view_folder_expanded: { 'org-1': true },
        }),
      ],
    });

    const exported = exportAllFolders(g);
    expect(exported.version).toBe('2.1');

    const fresh = makeGraph();
    const result = await importJson(fresh, JSON.stringify(exported), ctx());
    expect(result.success).toBe(true);

    // Tree + identity: org folder, nesting, archived flags, both templates
    const org = folderOps.findById(fresh, 'org-1');
    const archivedOrg = folderOps.findById(fresh, 'archived-org');
    const tpl1 = folderOps.findById(fresh, 'tpl-1');
    const tpl2 = folderOps.findById(fresh, 'tpl-2');
    expect(org?.type).toBe('folder');
    expect(tpl1?.type).toBe('template-folder');
    expect(tpl1?.parent_id).toBe('org-1');
    expect(archivedOrg?.archived).toBe(true);
    expect(tpl2?.parent_id).toBe('archived-org');
    if (!tpl1) throw new Error('tpl-1 not found after import');

    // Items: notes + quantities survive
    const produce = tpl1.items.find((i) => i.name === 'Produce');
    const apples = tpl1.items.find((i) => i.name === 'Apples');
    expect(produce?.notes).toBe('organic only');
    expect(apples?.notes).toBe('granny smith');
    expect(apples?.defaultQuantity).toBe('5 lbs');
    if (!apples) throw new Error('Apples item not found after round trip');

    // Per-folder settings + default_items (remapped to imported item ids)
    expect(tpl1.show_zone_headings).toBe(true);
    expect(tpl1.autocomplete_domain).toBe('grocery');
    expect(tpl1.auto_categorize_enabled).toBe(true);
    expect(tpl1.default_items).toEqual({ [apples.id]: true });

    // Sessions: id reused, notes + categoryExpanded restored, itemStates remapped
    expect(tpl1.sessions).toHaveLength(1);
    const s = tpl1.sessions[0];
    expect(s.id).toBe('session-1');
    expect(s.categoryExpanded).toEqual({ 'cat-1': true });
    expect(s.viewMode).toBe('zone-in-hierarchy');
    expect(s.itemStates[apples.id].selected).toBe(true);
    expect(s.itemStates[apples.id].checked).toBe(true);
    expect(s.itemStates[apples.id].notes).toBe('bought 3');

    // user_settings merged into the fresh graph's row
    const settings = parseUserSettingsRow(fresh.user_settings.all()[0].$data);
    expect(settings.default_autocomplete_domain).toBe('grocery');
    expect(settings.enable_auto_categorization).toBe(true);
    expect(settings.view_folder_expanded).toEqual({ 'org-1': true });
    // subscription cache preserved too — a backup round trip restores the full row
    expect(settings.subscription_tier).toBe('plus');
    expect(settings.subscription_status).toBe('active');
    expect(settings.subscription_ends_at).toBe(1767225600000);
    expect(settings.max_lists).toBe(50);
    expect(settings.session_retention_days).toBe(365);
    expect(settings.subscription_synced_at).toBe(1730419200000);
  });
});
