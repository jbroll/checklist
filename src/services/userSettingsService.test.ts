/**
 * Unit tests for user settings service
 *
 * Tests global and template-level autocomplete and auto-categorization settings.
 */

import { describe, expect, it, vi } from 'vitest';
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

// Mock UserSettings.create
vi.mock('../schema', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as object),
    UserSettings: {
      create: vi.fn((data: any, _options: any) => ({
        ...data,
        $jazz: {
          set: vi.fn((key: string, value: any) => {
            (data as any)[key] = value;
          }),
        },
      })),
    },
  };
});

// Helper to create mock account
const createMockAccount = (userSettings?: any) => ({
  root: {
    userSettings,
    $jazz: {
      set: vi.fn((key: string, value: any) => {
        if (key === 'userSettings') {
          (createMockAccount as any)._lastUserSettings = value;
        }
      }),
    },
  },
});

// Helper to create mock folder
const createMockFolder = (
  settings: { autocompleteDomain?: string; autoCategorizeEnabled?: boolean } = {},
) => ({
  ...settings,
  $jazz: {
    set: vi.fn((key: string, value: any) => {
      (settings as any)[key] = value;
    }),
  },
});

describe('userSettingsService', () => {
  describe('getDefaultAutocompleteDomain', () => {
    it('returns default "grocery" when no userSettings', () => {
      const account = createMockAccount();
      expect(getDefaultAutocompleteDomain(account as any)).toBe('grocery');
    });

    it('returns default "grocery" when userSettings exists but no domain set', () => {
      const account = createMockAccount({
        enableAutoCategorization: true,
      });
      expect(getDefaultAutocompleteDomain(account as any)).toBe('grocery');
    });

    it('returns set domain from userSettings', () => {
      const account = createMockAccount({
        defaultAutocompleteDomain: 'hardware',
      });
      expect(getDefaultAutocompleteDomain(account as any)).toBe('hardware');
    });

    it('returns "grocery" for null account', () => {
      expect(getDefaultAutocompleteDomain(null as any)).toBe('grocery');
    });

    it('returns "grocery" for account with null root', () => {
      expect(getDefaultAutocompleteDomain({ root: null } as any)).toBe('grocery');
    });
  });

  describe('setDefaultAutocompleteDomain', () => {
    it('creates userSettings if not exists', () => {
      const account = createMockAccount();
      setDefaultAutocompleteDomain(account as any, 'hardware');
      expect(account.root.$jazz.set).toHaveBeenCalled();
    });

    it('throws error when account root not initialized', () => {
      expect(() => {
        setDefaultAutocompleteDomain({ root: null } as any, 'grocery');
      }).toThrow('Account root not initialized');
    });
  });

  describe('getEnableAutoCategorization', () => {
    it('returns true by default when no userSettings', () => {
      const account = createMockAccount();
      expect(getEnableAutoCategorization(account as any)).toBe(true);
    });

    it('returns true when userSettings exists but setting not set', () => {
      const account = createMockAccount({});
      expect(getEnableAutoCategorization(account as any)).toBe(true);
    });

    it('returns false when explicitly disabled', () => {
      const account = createMockAccount({
        enableAutoCategorization: false,
      });
      expect(getEnableAutoCategorization(account as any)).toBe(false);
    });

    it('returns true when explicitly enabled', () => {
      const account = createMockAccount({
        enableAutoCategorization: true,
      });
      expect(getEnableAutoCategorization(account as any)).toBe(true);
    });
  });

  describe('setEnableAutoCategorization', () => {
    it('sets enabled state on existing userSettings', () => {
      const userSettings = {
        enableAutoCategorization: true,
        $jazz: { set: vi.fn() },
      };
      const account = createMockAccount(userSettings);

      setEnableAutoCategorization(account as any, false);

      expect(userSettings.$jazz.set).toHaveBeenCalledWith('enableAutoCategorization', false);
    });

    it('creates userSettings if not exists', () => {
      const account = createMockAccount();
      setEnableAutoCategorization(account as any, false);
      expect(account.root.$jazz.set).toHaveBeenCalled();
    });
  });

  describe('toggleEnableAutoCategorization', () => {
    it('toggles from true to false', () => {
      const userSettings = {
        enableAutoCategorization: true,
        $jazz: { set: vi.fn() },
      };
      const account = createMockAccount(userSettings);

      toggleEnableAutoCategorization(account as any);

      expect(userSettings.$jazz.set).toHaveBeenCalledWith('enableAutoCategorization', false);
    });

    it('toggles from false to true', () => {
      const userSettings = {
        enableAutoCategorization: false,
        $jazz: { set: vi.fn() },
      };
      const account = createMockAccount(userSettings);

      toggleEnableAutoCategorization(account as any);

      expect(userSettings.$jazz.set).toHaveBeenCalledWith('enableAutoCategorization', true);
    });
  });

  describe('getTemplateAutocompleteDomain', () => {
    it('returns "grocery" by default when no override', () => {
      const folder = createMockFolder();
      expect(getTemplateAutocompleteDomain(folder as any)).toBe('grocery');
    });

    it('returns template-level override when set', () => {
      const folder = createMockFolder({ autocompleteDomain: 'hardware' });
      expect(getTemplateAutocompleteDomain(folder as any)).toBe('hardware');
    });

    it('returns "none" when template explicitly set to none', () => {
      const folder = createMockFolder({ autocompleteDomain: 'none' });
      expect(getTemplateAutocompleteDomain(folder as any)).toBe('none');
    });

    it('handles null folder', () => {
      expect(getTemplateAutocompleteDomain(null as any)).toBe('grocery');
    });
  });

  describe('hasTemplateAutocompleteDomainSet', () => {
    it('returns false when no override set', () => {
      const folder = createMockFolder();
      expect(hasTemplateAutocompleteDomainSet(folder as any)).toBe(false);
    });

    it('returns true when override set', () => {
      const folder = createMockFolder({ autocompleteDomain: 'hardware' });
      expect(hasTemplateAutocompleteDomainSet(folder as any)).toBe(true);
    });
  });

  describe('setTemplateAutocompleteDomain', () => {
    it('sets domain on folder', () => {
      const folder = createMockFolder();
      setTemplateAutocompleteDomain(folder as any, 'hardware');
      expect(folder.$jazz.set).toHaveBeenCalledWith('autocompleteDomain', 'hardware');
    });

    it('clears domain when set to undefined', () => {
      const folder = createMockFolder({ autocompleteDomain: 'hardware' });
      setTemplateAutocompleteDomain(folder as any, undefined);
      expect(folder.$jazz.set).toHaveBeenCalledWith('autocompleteDomain', undefined);
    });
  });

  describe('isTemplateAutocompleteEnabled', () => {
    it('returns true for grocery domain', () => {
      const folder = createMockFolder({ autocompleteDomain: 'grocery' });
      expect(isTemplateAutocompleteEnabled(folder as any)).toBe(true);
    });

    it('returns true for hardware domain', () => {
      const folder = createMockFolder({ autocompleteDomain: 'hardware' });
      expect(isTemplateAutocompleteEnabled(folder as any)).toBe(true);
    });

    it('returns true for all domain', () => {
      const folder = createMockFolder({ autocompleteDomain: 'all' });
      expect(isTemplateAutocompleteEnabled(folder as any)).toBe(true);
    });

    it('returns false for none domain', () => {
      const folder = createMockFolder({ autocompleteDomain: 'none' });
      expect(isTemplateAutocompleteEnabled(folder as any)).toBe(false);
    });

    it('returns true for default (no override)', () => {
      const folder = createMockFolder();
      expect(isTemplateAutocompleteEnabled(folder as any)).toBe(true);
    });
  });

  describe('getTemplateAutoCategorizeEnabled', () => {
    it('returns global setting when no template override', () => {
      const userSettings = { enableAutoCategorization: false };
      const account = createMockAccount(userSettings);
      const folder = createMockFolder();

      expect(getTemplateAutoCategorizeEnabled(account as any, folder as any)).toBe(false);
    });

    it('returns template override when set', () => {
      const userSettings = { enableAutoCategorization: true };
      const account = createMockAccount(userSettings);
      const folder = createMockFolder({ autoCategorizeEnabled: false });

      expect(getTemplateAutoCategorizeEnabled(account as any, folder as any)).toBe(false);
    });

    it('template true overrides global false', () => {
      const userSettings = { enableAutoCategorization: false };
      const account = createMockAccount(userSettings);
      const folder = createMockFolder({ autoCategorizeEnabled: true });

      expect(getTemplateAutoCategorizeEnabled(account as any, folder as any)).toBe(true);
    });
  });

  describe('hasTemplateAutoCategorizeOverride', () => {
    it('returns false when no override', () => {
      const folder = createMockFolder();
      expect(hasTemplateAutoCategorizeOverride(folder as any)).toBe(false);
    });

    it('returns true when override set to true', () => {
      const folder = createMockFolder({ autoCategorizeEnabled: true });
      expect(hasTemplateAutoCategorizeOverride(folder as any)).toBe(true);
    });

    it('returns true when override set to false', () => {
      const folder = createMockFolder({ autoCategorizeEnabled: false });
      expect(hasTemplateAutoCategorizeOverride(folder as any)).toBe(true);
    });
  });

  describe('setTemplateAutoCategorizeEnabled', () => {
    it('sets enabled state on folder', () => {
      const folder = createMockFolder();
      setTemplateAutoCategorizeEnabled(folder as any, true);
      expect(folder.$jazz.set).toHaveBeenCalledWith('autoCategorizeEnabled', true);
    });

    it('clears override when set to undefined', () => {
      const folder = createMockFolder({ autoCategorizeEnabled: true });
      setTemplateAutoCategorizeEnabled(folder as any, undefined);
      expect(folder.$jazz.set).toHaveBeenCalledWith('autoCategorizeEnabled', undefined);
    });
  });

  describe('toggleTemplateAutoCategorize', () => {
    it('toggles inherited true to explicit false', () => {
      const userSettings = { enableAutoCategorization: true };
      const account = createMockAccount(userSettings);
      const folder = createMockFolder();

      toggleTemplateAutoCategorize(account as any, folder as any);

      expect(folder.$jazz.set).toHaveBeenCalledWith('autoCategorizeEnabled', false);
    });

    it('toggles explicit false to true', () => {
      const account = createMockAccount({});
      const folder = createMockFolder({ autoCategorizeEnabled: false });

      toggleTemplateAutoCategorize(account as any, folder as any);

      expect(folder.$jazz.set).toHaveBeenCalledWith('autoCategorizeEnabled', true);
    });
  });
});
