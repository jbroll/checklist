/**
 * ViewState Service
 *
 * Manages per-user UI state (expand/collapse preferences) separately from
 * shared CoValues. This allows each user to have their own view preferences
 * without affecting collaborators.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { type AccountParam, ViewState } from '../schema';

// ============================================================================
// Folder Expanded State
// ============================================================================

/**
 * Get whether a folder is expanded in the tree view
 */
export function getFolderExpanded(account: AccountParam, folderId: string): boolean {
  const viewState = account?.root?.viewState;
  if (!viewState?.folderExpanded) return false; // Default to collapsed
  return viewState.folderExpanded[folderId] ?? false;
}

/**
 * Set whether a folder is expanded in the tree view
 */
export function setFolderExpanded(
  account: AccountParam,
  folderId: string,
  expanded: boolean,
): void {
  const viewState = ensureViewState(account);
  viewState.$jazz.set('folderExpanded', {
    ...viewState.folderExpanded,
    [folderId]: expanded,
  });
}

/**
 * Toggle folder expanded state
 */
export function toggleFolderExpanded(account: AccountParam, folderId: string): void {
  const current = getFolderExpanded(account, folderId);
  setFolderExpanded(account, folderId, !current);
}

// ============================================================================
// Template Category Expanded State (for tree view)
// ============================================================================

/**
 * Get whether a category is expanded in the tree view
 */
export function getTemplateCategoryExpanded(
  account: AccountParam,
  templateId: string,
  categoryId: string,
): boolean {
  const viewState = account?.root?.viewState;
  if (!viewState?.templateCategoryExpanded) return true; // Default to expanded
  const templateState = viewState.templateCategoryExpanded[templateId];
  if (!templateState) return true;
  return templateState[categoryId] ?? true;
}

/**
 * Set whether a category is expanded in the tree view
 */
export function setTemplateCategoryExpanded(
  account: AccountParam,
  templateId: string,
  categoryId: string,
  expanded: boolean,
): void {
  const viewState = ensureViewState(account);
  const templateState = viewState.templateCategoryExpanded?.[templateId] || {};
  viewState.$jazz.set('templateCategoryExpanded', {
    ...viewState.templateCategoryExpanded,
    [templateId]: {
      ...templateState,
      [categoryId]: expanded,
    },
  });
}

/**
 * Toggle category expanded state in tree view
 */
export function toggleTemplateCategoryExpanded(
  account: AccountParam,
  templateId: string,
  categoryId: string,
): void {
  const current = getTemplateCategoryExpanded(account, templateId, categoryId);
  setTemplateCategoryExpanded(account, templateId, categoryId, !current);
}

// ============================================================================
// Session Category Expanded State (for shopping sessions)
// ============================================================================

/**
 * Get whether a category is expanded in a session
 */
export function getSessionCategoryExpanded(
  account: AccountParam,
  sessionId: string,
  categoryKey: string,
): boolean {
  const viewState = account?.root?.viewState;
  if (!viewState?.sessionCategoryExpanded) return true; // Default to expanded
  const sessionState = viewState.sessionCategoryExpanded[sessionId];
  if (!sessionState) return true;
  return sessionState[categoryKey] ?? true;
}

/**
 * Set whether a category is expanded in a session
 */
export function setSessionCategoryExpanded(
  account: AccountParam,
  sessionId: string,
  categoryKey: string,
  expanded: boolean,
): void {
  const viewState = ensureViewState(account);
  const sessionState = viewState.sessionCategoryExpanded?.[sessionId] || {};
  viewState.$jazz.set('sessionCategoryExpanded', {
    ...viewState.sessionCategoryExpanded,
    [sessionId]: {
      ...sessionState,
      [categoryKey]: expanded,
    },
  });
}

/**
 * Toggle category expanded state in session
 */
export function toggleSessionCategoryExpanded(
  account: AccountParam,
  sessionId: string,
  categoryKey: string,
): void {
  const current = getSessionCategoryExpanded(account, sessionId, categoryKey);
  setSessionCategoryExpanded(account, sessionId, categoryKey, !current);
}

