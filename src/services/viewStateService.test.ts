/**
 * Unit tests for view state service (rowboat port, slice-2)
 *
 * View state lives in the `user_settings` singleton row's three json maps
 * (`view_folder_expanded`, `view_template_category_expanded`, `view_session_category_expanded`).
 * Tests run against an in-memory `makeGraph()` graph — no sync, no React. Reads use designed
 * defaults (folders default collapsed, categories default expanded); writes require the singleton
 * row and assert on the written column value.
 */

import { describe, expect, it } from 'vitest';
import { makeGraph } from '@/test/rowboat';
import type { UserSettingsRow } from '../../shared/schema.js';
import {
  cleanupViewState,
  collapseAllSessionCategories,
  expandAllSessionCategories,
  getFolderExpanded,
  getSessionCategoryExpanded,
  getTemplateCategoryExpanded,
  setFolderExpanded,
  setSessionCategoryExpanded,
  setTemplateCategoryExpanded,
  toggleFolderExpanded,
  toggleSessionCategoryExpanded,
  toggleTemplateCategoryExpanded,
} from './viewStateService';

type Graph = ReturnType<typeof makeGraph>;

interface ViewInput {
  folderExpanded?: Record<string, boolean>;
  templateCategoryExpanded?: Record<string, Record<string, boolean>>;
  sessionCategoryExpanded?: Record<string, Record<string, boolean>>;
}

/** Build a complete user_settings singleton row (all columns present) with optional view state. */
function settingsRow(view: ViewInput = {}): UserSettingsRow {
  return {
    id: 'u1',
    owner_group_id: 'g1',
    default_autocomplete_domain: 'none',
    enable_auto_categorization: true,
    subscription_tier: 'free',
    subscription_status: 'beta',
    subscription_ends_at: 0,
    max_lists: 30,
    session_retention_days: 30,
    subscription_synced_at: 0,
    view_folder_expanded: view.folderExpanded ?? {},
    view_template_category_expanded: view.templateCategoryExpanded ?? {},
    view_session_category_expanded: view.sessionCategoryExpanded ?? {},
  };
}

/** Graph seeded with a settings row carrying the given view state. */
function graphWith(view: ViewInput = {}): Graph {
  return makeGraph({ user_settings: [settingsRow(view)] });
}

/** Graph with NO settings row (brand-new user). */
function emptyGraph(): Graph {
  return makeGraph({});
}

/** Read the (single) user_settings row, hard-erroring if absent. */
function readSettings(g: Graph): UserSettingsRow {
  const node = g.user_settings.all()[0];
  if (!node) throw new Error('no user_settings row');
  return node.$data;
}

