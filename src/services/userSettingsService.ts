/**
 * UserSettings Service
 *
 * Manages global user preferences for autocomplete and auto-categorization.
 * These are defaults that can be overridden per-template.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { AutocompleteDomain } from '../lib/categorization/types';
import { type AccountParam, type FolderNode, UserSettings } from '../schema';

/**
 * Type alias for FolderNode instances (same Jazz inference issue as Account)
 */
// biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference workaround
type FolderParam = InstanceOfSchema<typeof FolderNode> | any;

// ============================================================================
// Autocomplete Settings
// ============================================================================

/**
 * Get the default autocomplete domain for new templates
 */
export function getDefaultAutocompleteDomain(account: AccountParam): AutocompleteDomain {
  const userSettings = account?.root?.userSettings;
  if (!userSettings) return DEFAULT_AUTOCOMPLETE_DOMAIN;
  return (
    (userSettings.defaultAutocompleteDomain as AutocompleteDomain) ?? DEFAULT_AUTOCOMPLETE_DOMAIN
  );
}

/**
 * Set the default autocomplete domain for new templates
 */
export function setDefaultAutocompleteDomain(
  account: AccountParam,
  domain: AutocompleteDomain,
): void {
  const userSettings = ensureUserSettingsWithDomain(account);
  // Cast to schema type - only implemented domains are valid at runtime
  userSettings.$jazz.set(
    'defaultAutocompleteDomain',
    domain as 'none' | 'grocery' | 'hardware' | 'all',
  );
}

// ============================================================================
// Auto-Categorization Settings
// ============================================================================

/**
 * Get whether auto-categorization is enabled globally
 */
export function getEnableAutoCategorization(account: AccountParam): boolean {
  const userSettings = account?.root?.userSettings;
  if (!userSettings) return true; // Default to enabled
  return userSettings.enableAutoCategorization ?? true;
}

/**
 * Set whether auto-categorization is enabled globally
 */
export function setEnableAutoCategorization(account: AccountParam, enabled: boolean): void {
  const userSettings = ensureUserSettings(account);
  userSettings.$jazz.set('enableAutoCategorization', enabled);
}

/**
 * Toggle auto-categorization enabled state
 */
export function toggleEnableAutoCategorization(account: AccountParam): void {
  const current = getEnableAutoCategorization(account);
  setEnableAutoCategorization(account, !current);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Ensure userSettings exists on the account, creating it if needed
 */
function ensureUserSettings(account: AccountParam): InstanceOfSchema<typeof UserSettings> {
  if (!account?.root) {
    throw new Error('Account root not initialized');
  }

  if (!account.root.userSettings) {
    const userSettings = UserSettings.create(
      {
        enableAutoCategorization: true,
      },
      { owner: account },
    );
    account.root.$jazz.set('userSettings', userSettings);
    return userSettings;
  }

  return account.root.userSettings;
}

/**
 * Ensure userSettings exists with defaultAutocompleteDomain field.
 */
function ensureUserSettingsWithDomain(
  account: AccountParam,
): InstanceOfSchema<typeof UserSettings> {
  if (!account?.root) {
    throw new Error('Account root not initialized');
  }

  if (account.root.userSettings) {
    return account.root.userSettings;
  }

  // Create new UserSettings
  const newSettings = UserSettings.create(
    {
      enableAutoCategorization: true,
      defaultAutocompleteDomain: DEFAULT_AUTOCOMPLETE_DOMAIN as
        | 'none'
        | 'grocery'
        | 'hardware'
        | 'all',
    },
    { owner: account },
  );
  account.root.$jazz.set('userSettings', newSettings);
  return newSettings;
}

// ============================================================================
// Template-Level Settings (Override Global Defaults)
// ============================================================================

/**
 * Default autocomplete domain when not explicitly set
 */
const DEFAULT_AUTOCOMPLETE_DOMAIN: AutocompleteDomain = 'grocery';

/**
 * Get effective autocomplete domain for a template.
 * Returns template override if set, otherwise falls back to default.
 *
 * @returns AutocompleteDomain - 'none' | 'grocery' | 'hardware' | 'all'
 */
export function getTemplateAutocompleteDomain(folder: FolderParam): AutocompleteDomain {
  // Template-level setting takes precedence
  if (folder?.autocompleteDomain !== undefined) {
    return folder.autocompleteDomain as AutocompleteDomain;
  }
  // Fall back to default
  return DEFAULT_AUTOCOMPLETE_DOMAIN;
}

/**
 * Get whether template has an explicit autocomplete domain set (not default)
 */
export function hasTemplateAutocompleteDomainSet(folder: FolderParam): boolean {
  return folder?.autocompleteDomain !== undefined;
}

/**
 * Set template autocomplete domain
 *
 * @param domain - 'none' | 'grocery' | 'hardware' | 'all' | undefined (to reset to default)
 */
export function setTemplateAutocompleteDomain(
  folder: FolderParam,
  domain: AutocompleteDomain | undefined,
): void {
  if (domain === undefined) {
    // Clear setting - use default
    folder.$jazz.set('autocompleteDomain', undefined);
  } else {
    folder.$jazz.set('autocompleteDomain', domain);
  }
}

/**
 * Check if autocomplete is effectively enabled for a template
 * (domain is not 'none')
 */
export function isTemplateAutocompleteEnabled(folder: FolderParam): boolean {
  return getTemplateAutocompleteDomain(folder) !== 'none';
}

/**
 * Get effective auto-categorization setting for a template.
 * Returns template override if set, otherwise falls back to global setting.
 */
export function getTemplateAutoCategorizeEnabled(
  account: AccountParam,
  folder: FolderParam,
): boolean {
  // Template-level override takes precedence
  if (folder?.autoCategorizeEnabled !== undefined) {
    return folder.autoCategorizeEnabled;
  }
  // Fall back to global setting
  return getEnableAutoCategorization(account);
}

/**
 * Get whether template has an explicit auto-categorize override (not inherited)
 */
export function hasTemplateAutoCategorizeOverride(folder: FolderParam): boolean {
  return folder?.autoCategorizeEnabled !== undefined;
}

/**
 * Set template auto-categorize override
 */
export function setTemplateAutoCategorizeEnabled(
  folder: FolderParam,
  enabled: boolean | undefined,
): void {
  if (enabled === undefined) {
    // Clear override - inherit from global
    folder.$jazz.set('autoCategorizeEnabled', undefined);
  } else {
    folder.$jazz.set('autoCategorizeEnabled', enabled);
  }
}

/**
 * Toggle template auto-categorize setting.
 * If currently inherited, sets explicit override to opposite of inherited value.
 * If currently overridden, toggles the override value.
 */
export function toggleTemplateAutoCategorize(account: AccountParam, folder: FolderParam): void {
  const current = getTemplateAutoCategorizeEnabled(account, folder);
  setTemplateAutoCategorizeEnabled(folder, !current);
}
