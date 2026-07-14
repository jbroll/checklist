/**
 * Unit tests for user settings service (rowboat port, slice-2)
 *
 * GLOBAL settings live in the `user_settings` singleton row (`default_autocomplete_domain` /
 * `enable_auto_categorization`); PER-TEMPLATE settings live on the FOLDER row itself
 * (`autocomplete_domain` / `auto_categorize_enabled`). Tests run against an in-memory
 * `makeGraph()` graph — no Jazz, no React. The Jazz per-folder → global "inheritance" is gone: a
 * folder's own column value IS the setting.
 */

import { describe, expect, it } from 'vitest';
import type { FolderRow } from '@/schema/folder';
import { makeGraph } from '@/test/rowboat';
import type { UserSettingsRow } from '../../shared/schema.js';
import {
  getDefaultAutocompleteDomain,
  getEnableAutoCategorization,
  getTemplateAutoCategorizeEnabled,
  getTemplateAutocompleteDomain,
  hasTemplateAutoCategorizeOverride,
  hasTemplateAutocompleteDomainSet,
  isTemplateAutocompleteEnabled,
  setDefaultAutocompleteDomain,
  setEnableAutoCategorization,
  setTemplateAutoCategorizeEnabled,
  setTemplateAutocompleteDomain,
  toggleEnableAutoCategorization,
  toggleTemplateAutoCategorize,
} from './userSettingsService';

type Graph = ReturnType<typeof makeGraph>;

interface SettingsInput {
  defaultAutocompleteDomain?: string;
  enableAutoCategorization?: boolean;
}

/** Build a complete user_settings singleton row (all columns present). */
function settingsRow(input: SettingsInput = {}): UserSettingsRow {
  return {
    id: 'u1',
    owner_group_id: 'g1',
    default_autocomplete_domain: input.defaultAutocompleteDomain ?? '',
    enable_auto_categorization: input.enableAutoCategorization ?? true,
    subscription_tier: 'free',
    subscription_status: 'beta',
    subscription_ends_at: 0,
    max_lists: 30,
    session_retention_days: 30,
    subscription_synced_at: 0,
    view_folder_expanded: {},
    view_template_category_expanded: {},
    view_session_category_expanded: {},
  };
}

interface FolderInput {
  id?: string;
  autocompleteDomain?: string;
  autoCategorizeEnabled?: boolean;
}

/** Build a complete template-folder row (all required Folder columns present). */
function folderRow(input: FolderInput = {}): FolderRow {
  const id = input.id ?? 'folder-1';
  return {
    id,
    owner_group_id: 'g1',
    name: `Template ${id}`,
    type: 'template-folder',
    parent_id: null,
    sharing_mode: 'private',
    archived: false,
    expanded: false,
    created_by: 'user-1',
    created_at: 0,
    updated_at: 0,
    items: [],
    sessions: [],
    default_items: {},
    show_zone_headings: false,
    auto_categorize_enabled: input.autoCategorizeEnabled ?? false,
    autocomplete_domain: input.autocompleteDomain ?? 'none',
  };
}

/** Graph seeded with a settings row. Omit for a brand-new user with no row. */
function graphWithSettings(input?: SettingsInput): Graph {
  return makeGraph(input ? { user_settings: [settingsRow(input)] } : {});
}

/** Graph seeded with a single folder row. */
function graphWithFolder(input: FolderInput = {}): Graph {
  return makeGraph({ folder: [folderRow(input)] });
}

function readSettings(g: Graph): UserSettingsRow {
  const node = g.user_settings.all()[0];
  if (!node) throw new Error('no user_settings row');
  return node.$data;
}

function readFolder(g: Graph, id: string): FolderRow {
  const node = g.folder(id);
  if (!node) throw new Error(`no folder ${id}`);
  return node.$data;
}

