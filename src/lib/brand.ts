/**
 * Brand configuration system for white-labeling the app.
 *
 * To switch brands, change the VITE_BRAND environment variable.
 * Default is 'checklist'. Kjekit brand is used on kjekit.com domains.
 */

export interface BrandConfig {
  /** Internal brand identifier */
  id: string;

  /** Display name (e.g., "kjekit", "CheckList") */
  name: string;

  /** Short name for PWA/mobile (max ~12 chars) */
  shortName: string;

  /** Full name with tagline for manifest */
  fullName: string;

  /** Tagline/description */
  tagline: string;

  /** Theme color for PWA (hex) */
  themeColor: string;

  /** Background color for PWA splash (hex) */
  backgroundColor: string;

  /** Prefix for localStorage keys */
  storagePrefix: string;

  /** Support email address */
  supportEmail: string;

  /** Sales email address */
  salesEmail: string;

  /** App domain (e.g., "app.kjekit.com") */
  appDomain: string;

  /** Website domain (e.g., "kjekit.com") */
  websiteDomain: string;

  /** Logo assets */
  logos: {
    /** Header icon (can be wordmark or square icon) */
    headerIcon: string;
    /** Square icon for tree items */
    listIcon: string;
    /** Favicon path */
    favicon: string;
  };

  /** Text to display in header next to icon */
  headerText: string;

  /** Aria label for header home button */
  headerAriaLabel: string;
}

/**
 * Kjekit brand configuration (default)
 */
export const kjekitBrand: BrandConfig = {
  id: 'kjekit',
  name: 'kjekit',
  shortName: 'kjekit',
  fullName: 'kjekit - Nicely Shared Checklists',
  tagline: 'Nicely Shared Checklists',
  themeColor: '#76daDA',
  backgroundColor: '#ffffff',
  storagePrefix: 'kjekit',
  supportEmail: 'support@kjekit.com',
  salesEmail: 'sales@kjekit.com',
  appDomain: 'app.kjekit.com',
  websiteDomain: 'kjekit.com',
  logos: {
    headerIcon: '/kjekit-path.svg', // Wordmark as header icon
    listIcon: '/checklist-icon.svg', // Square icon for tree items
    favicon: '/checklist-icon.svg', // Use icon as favicon
  },
  headerText: 'Lists',
  headerAriaLabel: 'kjekit - Return to main view',
};

/**
 * Generic CheckList brand configuration
 */
export const checklistBrand: BrandConfig = {
  id: 'checklist',
  name: 'CheckList',
  shortName: 'CheckList',
  fullName: 'CheckList - Shared Checklists',
  tagline: 'Shared Checklists',
  themeColor: '#22c55e',
  backgroundColor: '#ffffff',
  storagePrefix: 'checklist',
  supportEmail: 'support@checklist.rkroll.com',
  salesEmail: 'sales@checklist.rkroll.com',
  appDomain: 'checklist-app.rkroll.com',
  websiteDomain: 'checklist.rkroll.com',
  logos: {
    headerIcon: '/checklist-icon.svg', // Checklist icon for header
    listIcon: '/checklist-icon.svg', // Same icon for tree items
    favicon: '/checklist-icon.svg',
  },
  headerText: 'CheckList',
  headerAriaLabel: 'CheckList - Return to main view',
};

/**
 * All available brands
 */
export const brands: Record<string, BrandConfig> = {
  kjekit: kjekitBrand,
  checklist: checklistBrand,
};

/**
 * Get the current brand configuration based on domain.
 * - kjekit.com → kjekit brand
 * - Everything else (including localhost) → CheckList brand (default)
 */
export function getBrand(): BrandConfig {
  // Allow build-time override for testing
  if (import.meta.env.VITE_BRAND) {
    return brands[import.meta.env.VITE_BRAND] || checklistBrand;
  }

  // Runtime domain detection
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  if (hostname.includes('kjekit')) {
    return kjekitBrand;
  }

  return checklistBrand;
}

/**
 * Current brand instance (singleton for convenience)
 */
export const brand = getBrand();

/**
 * Helper to create storage key with brand prefix
 */
export function storageKey(key: string): string {
  return `${brand.storagePrefix}_${key}`;
}

/**
 * Helper to create legacy storage key (with hyphen, for migration)
 */
export function legacyStorageKey(key: string): string {
  return `${brand.storagePrefix}-${key}`;
}
