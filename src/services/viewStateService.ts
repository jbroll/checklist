/**
 * ViewState Service
 *
 * Manages per-user UI state (expand/collapse preferences). Ported off Jazz (slice-2) to mirror
 * `subscriptionService.ts`: every function is headless, taking the relational graph `g` as its
 * first argument. The state lives in the `user_settings` singleton row (one row whose `id` is the
 * user's id) in three json maps — `view_folder_expanded`, `view_template_category_expanded`,
 * `view_session_category_expanded`. No React, no Jazz account.
 *
 * Reads use optional-chaining designed defaults (folders default collapsed, categories default
 * expanded). Writes go through `requireSettings`, which hard-errors if the singleton row is
 * absent — the app provisions that row at account-init, so a missing row is a bug, NOT a
 * condition to paper over (NO FALLBACKS).
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { schema } from '@/schema/folder';
import { parseUserSettingsRow } from '@/schema/userSettingsData';
import type { UserSettingsRow } from '../../shared/schema.js';

type Graph = RelationalGraph<typeof schema>;

/** Read the per-user singleton settings row, or `undefined` for a brand-new user with no row yet. */
function readSettings(g: Graph): UserSettingsRow | undefined {
  const row = g.user_settings.all()[0]?.$data;
  return row ? parseUserSettingsRow(row) : undefined;
}

/** Read the singleton settings row, hard-erroring if absent (NO FALLBACKS — for write paths). */
function requireSettings(g: Graph): UserSettingsRow {
  const settings = readSettings(g);
  if (!settings) {
    throw new Error('user_settings row not initialized');
  }
  return settings;
}

// ============================================================================
// Folder Expanded State
// ============================================================================

/** Get whether a folder is expanded in the tree view (default: collapsed). */
export function getFolderExpanded(g: Graph, folderId: string): boolean {
  return readSettings(g)?.view_folder_expanded?.[folderId] ?? false;
}

/** Set whether a folder is expanded in the tree view. */
export async function setFolderExpanded(
  g: Graph,
  folderId: string,
  expanded: boolean,
): Promise<void> {
  const settings = requireSettings(g);
  await g.user_settings.update(settings.id, {
    view_folder_expanded: { ...settings.view_folder_expanded, [folderId]: expanded },
  });
}

/** Toggle folder expanded state. */
export async function toggleFolderExpanded(g: Graph, folderId: string): Promise<void> {
  await setFolderExpanded(g, folderId, !getFolderExpanded(g, folderId));
}

// ============================================================================
// Template Category Expanded State (for tree view)
// ============================================================================

/** Get whether a template category is expanded in the tree view (default: expanded). */
export function getTemplateCategoryExpanded(
  g: Graph,
  templateId: string,
  categoryId: string,
): boolean {
  const templateState = readSettings(g)?.view_template_category_expanded?.[templateId];
  if (!templateState) return true;
  return templateState[categoryId] ?? true;
}

/** Set whether a template category is expanded in the tree view. */
export async function setTemplateCategoryExpanded(
  g: Graph,
  templateId: string,
  categoryId: string,
  expanded: boolean,
): Promise<void> {
  const settings = requireSettings(g);
  const templateState = settings.view_template_category_expanded[templateId] || {};
  await g.user_settings.update(settings.id, {
    view_template_category_expanded: {
      ...settings.view_template_category_expanded,
      [templateId]: { ...templateState, [categoryId]: expanded },
    },
  });
}

/** Toggle template category expanded state in the tree view. */
export async function toggleTemplateCategoryExpanded(
  g: Graph,
  templateId: string,
  categoryId: string,
): Promise<void> {
  const current = getTemplateCategoryExpanded(g, templateId, categoryId);
  await setTemplateCategoryExpanded(g, templateId, categoryId, !current);
}

// ============================================================================
// Session Category Expanded State (for shopping sessions)
// ============================================================================

/** Get whether a category is expanded in a session (default: expanded). */
export function getSessionCategoryExpanded(
  g: Graph,
  sessionId: string,
  categoryKey: string,
): boolean {
  const sessionState = readSettings(g)?.view_session_category_expanded?.[sessionId];
  if (!sessionState) return true;
  return sessionState[categoryKey] ?? true;
}

