import { describe, expect, it } from 'vitest';
import { applyPlan, type PlanWriter, type TenantFolder } from '../../scripts/jazz-import/apply-plan.js';
import type { FolderRowDraft, UserPlan } from '../../scripts/jazz-import/map.js';

const USER = 'user-a';

function draft(id: string, parentId: string | null = null): FolderRowDraft {
  return {
    id,
    name: `name-${id}`,
    type: 'folder',
    parent_id: parentId,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: USER,
    created_at: 0,
    updated_at: 0,
    items: {},
    sessions: {},
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: false,
    autocomplete_domain: 'none',
  };
}

// Root and Other at the top, Child under Root, Grandchild under Child: plan order is parents first.
const plan: UserPlan = {
  userId: USER,
  folders: [draft('Root'), draft('Child', 'Root'), draft('Grandchild', 'Child'), draft('Other')],
  userSettings: {
    id: USER,
    owner_group_id: USER,
    default_autocomplete_domain: 'none',
    enable_auto_categorization: true,
    subscription_tier: 'free',
    subscription_status: 'beta',
    subscription_ends_at: 0,
    max_lists: 0,
    session_retention_days: -1,
    subscription_synced_at: 0,
    view_folder_expanded: {},
    view_template_category_expanded: {},
    view_session_category_expanded: {},
  },
  notCarried: {
    siblingOrderParents: 0,
    archivedAt: [],
    foreignFolders: [],
    ownedUnderForeign: [],
    duplicateItemIds: 0,
    duplicateSessionIds: 0,
    defaultedType: 0,
    defaultedSharingMode: 0,
  },
  counts: { folders: 4, items: 0, sessions: 0 },
};

function live(id: string, overrides: Partial<TenantFolder> = {}): TenantFolder {
  const planned = plan.folders.find((f) => f.id === id);
  return {
    id,
    name: planned?.name ?? `name-${id}`,
    parent_id: planned?.parent_id ?? null,
    owner_group_id: `live-group-${id}`,
    created_by: USER,
    ...overrides,
  };
}

function recordingWriter() {
  const minted: (string | undefined)[] = [];
  const created: { id: string; owner_group_id: string }[] = [];
  const settings: string[] = [];
  const writer: PlanWriter = {
    async mintGroup(parentGroup) {
      minted.push(parentGroup);
      return `minted-${minted.length}`;
    },
    async createFolder(row) {
      created.push({ id: row.id, owner_group_id: row.owner_group_id });
    },
    async createUserSettings(row) {
      settings.push(row.id);
    },
  };
  return { writer, minted, created, settings };
}

describe('applyPlan', () => {
  it('on an empty tenant mints a group per folder under its parent group and creates every row', async () => {
    const w = recordingWriter();
    const result = await applyPlan(plan, { folders: [], hasUserSettings: false }, w.writer);

    expect(w.minted).toEqual([undefined, 'minted-1', 'minted-2', undefined]);
    expect(w.created).toEqual([
      { id: 'Root', owner_group_id: 'minted-1' },
      { id: 'Child', owner_group_id: 'minted-2' },
      { id: 'Grandchild', owner_group_id: 'minted-3' },
      { id: 'Other', owner_group_id: 'minted-4' },
    ]);
    expect(w.settings).toEqual([USER]);
    expect(result.existingFolders).toBe(0);
    expect(result.existingUserSettings).toBe(false);
    expect([...result.groups]).toEqual([
      ['Root', 'minted-1'],
      ['Child', 'minted-2'],
      ['Grandchild', 'minted-3'],
      ['Other', 'minted-4'],
    ]);
  });

  it('after a full import writes nothing and returns the live groups', async () => {
    const w = recordingWriter();
    const tenant = { folders: plan.folders.map((f) => live(f.id)), hasUserSettings: true };
    const result = await applyPlan(plan, tenant, w.writer);

    expect(w.minted).toEqual([]);
    expect(w.created).toEqual([]);
    expect(w.settings).toEqual([]);
    expect(result.existingFolders).toBe(4);
    expect(result.existingUserSettings).toBe(true);
    expect(result.groups.get('Grandchild')).toBe('live-group-Grandchild');
  });

  it('after a partial import creates only the missing folders, children under the live parent group', async () => {
    const w = recordingWriter();
    const tenant = { folders: [live('Root')], hasUserSettings: false };
    const result = await applyPlan(plan, tenant, w.writer);

    expect(w.minted).toEqual(['live-group-Root', 'minted-1', undefined]);
    expect(w.created.map((c) => c.id)).toEqual(['Child', 'Grandchild', 'Other']);
    expect(w.settings).toEqual([USER]);
    expect(result.existingFolders).toBe(1);
    expect(result.groups.get('Root')).toBe('live-group-Root');
    expect(result.groups.get('Child')).toBe('minted-1');
  });

  it('creates the user_settings row only when it is missing', async () => {
    const w = recordingWriter();
    await applyPlan(plan, { folders: [], hasUserSettings: true }, w.writer);
    expect(w.created).toHaveLength(4);
    expect(w.settings).toEqual([]);
  });

  it('ignores folders another user created, which a re-run sees once shares are granted', async () => {
    const w = recordingWriter();
    const tenant = {
      folders: [...plan.folders.map((f) => live(f.id)), live('SharedIn', { created_by: 'user-b' })],
      hasUserSettings: true,
    };
    const result = await applyPlan(plan, tenant, w.writer);
    expect(w.created).toEqual([]);
    expect(result.groups.has('SharedIn')).toBe(false);
  });

  it('fails on a live folder of this user that is not in the backup, writing nothing', async () => {
    const w = recordingWriter();
    const tenant = { folders: [live('Root'), live('Stray')], hasUserSettings: false };
    await expect(applyPlan(plan, tenant, w.writer)).rejects.toThrow(
      'user user-a folder Stray is in the tenant but not in the backup',
    );
    expect(w.minted).toEqual([]);
    expect(w.settings).toEqual([]);
  });

  it('fails on a live folder whose name differs from the backup', async () => {
    const w = recordingWriter();
    const tenant = { folders: [live('Root', { name: 'renamed' })], hasUserSettings: false };
    await expect(applyPlan(plan, tenant, w.writer)).rejects.toThrow(
      'user user-a folder Root in the tenant differs from the backup: name "renamed" parent_id null',
    );
    expect(w.minted).toEqual([]);
  });

  it('fails on a live folder whose parent differs from the backup', async () => {
    const w = recordingWriter();
    const tenant = { folders: [live('Root'), live('Child', { parent_id: 'Other' })], hasUserSettings: false };
    await expect(applyPlan(plan, tenant, w.writer)).rejects.toThrow(
      'user user-a folder Child in the tenant differs from the backup: name "name-Child" parent_id Other',
    );
  });

  it('fails on a live folder whose parent is missing, since its group hangs under a lost parent group', async () => {
    const w = recordingWriter();
    const tenant = { folders: [live('Child')], hasUserSettings: false };
    await expect(applyPlan(plan, tenant, w.writer)).rejects.toThrow(
      'user user-a folder Child is in the tenant but its parent Root is not',
    );
    expect(w.minted).toEqual([]);
  });
});
