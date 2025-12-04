/**
 * UserSettings Service
 *
 * Manages global user preferences for autocomplete and auto-categorization.
 * These are defaults that can be overridden per-template.
 */

import type { InstanceOfSchema } from 'jazz-tools';
import { type Account, type FolderNode, UserSettings } from '../schemas';

// ============================================================================
// Autocomplete Settings
// ============================================================================

/**
 * Get whether autocomplete is enabled globally
 */
export function getEnableAutocomplete(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
): boolean {
  const userSettings = account?.root?.userSettings;
  if (!userSettings) return true; // Default to enabled
  return userSettings.enableAutocomplete ?? true;
}

/**
 * Set whether autocomplete is enabled globally
 */
export function setEnableAutocomplete(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
  enabled: boolean,
): void {
  const userSettings = ensureUserSettings(account);
  userSettings.$jazz.set('enableAutocomplete', enabled);
}

/**
 * Toggle autocomplete enabled state
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

// ============================================================================
// Template-Level Settings (Override Global Defaults)
// ============================================================================

/**
 * Get effective autocomplete setting for a template.
 * Returns template override if set, otherwise falls back to global setting.
 */
export function getTemplateAutocompleteEnabled(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): boolean {
  // Template-level override takes precedence
  if (folder?.autocompleteEnabled !== undefined) {
    return folder.autocompleteEnabled;
  }
  // Fall back to global setting
  return getEnableAutocomplete(account);
}

/**
 * Get whether template has an explicit autocomplete override (not inherited)
 */
export function hasTemplateAutocompleteOverride(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): boolean {
  return folder?.autocompleteEnabled !== undefined;
}

/**
 * Set template autocomplete override
 */
export function setTemplateAutocompleteEnabled(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
  enabled: boolean | undefined,
): void {
  if (enabled === undefined) {
    // Clear override - inherit from global
    folder.$jazz.set('autocompleteEnabled', undefined);
  } else {
    folder.$jazz.set('autocompleteEnabled', enabled);
  }
}

/**
 * Toggle template autocomplete setting.
 * If currently inherited, sets explicit override to opposite of inherited value.
 * If currently overridden, toggles the override value.
 */
export function toggleTemplateAutocomplete(
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  account: InstanceOfSchema<typeof Account> | any,
  // biome-ignore lint/suspicious/noExplicitAny: Jazz v0.18.x TypeScript inference issue
  folder: InstanceOfSchema<typeof FolderNode> | any,
): void {
  const current = getTemplateAutocompleteEnabled(account, folder);
  setTemplateAutocompleteEnabled(folder, !current);
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
