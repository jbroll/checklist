/**
 * UserSettings Service
 *
 * Manages global user preferences for autocomplete and auto-categorization.
 * These are defaults that can be overridden per-template.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import type { AutocompleteDomain } from '../lib/categorization/types';
import { type Account, type FolderNode, UserSettings } from '../schemas';

// ============================================================================
// Autocomplete Settings
// ============================================================================

/**
 * Get the default autocomplete domain for new templates
 */
export function getDefaultAutocompleteDomain(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
): AutocompleteDomain {
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
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
  domain: AutocompleteDomain,
): void {
  const userSettings = ensureUserSettingsWithDomain(account);
  // Cast to schema type - only implemented domains are valid at runtime
  userSettings.$jazz.set(
    'defaultAutocompleteDomain',
    domain as 'none' | 'grocery' | 'hardware' | 'all',
  );
}

/**
 * @deprecated Use getDefaultAutocompleteDomain instead
 * Get whether autocomplete is enabled globally (legacy boolean)
 */
export function getEnableAutocomplete(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
): boolean {
  return getDefaultAutocompleteDomain(account) !== 'none';
}

/**
 * @deprecated Use setDefaultAutocompleteDomain instead
 * Set whether autocomplete is enabled globally (legacy boolean)
 */
export function setEnableAutocomplete(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
  enabled: boolean,
): void {
  setDefaultAutocompleteDomain(account, enabled ? DEFAULT_AUTOCOMPLETE_DOMAIN : 'none');
}

/**
 * @deprecated Use setDefaultAutocompleteDomain instead
 * Toggle autocomplete enabled state (legacy toggle)
 */
export function toggleEnableAutocomplete(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
): void {
  const current = getEnableAutocomplete(account);
  setEnableAutocomplete(account, !current);
}

// ============================================================================
// Auto-Categorization Settings
// ============================================================================

/**
 * Get whether auto-categorization is enabled globally
 */
export function getEnableAutoCategorization(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
): boolean {
  const userSettings = account?.root?.userSettings;
  if (!userSettings) return true; // Default to enabled
  return userSettings.enableAutoCategorization ?? true;
}

/**
 * Set whether auto-categorization is enabled globally
 */
export function setEnableAutoCategorization(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
  enabled: boolean,
): void {
  const userSettings = ensureUserSettings(account);
  userSettings.$jazz.set('enableAutoCategorization', enabled);
}

/**
 * Toggle auto-categorization enabled state
 */
export function toggleEnableAutoCategorization(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
): void {
  const current = getEnableAutoCategorization(account);
  setEnableAutoCategorization(account, !current);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Ensure userSettings exists on the account, creating it if needed
 */
function ensureUserSettings(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
): InstanceOfSchema<typeof UserSettings> {
  if (!account?.root) {
    throw new Error('Account root not initialized');
  }

  if (!account.root.userSettings) {
    const userSettings = UserSettings.create(
      {
        enableAutocomplete: true,
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
 * If the existing UserSettings was created before the field was added,
 * recreate it with the new schema to support the new field.
 */
function ensureUserSettingsWithDomain(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
): InstanceOfSchema<typeof UserSettings> {
  if (!account?.root) {
    throw new Error('Account root not initialized');
  }

  const existing = account.root.userSettings;

  // Check if we need to migrate: existing settings but can't set the new field
  if (existing) {
    // Check if the schema supports defaultAutocompleteDomain by checking if $jazz.has works
    // If the CoMap was created with the old schema, the key won't be registered
    if (
      existing.$jazz.has('defaultAutocompleteDomain') ||
      existing.defaultAutocompleteDomain !== undefined
    ) {
      // Field is registered in schema, can use existing
      return existing;
    }

    // Try to set - if it fails, we need to migrate
    try {
      existing.$jazz.set(
        'defaultAutocompleteDomain',
        DEFAULT_AUTOCOMPLETE_DOMAIN as 'none' | 'grocery' | 'hardware' | 'all',
      );
      return existing;
    } catch {
      // Old schema - need to recreate
    }
  }

  // Create new UserSettings with all fields including defaultAutocompleteDomain
  const newSettings = UserSettings.create(
    {
      enableAutocomplete: existing?.enableAutocomplete ?? true,
      enableAutoCategorization: existing?.enableAutoCategorization ?? true,
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
export function getTemplateAutocompleteDomain(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): AutocompleteDomain {
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
export function hasTemplateAutocompleteDomainSet(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): boolean {
  return folder?.autocompleteDomain !== undefined;
}

/**
 * Set template autocomplete domain
 *
 * @param domain - 'none' | 'grocery' | 'hardware' | 'all' | undefined (to reset to default)
 */
export function setTemplateAutocompleteDomain(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
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
export function isTemplateAutocompleteEnabled(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): boolean {
  return getTemplateAutocompleteDomain(folder) !== 'none';
}

// Legacy compatibility functions - kept for backward compatibility during migration

/**
 * @deprecated Use getTemplateAutocompleteDomain instead
 * Get effective autocomplete setting for a template (boolean compatibility).
 */
export function getTemplateAutocompleteEnabled(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  _account: InstanceOfSchema<typeof Account> | any,
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): boolean {
  return isTemplateAutocompleteEnabled(folder);
}

/**
 * @deprecated Use hasTemplateAutocompleteDomainSet instead
 */
export function hasTemplateAutocompleteOverride(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): boolean {
  return hasTemplateAutocompleteDomainSet(folder);
}

/**
 * @deprecated Use setTemplateAutocompleteDomain instead
 */
export function setTemplateAutocompleteEnabled(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
  enabled: boolean | undefined,
): void {
  if (enabled === undefined) {
    setTemplateAutocompleteDomain(folder, undefined);
  } else {
    // Map boolean to domain: true -> default domain, false -> 'none'
    setTemplateAutocompleteDomain(folder, enabled ? DEFAULT_AUTOCOMPLETE_DOMAIN : 'none');
  }
}

/**
 * @deprecated Use setTemplateAutocompleteDomain instead
 */
export function toggleTemplateAutocomplete(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  _account: InstanceOfSchema<typeof Account> | any,
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): void {
  const current = isTemplateAutocompleteEnabled(folder);
  setTemplateAutocompleteDomain(folder, current ? 'none' : DEFAULT_AUTOCOMPLETE_DOMAIN);
}

/**
 * Get effective auto-categorization setting for a template.
 * Returns template override if set, otherwise falls back to global setting.
 */
export function getTemplateAutoCategorizeEnabled(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
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
export function hasTemplateAutoCategorizeOverride(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): boolean {
  return folder?.autoCategorizeEnabled !== undefined;
}

/**
 * Set template auto-categorize override
 */
export function setTemplateAutoCategorizeEnabled(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
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
export function toggleTemplateAutoCategorize(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): void {
  const current = getTemplateAutoCategorizeEnabled(account, folder);
  setTemplateAutoCategorizeEnabled(folder, !current);
}