/** Set whether a category is expanded in a session. */
export async function setSessionCategoryExpanded(
  g: Graph,
  sessionId: string,
  categoryKey: string,
  expanded: boolean,
): Promise<void> {
  const settings = requireSettings(g);
  const sessionState = settings.view_session_category_expanded[sessionId] || {};
  await g.user_settings.update(settings.id, {
    view_session_category_expanded: {
      ...settings.view_session_category_expanded,
      [sessionId]: { ...sessionState, [categoryKey]: expanded },
    },
  });
}

/** Toggle category expanded state in a session. */
export async function toggleSessionCategoryExpanded(
  g: Graph,
  sessionId: string,
  categoryKey: string,
): Promise<void> {
  const current = getSessionCategoryExpanded(g, sessionId, categoryKey);
  await setSessionCategoryExpanded(g, sessionId, categoryKey, !current);
}

/** Expand all specified categories in a session. */
export async function expandAllSessionCategories(
  g: Graph,
  sessionId: string,
  categoryKeys: string[],
): Promise<void> {
  const settings = requireSettings(g);
  const expandedState: Record<string, boolean> = {};
  for (const key of categoryKeys) {
    expandedState[key] = true;
  }
  await g.user_settings.update(settings.id, {
    view_session_category_expanded: {
      ...settings.view_session_category_expanded,
      [sessionId]: expandedState,
    },
  });
}

/** Collapse all specified categories in a session. */
export async function collapseAllSessionCategories(
  g: Graph,
  sessionId: string,
  categoryKeys: string[],
): Promise<void> {
  const settings = requireSettings(g);
  const expandedState: Record<string, boolean> = {};
  for (const key of categoryKeys) {
    expandedState[key] = false;
  }
  await g.user_settings.update(settings.id, {
    view_session_category_expanded: {
      ...settings.view_session_category_expanded,
      [sessionId]: expandedState,
    },
  });
}

// ============================================================================
// Garbage Collection
// ============================================================================

/**
 * Clean up stale view-state entries that reference deleted folders/templates/sessions.
 * Run in the background after app startup. Returns zeros (and writes nothing) when the settings
 * row is absent — a brand-new user has no view state to clean.
 */
export async function cleanupViewState(
  g: Graph,
  validFolderIds: Set<string>,
  validTemplateIds: Set<string>,
  validSessionIds: Set<string>,
): Promise<{ foldersRemoved: number; templatesRemoved: number; sessionsRemoved: number }> {
  const settings = readSettings(g);
  if (!settings) {
    return { foldersRemoved: 0, templatesRemoved: 0, sessionsRemoved: 0 };
  }

  let foldersRemoved = 0;
  let templatesRemoved = 0;
  let sessionsRemoved = 0;
  const changes: Partial<UserSettingsRow> = {};

  const cleanedFolders: Record<string, boolean> = {};
  for (const [folderId, expanded] of Object.entries(settings.view_folder_expanded)) {
    if (validFolderIds.has(folderId)) {
      cleanedFolders[folderId] = expanded;
    } else {
      foldersRemoved++;
    }
  }
  if (foldersRemoved > 0) changes.view_folder_expanded = cleanedFolders;

  const cleanedTemplates: Record<string, Record<string, boolean>> = {};
  for (const [templateId, categoryState] of Object.entries(
    settings.view_template_category_expanded,
  )) {
    if (validTemplateIds.has(templateId)) {
      cleanedTemplates[templateId] = categoryState;
    } else {
      templatesRemoved++;
    }
  }
  if (templatesRemoved > 0) changes.view_template_category_expanded = cleanedTemplates;

  const cleanedSessions: Record<string, Record<string, boolean>> = {};
  for (const [sessionId, categoryState] of Object.entries(
    settings.view_session_category_expanded,
  )) {
    if (validSessionIds.has(sessionId)) {
      cleanedSessions[sessionId] = categoryState;
    } else {
      sessionsRemoved++;
    }
  }
  if (sessionsRemoved > 0) changes.view_session_category_expanded = cleanedSessions;

  if (Object.keys(changes).length > 0) {
    await g.user_settings.update(settings.id, changes);
  }

  return { foldersRemoved, templatesRemoved, sessionsRemoved };
}