/**
 * Expand all categories in a session
 */
export function expandAllSessionCategories(
  account: AccountParam,
  sessionId: string,
  categoryKeys: string[],
): void {
  const viewState = ensureViewState(account);
  const expandedState: Record<string, boolean> = {};
  for (const key of categoryKeys) {
    expandedState[key] = true;
  }
  viewState.$jazz.set('sessionCategoryExpanded', {
    ...viewState.sessionCategoryExpanded,
    [sessionId]: expandedState,
  });
}

/**
 * Collapse all categories in a session
 */
export function collapseAllSessionCategories(
  account: AccountParam,
  sessionId: string,
  categoryKeys: string[],
): void {
  const viewState = ensureViewState(account);
  const expandedState: Record<string, boolean> = {};
  for (const key of categoryKeys) {
    expandedState[key] = false;
  }
  viewState.$jazz.set('sessionCategoryExpanded', {
    ...viewState.sessionCategoryExpanded,
    [sessionId]: expandedState,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Ensure viewState exists on account root, creating it if necessary
 */
function ensureViewState(account: AccountParam): InstanceOfSchema<typeof ViewState> {
  if (!account?.root) {
    throw new Error('Account root not initialized');
  }

  if (!account.root.viewState) {
    const viewState = ViewState.create(
      {
        folderExpanded: {},
        templateCategoryExpanded: {},
        sessionCategoryExpanded: {},
      },
      { owner: account },
    );
    account.root.$jazz.set('viewState', viewState);
  }

  // biome-ignore lint/style/noNonNullAssertion: viewState just created above
  return account.root.viewState!;
}

// ============================================================================
// Garbage Collection
// ============================================================================

/**
 * Clean up stale entries in viewState that reference deleted items.
 * This should be run in the background after app startup.
 */
export function cleanupViewState(
  account: AccountParam,
  validFolderIds: Set<string>,
  validTemplateIds: Set<string>,
  validSessionIds: Set<string>,
): { foldersRemoved: number; templatesRemoved: number; sessionsRemoved: number } {
  const viewState = account?.root?.viewState;
  if (!viewState) {
    return { foldersRemoved: 0, templatesRemoved: 0, sessionsRemoved: 0 };
  }

  let foldersRemoved = 0;
  let templatesRemoved = 0;
  let sessionsRemoved = 0;

  // Clean up folder expanded state
  if (viewState.folderExpanded) {
    const cleanedFolders: Record<string, boolean> = {};
    for (const [folderId, expanded] of Object.entries(viewState.folderExpanded)) {
      if (validFolderIds.has(folderId)) {
        cleanedFolders[folderId] = expanded as boolean;
      } else {
        foldersRemoved++;
      }
    }
    if (foldersRemoved > 0) {
      viewState.$jazz.set('folderExpanded', cleanedFolders);
    }
  }

  // Clean up template category expanded state
  if (viewState.templateCategoryExpanded) {
    const cleanedTemplates: Record<string, Record<string, boolean>> = {};
    for (const [templateId, categoryState] of Object.entries(viewState.templateCategoryExpanded)) {
      if (validTemplateIds.has(templateId)) {
        cleanedTemplates[templateId] = categoryState as Record<string, boolean>;
      } else {
        templatesRemoved++;
      }
    }
    if (templatesRemoved > 0) {
      viewState.$jazz.set('templateCategoryExpanded', cleanedTemplates);
    }
  }

  // Clean up session category expanded state
  if (viewState.sessionCategoryExpanded) {
    const cleanedSessions: Record<string, Record<string, boolean>> = {};
    for (const [sessionId, categoryState] of Object.entries(viewState.sessionCategoryExpanded)) {
      if (validSessionIds.has(sessionId)) {
        cleanedSessions[sessionId] = categoryState as Record<string, boolean>;
      } else {
        sessionsRemoved++;
      }
    }
    if (sessionsRemoved > 0) {
      viewState.$jazz.set('sessionCategoryExpanded', cleanedSessions);
    }
  }

  return { foldersRemoved, templatesRemoved, sessionsRemoved };
}