describe('userSettingsService', () => {
  describe('getDefaultAutocompleteDomain', () => {
    it('returns default "grocery" when no settings row', () => {
      expect(getDefaultAutocompleteDomain(graphWithSettings())).toBe('grocery');
    });

    it('returns default "grocery" when settings row has no domain set', () => {
      expect(
        getDefaultAutocompleteDomain(graphWithSettings({ defaultAutocompleteDomain: '' })),
      ).toBe('grocery');
    });

    it('returns set domain from settings row', () => {
      expect(
        getDefaultAutocompleteDomain(graphWithSettings({ defaultAutocompleteDomain: 'hardware' })),
      ).toBe('hardware');
    });
  });

  describe('setDefaultAutocompleteDomain', () => {
    it('writes the domain to the settings row', async () => {
      const g = graphWithSettings({});
      await setDefaultAutocompleteDomain(g, 'hardware');
      expect(readSettings(g).default_autocomplete_domain).toBe('hardware');
    });

    it('throws when settings row not initialized', async () => {
      await expect(setDefaultAutocompleteDomain(graphWithSettings(), 'grocery')).rejects.toThrow(
        'user_settings row not initialized',
      );
    });
  });

  describe('getEnableAutoCategorization', () => {
    it('returns true by default when no settings row', () => {
      expect(getEnableAutoCategorization(graphWithSettings())).toBe(true);
    });

    it('returns false when explicitly disabled', () => {
      expect(
        getEnableAutoCategorization(graphWithSettings({ enableAutoCategorization: false })),
      ).toBe(false);
    });

    it('returns true when explicitly enabled', () => {
      expect(
        getEnableAutoCategorization(graphWithSettings({ enableAutoCategorization: true })),
      ).toBe(true);
    });
  });

  describe('setEnableAutoCategorization', () => {
    it('sets enabled state on the settings row', async () => {
      const g = graphWithSettings({ enableAutoCategorization: true });
      await setEnableAutoCategorization(g, false);
      expect(readSettings(g).enable_auto_categorization).toBe(false);
    });

    it('throws when settings row not initialized', async () => {
      await expect(setEnableAutoCategorization(graphWithSettings(), false)).rejects.toThrow(
        'user_settings row not initialized',
      );
    });
  });

  describe('toggleEnableAutoCategorization', () => {
    it('toggles from true to false', async () => {
      const g = graphWithSettings({ enableAutoCategorization: true });
      await toggleEnableAutoCategorization(g);
      expect(readSettings(g).enable_auto_categorization).toBe(false);
    });

    it('toggles from false to true', async () => {
      const g = graphWithSettings({ enableAutoCategorization: false });
      await toggleEnableAutoCategorization(g);
      expect(readSettings(g).enable_auto_categorization).toBe(true);
    });
  });

  describe('getTemplateAutocompleteDomain', () => {
    it('returns "grocery" by default for a folder with no usable domain', () => {
      const g = graphWithFolder({ autocompleteDomain: '' });
      expect(getTemplateAutocompleteDomain(g, 'folder-1')).toBe('grocery');
    });

    it('returns the folder domain when set', () => {
      const g = graphWithFolder({ autocompleteDomain: 'hardware' });
      expect(getTemplateAutocompleteDomain(g, 'folder-1')).toBe('hardware');
    });

    it('returns "none" when folder domain is none', () => {
      const g = graphWithFolder({ autocompleteDomain: 'none' });
      expect(getTemplateAutocompleteDomain(g, 'folder-1')).toBe('none');
    });

    it('returns "grocery" for a missing folder', () => {
      expect(getTemplateAutocompleteDomain(makeGraph({}), 'missing')).toBe('grocery');
    });
  });

  describe('hasTemplateAutocompleteDomainSet', () => {
    it('returns false for the "none" default', () => {
      const g = graphWithFolder({ autocompleteDomain: 'none' });
      expect(hasTemplateAutocompleteDomainSet(g, 'folder-1')).toBe(false);
    });

    it('returns true when a real domain is set', () => {
      const g = graphWithFolder({ autocompleteDomain: 'hardware' });
      expect(hasTemplateAutocompleteDomainSet(g, 'folder-1')).toBe(true);
    });
  });

  describe('setTemplateAutocompleteDomain', () => {
    it('sets the domain on the folder', async () => {
      const g = graphWithFolder({ autocompleteDomain: 'none' });
      await setTemplateAutocompleteDomain(g, 'folder-1', 'hardware');
      expect(readFolder(g, 'folder-1').autocomplete_domain).toBe('hardware');
    });

    it('resets to the "none" default when set to undefined', async () => {
      const g = graphWithFolder({ autocompleteDomain: 'hardware' });
      await setTemplateAutocompleteDomain(g, 'folder-1', undefined);
      expect(readFolder(g, 'folder-1').autocomplete_domain).toBe('none');
    });
  });

  describe('isTemplateAutocompleteEnabled', () => {
    it('returns true for grocery domain', () => {
      expect(
        isTemplateAutocompleteEnabled(
          graphWithFolder({ autocompleteDomain: 'grocery' }),
          'folder-1',
        ),
      ).toBe(true);
    });

    it('returns true for hardware domain', () => {
      expect(
        isTemplateAutocompleteEnabled(
          graphWithFolder({ autocompleteDomain: 'hardware' }),
          'folder-1',
        ),
      ).toBe(true);
    });

    it('returns true for all domain', () => {
      expect(
        isTemplateAutocompleteEnabled(graphWithFolder({ autocompleteDomain: 'all' }), 'folder-1'),
      ).toBe(true);
    });

    it('returns false for none domain', () => {
      expect(
        isTemplateAutocompleteEnabled(graphWithFolder({ autocompleteDomain: 'none' }), 'folder-1'),
      ).toBe(false);
    });

    it('returns true for a missing folder (grocery default)', () => {
      expect(isTemplateAutocompleteEnabled(makeGraph({}), 'missing')).toBe(true);
    });
  });

  describe('getTemplateAutoCategorizeEnabled', () => {
    it('returns the folder value (default false)', () => {
      const g = graphWithFolder({ autoCategorizeEnabled: false });
      expect(getTemplateAutoCategorizeEnabled(g, 'folder-1')).toBe(false);
    });

    it('returns true when enabled on the folder', () => {
      const g = graphWithFolder({ autoCategorizeEnabled: true });
      expect(getTemplateAutoCategorizeEnabled(g, 'folder-1')).toBe(true);
    });

    it('returns false for a missing folder', () => {
      expect(getTemplateAutoCategorizeEnabled(makeGraph({}), 'missing')).toBe(false);
    });
  });

  describe('hasTemplateAutoCategorizeOverride', () => {
    it('returns false when not enabled', () => {
      const g = graphWithFolder({ autoCategorizeEnabled: false });
      expect(hasTemplateAutoCategorizeOverride(g, 'folder-1')).toBe(false);
    });

    it('returns true when enabled', () => {
      const g = graphWithFolder({ autoCategorizeEnabled: true });
      expect(hasTemplateAutoCategorizeOverride(g, 'folder-1')).toBe(true);
    });
  });

  describe('setTemplateAutoCategorizeEnabled', () => {
    it('sets enabled state on the folder', async () => {
      const g = graphWithFolder({ autoCategorizeEnabled: false });
      await setTemplateAutoCategorizeEnabled(g, 'folder-1', true);
      expect(readFolder(g, 'folder-1').auto_categorize_enabled).toBe(true);
    });

    it('resets to the false default when set to undefined', async () => {
      const g = graphWithFolder({ autoCategorizeEnabled: true });
      await setTemplateAutoCategorizeEnabled(g, 'folder-1', undefined);
      expect(readFolder(g, 'folder-1').auto_categorize_enabled).toBe(false);
    });
  });

  describe('toggleTemplateAutoCategorize', () => {
    it('toggles enabled true to false', async () => {
      const g = graphWithFolder({ autoCategorizeEnabled: true });
      await toggleTemplateAutoCategorize(g, 'folder-1');
      expect(readFolder(g, 'folder-1').auto_categorize_enabled).toBe(false);
    });

    it('toggles disabled false to true', async () => {
      const g = graphWithFolder({ autoCategorizeEnabled: false });
      await toggleTemplateAutoCategorize(g, 'folder-1');
      expect(readFolder(g, 'folder-1').auto_categorize_enabled).toBe(true);
    });
  });
});
