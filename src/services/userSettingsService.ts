/**
 * UserSettings Service
 *
 * Manages global user preferences for autocomplete and auto-categorization, plus the per-folder
 * (per-template) settings. Like `subscriptionService.ts`, every function is headless, taking the
 * relational graph `g` as its first argument.
 *
 * GLOBAL settings live in the `user_settings` singleton row's `default_autocomplete_domain` /
 * `enable_auto_categorization` columns. PER-TEMPLATE settings live on the FOLDER row itself
 * (`autocomplete_domain` / `auto_categorize_enabled`). A folder's own column value IS the setting
 * (`'none'` / `false` are the stored defaults), so there is no runtime inheritance to resolve.
 *
 * Writes go through `requireSettings` (global) or `g.folder.update` (per-template). A missing
 * settings row is a hard error, never a silent fallback — the app provisions it at account-init.
 */

import type { RelationalGraph } from '@jbroll/rowboat-schema';
import type { schema } from '@/schema/folder';
import type { UserSettingsRow } from '../../shared/schema.js';
import type { AutocompleteDomain } from '../lib/categorization/types';

type Graph = RelationalGraph<typeof schema>;

/**
 * Default autocomplete domain used when neither the settings row nor a folder carries a usable
 * value. A designed default, not a fallback papering over a bug.
 */
const DEFAULT_AUTOCOMPLETE_DOMAIN: AutocompleteDomain = 'grocery';

/** Read the per-user singleton settings row, or `undefined` for a brand-new user with no row yet. */
function readSettings(g: Graph): UserSettingsRow | undefined {
  return g.user_settings.all()[0]?.$data;
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
// Global Autocomplete Settings
// ============================================================================

/** Get the default autocomplete domain for new templates. */
export function getDefaultAutocompleteDomain(g: Graph): AutocompleteDomain {
  return (
    (readSettings(g)?.default_autocomplete_domain as AutocompleteDomain | undefined) ||
    DEFAULT_AUTOCOMPLETE_DOMAIN
  );
}

/** Set the default autocomplete domain for new templates. */
export async function setDefaultAutocompleteDomain(
  g: Graph,
  domain: AutocompleteDomain,
): Promise<void> {
  const settings = requireSettings(g);
  await g.user_settings.update(settings.id, { default_autocomplete_domain: domain });
}

// ============================================================================
// Global Auto-Categorization Settings
// ============================================================================

/** Get whether auto-categorization is enabled globally (default: enabled). */
export function getEnableAutoCategorization(g: Graph): boolean {
  return readSettings(g)?.enable_auto_categorization ?? true;
}

/** Set whether auto-categorization is enabled globally. */
export async function setEnableAutoCategorization(g: Graph, enabled: boolean): Promise<void> {
  const settings = requireSettings(g);
  await g.user_settings.update(settings.id, { enable_auto_categorization: enabled });
}

/** Toggle auto-categorization enabled state. */
export async function toggleEnableAutoCategorization(g: Graph): Promise<void> {
  await setEnableAutoCategorization(g, !getEnableAutoCategorization(g));
}

// ============================================================================
// Per-Template (Per-Folder) Settings
// ============================================================================

/** Read a folder's autocomplete_domain column, or `undefined` if the folder doesn't exist. */
function readFolderDomain(g: Graph, folderId: string): string | undefined {
  return g.folder(folderId)?.$data.autocomplete_domain;
}

/**
 * Get the effective autocomplete domain for a template (folder). The folder's own
 * `autocomplete_domain` IS the setting; an empty value or missing folder falls back to the
 * designed default.
 */
export function getTemplateAutocompleteDomain(g: Graph, folderId: string): AutocompleteDomain {
  return (
    (readFolderDomain(g, folderId) as AutocompleteDomain | undefined) || DEFAULT_AUTOCOMPLETE_DOMAIN
  );
}

/**
 * Whether a template (folder) has an explicit, autocomplete-enabling domain set — i.e. anything
 * other than the `'none'` default (or an empty/absent value).
 */
export function hasTemplateAutocompleteDomainSet(g: Graph, folderId: string): boolean {
  const domain = readFolderDomain(g, folderId);
  return domain !== undefined && domain !== '' && domain !== 'none';
}

/**
 * Set a template (folder) autocomplete domain. Passing `undefined` resets it to the `'none'`
 * default (autocomplete off).
 */
export async function setTemplateAutocompleteDomain(
  g: Graph,
  folderId: string,
  domain: AutocompleteDomain | undefined,
): Promise<void> {
  await g.folder.update(folderId, { autocomplete_domain: domain ?? 'none' });
}

/** Whether autocomplete is effectively enabled for a template (folder) — domain is not `'none'`. */
export function isTemplateAutocompleteEnabled(g: Graph, folderId: string): boolean {
  return getTemplateAutocompleteDomain(g, folderId) !== 'none';
}

/**
 * Get the auto-categorization setting for a template (folder). The folder's own
 * `auto_categorize_enabled` IS the setting (default `false`).
 */
export function getTemplateAutoCategorizeEnabled(g: Graph, folderId: string): boolean {
  return g.folder(folderId)?.$data.auto_categorize_enabled ?? false;
}

/** Whether a template (folder) has auto-categorization explicitly enabled. */
export function hasTemplateAutoCategorizeOverride(g: Graph, folderId: string): boolean {
  return g.folder(folderId)?.$data.auto_categorize_enabled === true;
}

/**
 * Set a template (folder) auto-categorize setting. Passing `undefined` resets it to the `false`
 * default.
 */
export async function setTemplateAutoCategorizeEnabled(
  g: Graph,
  folderId: string,
  enabled: boolean | undefined,
): Promise<void> {
  await g.folder.update(folderId, { auto_categorize_enabled: enabled ?? false });
}

/** Toggle a template (folder) auto-categorize setting. */
export async function toggleTemplateAutoCategorize(g: Graph, folderId: string): Promise<void> {
  const current = getTemplateAutoCategorizeEnabled(g, folderId);
  await setTemplateAutoCategorizeEnabled(g, folderId, !current);
}