describe('viewStateService', () => {
  describe('getFolderExpanded', () => {
    it('returns false by default when no settings row', () => {
      expect(getFolderExpanded(emptyGraph(), 'folder-1')).toBe(false);
    });

    it('returns false for unknown folder', () => {
      const g = graphWith({ folderExpanded: { 'folder-1': true } });
      expect(getFolderExpanded(g, 'folder-unknown')).toBe(false);
    });

    it('returns true for expanded folder', () => {
      const g = graphWith({ folderExpanded: { 'folder-1': true } });
      expect(getFolderExpanded(g, 'folder-1')).toBe(true);
    });

    it('returns false for collapsed folder', () => {
      const g = graphWith({ folderExpanded: { 'folder-1': false } });
      expect(getFolderExpanded(g, 'folder-1')).toBe(false);
    });
  });

  describe('setFolderExpanded', () => {
    it('sets folder expanded state', async () => {
      const g = graphWith({ folderExpanded: {} });

      await setFolderExpanded(g, 'folder-1', true);

      expect(readSettings(g).view_folder_expanded).toEqual({ 'folder-1': true });
    });

    it('preserves other folder states', async () => {
      const g = graphWith({ folderExpanded: { 'folder-1': true } });

      await setFolderExpanded(g, 'folder-2', false);

      expect(readSettings(g).view_folder_expanded).toEqual({
        'folder-1': true,
        'folder-2': false,
      });
    });

    it('throws when settings row not initialized', async () => {
      await expect(setFolderExpanded(emptyGraph(), 'folder-1', true)).rejects.toThrow(
        'user_settings row not initialized',
      );
    });
  });

  describe('toggleFolderExpanded', () => {
    it('toggles from collapsed to expanded', async () => {
      const g = graphWith({ folderExpanded: { 'folder-1': false } });

      await toggleFolderExpanded(g, 'folder-1');

      expect(readSettings(g).view_folder_expanded).toEqual({ 'folder-1': true });
    });

    it('toggles from expanded to collapsed', async () => {
      const g = graphWith({ folderExpanded: { 'folder-1': true } });

      await toggleFolderExpanded(g, 'folder-1');

      expect(readSettings(g).view_folder_expanded).toEqual({ 'folder-1': false });
    });
  });

  describe('getTemplateCategoryExpanded', () => {
    it('returns true by default when no settings row', () => {
      expect(getTemplateCategoryExpanded(emptyGraph(), 'template-1', 'category-1')).toBe(true);
    });

    it('returns true for unknown template', () => {
      const g = graphWith({ templateCategoryExpanded: { 'template-1': { 'cat-1': false } } });
      expect(getTemplateCategoryExpanded(g, 'unknown', 'cat-1')).toBe(true);
    });

    it('returns true for unknown category in known template', () => {
      const g = graphWith({ templateCategoryExpanded: { 'template-1': { 'cat-1': false } } });
      expect(getTemplateCategoryExpanded(g, 'template-1', 'unknown')).toBe(true);
    });

    it('returns stored value', () => {
      const g = graphWith({ templateCategoryExpanded: { 'template-1': { 'cat-1': false } } });
      expect(getTemplateCategoryExpanded(g, 'template-1', 'cat-1')).toBe(false);
    });
  });

  describe('setTemplateCategoryExpanded', () => {
    it('creates nested structure for new template', async () => {
      const g = graphWith({});

      await setTemplateCategoryExpanded(g, 'template-1', 'cat-1', false);

      expect(readSettings(g).view_template_category_expanded).toEqual({
        'template-1': { 'cat-1': false },
      });
    });

    it('preserves other categories in template', async () => {
      const g = graphWith({ templateCategoryExpanded: { 'template-1': { 'cat-1': true } } });

      await setTemplateCategoryExpanded(g, 'template-1', 'cat-2', false);

      expect(readSettings(g).view_template_category_expanded).toEqual({
        'template-1': { 'cat-1': true, 'cat-2': false },
      });
    });
  });

  describe('toggleTemplateCategoryExpanded', () => {
    it('toggles category state', async () => {
      const g = graphWith({ templateCategoryExpanded: { 'template-1': { 'cat-1': true } } });

      await toggleTemplateCategoryExpanded(g, 'template-1', 'cat-1');

      expect(readSettings(g).view_template_category_expanded).toEqual({
        'template-1': { 'cat-1': false },
      });
    });
  });

  describe('getSessionCategoryExpanded', () => {
    it('returns true by default when no settings row', () => {
      expect(getSessionCategoryExpanded(emptyGraph(), 'session-1', 'zone-1')).toBe(true);
    });

    it('returns stored value', () => {
      const g = graphWith({ sessionCategoryExpanded: { 'session-1': { 'zone-1': false } } });
      expect(getSessionCategoryExpanded(g, 'session-1', 'zone-1')).toBe(false);
    });
  });

  describe('setSessionCategoryExpanded', () => {
    it('sets session category state', async () => {
      const g = graphWith({});

      await setSessionCategoryExpanded(g, 'session-1', 'zone-1', false);

      expect(readSettings(g).view_session_category_expanded).toEqual({
        'session-1': { 'zone-1': false },
      });
    });
  });

  describe('toggleSessionCategoryExpanded', () => {
    it('toggles session category state', async () => {
      const g = graphWith({ sessionCategoryExpanded: { 'session-1': { 'zone-1': true } } });

      await toggleSessionCategoryExpanded(g, 'session-1', 'zone-1');

      expect(readSettings(g).view_session_category_expanded).toEqual({
        'session-1': { 'zone-1': false },
      });
    });
  });

  describe('expandAllSessionCategories', () => {
    it('expands all specified categories', async () => {
      const g = graphWith({});

      await expandAllSessionCategories(g, 'session-1', ['zone-1', 'zone-2', 'zone-3']);

      expect(readSettings(g).view_session_category_expanded).toEqual({
        'session-1': { 'zone-1': true, 'zone-2': true, 'zone-3': true },
      });
    });

    it('preserves other sessions', async () => {
      const g = graphWith({ sessionCategoryExpanded: { 'session-other': { 'z-1': false } } });

      await expandAllSessionCategories(g, 'session-1', ['zone-1']);

      expect(readSettings(g).view_session_category_expanded).toEqual({
        'session-other': { 'z-1': false },
        'session-1': { 'zone-1': true },
      });
    });
  });

  describe('collapseAllSessionCategories', () => {
    it('collapses all specified categories', async () => {
      const g = graphWith({});

      await collapseAllSessionCategories(g, 'session-1', ['zone-1', 'zone-2']);

      expect(readSettings(g).view_session_category_expanded).toEqual({
        'session-1': { 'zone-1': false, 'zone-2': false },
      });
    });
  });

  describe('cleanupViewState', () => {
    it('returns zeros when no settings row', async () => {
      const result = await cleanupViewState(
        emptyGraph(),
        new Set(['f1']),
        new Set(['t1']),
        new Set(['s1']),
      );

      expect(result).toEqual({ foldersRemoved: 0, templatesRemoved: 0, sessionsRemoved: 0 });
    });

    it('removes stale folder entries', async () => {
      const g = graphWith({ folderExpanded: { 'valid-folder': true, 'stale-folder': true } });

      const result = await cleanupViewState(g, new Set(['valid-folder']), new Set(), new Set());

      expect(result.foldersRemoved).toBe(1);
      expect(readSettings(g).view_folder_expanded).toEqual({ 'valid-folder': true });
    });

    it('removes stale template entries', async () => {
      const g = graphWith({
        templateCategoryExpanded: {
          'valid-template': { cat: true },
          'stale-template': { cat: false },
        },
      });

      const result = await cleanupViewState(g, new Set(), new Set(['valid-template']), new Set());

      expect(result.templatesRemoved).toBe(1);
      expect(readSettings(g).view_template_category_expanded).toEqual({
        'valid-template': { cat: true },
      });
    });

    it('removes stale session entries', async () => {
      const g = graphWith({
        sessionCategoryExpanded: {
          'valid-session': { zone: true },
          'stale-session-1': { zone: false },
          'stale-session-2': { zone: true },
        },
      });

      const result = await cleanupViewState(g, new Set(), new Set(), new Set(['valid-session']));

      expect(result.sessionsRemoved).toBe(2);
      expect(readSettings(g).view_session_category_expanded).toEqual({
        'valid-session': { zone: true },
      });
    });

    it('handles empty valid sets (removes all)', async () => {
      const g = graphWith({
        folderExpanded: { f1: true, f2: false },
        templateCategoryExpanded: { t1: { c: true } },
        sessionCategoryExpanded: { s1: { z: true } },
      });

      const result = await cleanupViewState(g, new Set(), new Set(), new Set());

      expect(result.foldersRemoved).toBe(2);
      expect(result.templatesRemoved).toBe(1);
      expect(result.sessionsRemoved).toBe(1);
    });

    it('keeps all when all are valid', async () => {
      const g = graphWith({
        folderExpanded: { f1: true, f2: false },
        templateCategoryExpanded: { t1: { c: true } },
        sessionCategoryExpanded: { s1: { z: true } },
      });

      const result = await cleanupViewState(
        g,
        new Set(['f1', 'f2']),
        new Set(['t1']),
        new Set(['s1']),
      );

      expect(result.foldersRemoved).toBe(0);
      expect(result.templatesRemoved).toBe(0);
      expect(result.sessionsRemoved).toBe(0);
      // Nothing stale → the stored maps are left untouched.
      expect(readSettings(g).view_folder_expanded).toEqual({ f1: true, f2: false });
    });
  });
});
