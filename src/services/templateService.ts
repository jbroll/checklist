/**
 * Template Service
 *
 * Manages template "inodes" - the actual template data.
 * Templates are loaded on-demand when needed (editing, using, exporting).
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { Account, Template } from '../schemas';

/**
 * Get template by ID
 */
export function getTemplate(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): InstanceOfSchema<typeof Template> | null {
  if (!account.root?.templates) return null;
  return account.root.templates.find((t) => t?.$jazz.id === templateId) || null;
}

/**
 * Get all templates
 */
export function getAllTemplates(
  account: InstanceOfSchema<typeof Account>,
): Array<InstanceOfSchema<typeof Template>> {
  if (!account.root?.templates) return [];
  return account.root.templates.filter((t) => t != null) as Array<
    InstanceOfSchema<typeof Template>
  >;
}

/**
 * Check if template exists
 */
export function templateExists(
  account: InstanceOfSchema<typeof Account>,
  templateId: string,
): boolean {
  return getTemplate(account, templateId) != null;
}
