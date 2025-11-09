/**
 * Template Service
 *
 * Pure functions for template operations (CRUD).
 * All Jazz database access for templates goes through this service.
 *
 * Folder structure is derived from template paths - no separate folder entities.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { type Account, Template } from '../schemas';
import { calculateDescendantPaths, calculateNewPath } from '../utils/pathUtils';
import { findEntityById } from './entityFinder';

/**
 * Derived folder structure from template paths
 */
export type DerivedFolder = {
  path: string;
  name: string;
  expanded: boolean;
  children: DerivedFolder[];
  templates: Array<InstanceOfSchema<typeof Template>>;
};

/**
 * Create a new template
 * @param account - User account
 * @param name - Template name
 * @param parentPath - Optional parent folder path (e.g., "stores" or "stores/wegmans")
 */
export function createTemplate(
  account: InstanceOfSchema<typeof Account>,
  name: string,
  parentPath?: string | null,
): string {
  if (!account.root) throw new Error('Account root not initialized');
  if (!account.root.templates)
    throw new Error(
      'Account root.templates not initialized - please clear browser data and log in again',
    );

  // Normalize name for path (replace spaces with hyphens)
  const normalizedName = name.trim().replace(/\s+/g, '-');

  // Construct path based on parent
  const path = parentPath ? `${parentPath}/${normalizedName}` : normalizedName;

  const newTemplate = Template.create(
    {
      name,
      path,
      archived: false,
      items: [],
      sessions: [],
      currentSessionId: undefined,
      showZoneHeadings: false,
      owner: account,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { owner: account },
  );

  account.root.templates.$jazz.push(newTemplate);
  return newTemplate.$jazz.id;
}

/**
 * Get template by ID
 */
export function getTemplate(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): InstanceOfSchema<typeof Template> | null {
  return findEntityById(account.root?.templates, templateId);
}

/**
 * Get all non-archived templates
 */
export function getAllTemplates(
  account: InstanceOfSchema<typeof Account>,
): Array<InstanceOfSchema<typeof Template>> {
  if (!account.root?.templates) return [];
  return account.root.templates.filter((t) => t && !t.archived) as Array<
    InstanceOfSchema<typeof Template>
  >;
}

/**
 * Rename a template
 */
export function renameTemplate(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
  newName: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  // Update name but keep the same path structure
  const pathParts = template.path.split('/');
  pathParts[pathParts.length - 1] = newName.trim().replace(/\s+/g, '-');
  const newPath = pathParts.join('/');

  template.$jazz.set('name', newName);
  template.$jazz.set('path', newPath);
  template.$jazz.set('updatedAt', new Date());
}

/**
 * Archive (soft delete) a template
 */
export function archiveTemplate(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): void {
  const template = getTemplate(account, templateId);
  if (!template) throw new Error(`Template ${templateId} not found`);

  template.$jazz.set('archived', true);
  template.$jazz.set('updatedAt', new Date());
}

/**
 * Check if template exists (and is not archived)
 */
export function templateExists(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): boolean {
  const template = getTemplate(account, templateId);
  return template != null && !template.archived;
}

/**
 * Move a template to a new parent location
 * @param account - User account
 * @param templateToMove - The template to move
 * @param newParentPath - New parent path (undefined for root level)
 */
export function moveTemplate(
  account: InstanceOfSchema<typeof Account>,
  templateToMove: InstanceOfSchema<typeof Template>,
  newParentPath: string | undefined,
): void {
  const oldPath = templateToMove.path;

  // Use pure function to calculate new path and validate
  const pathResult = calculateNewPath(templateToMove.name, oldPath, newParentPath);

  if (!pathResult.isValid) {
    if (pathResult.error === 'Already at this location') {
      return;
    }
    throw new Error(pathResult.error);
  }

  const newPath = pathResult.newPath;

  // Update the template's path
  templateToMove.$jazz.set('path', newPath);
  templateToMove.$jazz.set('updatedAt', new Date());
}

/**
 * Get all unique folder paths from templates
 * Returns array of folder paths (e.g., ["grocery-stores", "grocery-stores/wegmans"])
 */
export function getFolderPaths(
  account: InstanceOfSchema<typeof Account>,
): string[] {
  const templates = getAllTemplates(account);
  const folderPaths = new Set<string>();

  for (const template of templates) {
    const parts = template.path.split('/');
    // Add all parent paths (exclude the template name itself which is the last part)
    for (let i = 1; i < parts.length; i++) {
      folderPaths.add(parts.slice(0, i).join('/'));
    }
  }

  return Array.from(folderPaths).sort();
}

/**
 * Get templates at a specific folder path
 * @param folderPath - Path like "grocery-stores/wegmans" or undefined for root
 */
export function getTemplatesAtPath(
  account: InstanceOfSchema<typeof Account>,
  folderPath: string | undefined,
): Array<InstanceOfSchema<typeof Template>> {
  const templates = getAllTemplates(account);

  return templates.filter((template) => {
    const parts = template.path.split('/');
    const templateParentPath =
      parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;
    return templateParentPath === folderPath;
  });
}

/**
 * Build a hierarchical folder tree from template paths
 */
export function buildFolderTree(
  account: InstanceOfSchema<typeof Account>,
): DerivedFolder[] {
  const templates = getAllTemplates(account);
  const folderExpanded = account.root?.folderExpanded || {};

  // Build tree structure
  const rootFolders: DerivedFolder[] = [];
  const folderMap = new Map<string, DerivedFolder>();

  // First pass: create all folder nodes
  const allPaths = new Set<string>();
  for (const template of templates) {
    const parts = template.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      allPaths.add(parts.slice(0, i).join('/'));
    }
  }

  // Create folder objects
  for (const path of allPaths) {
    const parts = path.split('/');
    const name = parts[parts.length - 1];
    const expanded = folderExpanded[path] ?? true; // Default expanded

    const folder: DerivedFolder = {
      path,
      name,
      expanded,
      children: [],
      templates: [],
    };

    folderMap.set(path, folder);

    // Add to parent or root
    if (parts.length === 1) {
      rootFolders.push(folder);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = folderMap.get(parentPath);
      if (parent) {
        parent.children.push(folder);
      }
    }
  }

  // Second pass: add templates to their folders
  for (const template of templates) {
    const parts = template.path.split('/');
    if (parts.length === 1) {
      // Template at root - create a virtual folder for it
      const existing = rootFolders.find(f => f.path === parts[0]);
      if (!existing) {
        rootFolders.push({
          path: parts[0],
          name: parts[0],
          expanded: folderExpanded[parts[0]] ?? true,
          children: [],
          templates: [template],
        });
      }
    } else {
      const folderPath = parts.slice(0, -1).join('/');
      const folder = folderMap.get(folderPath);
      if (folder) {
        folder.templates.push(template);
      }
    }
  }

  // Sort folders and templates
  const sortItems = (items: DerivedFolder[]) => {
    items.sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      sortItems(item.children);
      item.templates.sort((a, b) => a.name.localeCompare(b.name));
    }
  };
  sortItems(rootFolders);

  return rootFolders;
}

/**
 * Toggle folder expanded state
 */
export function toggleFolderExpanded(
  account: InstanceOfSchema<typeof Account>,
  folderPath: string,
): void {
  if (!account.root?.folderExpanded) return;

  const current = account.root.folderExpanded[folderPath] ?? true;
  account.root.$jazz.set('folderExpanded', {
    ...account.root.folderExpanded,
    [folderPath]: !current,
  });
}

/**
 * Archive all templates under a folder path
 */
export function archiveFolderTemplates(
  account: InstanceOfSchema<typeof Account>,
  folderPath: string,
): void {
  const templates = getAllTemplates(account);

  for (const template of templates) {
    if (template.path.startsWith(`${folderPath}/`) || template.path === folderPath) {
      template.$jazz.set('archived', true);
      template.$jazz.set('updatedAt', new Date());
    }
  }
}
