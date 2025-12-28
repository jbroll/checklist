/**
 * Lighthouse CI Configuration
 *
 * Run with: npm run lighthouse
 *
 * This audits the production PWA for performance, accessibility,
 * best practices, and SEO.
 *
 * Note: PWA audits require mobile emulation and may not fully run in headless CI.
 * For comprehensive PWA testing, use Chrome DevTools or PageSpeed Insights.
 */
module.exports = {
  ci: {
    collect: {
      // Audit the production app
      url: ['https://checklist-app.rkroll.com'],
      // Run 3 times to get more stable results
      numberOfRuns: 3,
      settings: {
        // Use mobile emulation (enables PWA audits)
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: 412,
          height: 823,
          deviceScaleFactor: 1.75,
          disabled: false,
        },
        // Run all categories
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo', 'pwa'],
        // Chrome flags
        chromeFlags: '--no-sandbox --headless',
      },
    },
    assert: {
      assertions: {
        // Performance - warn at 50 (Jazz real-time sync can impact initial load)
        'categories:performance': ['warn', { minScore: 0.5 }],

        // Accessibility - require 80+
        'categories:accessibility': ['error', { minScore: 0.8 }],

        // Best Practices - require 80+
        'categories:best-practices': ['error', { minScore: 0.8 }],

        // SEO - warn at 80 (app is authenticated, less SEO-critical)
        'categories:seo': ['warn', { minScore: 0.8 }],

        // PWA - warn only (headless Chrome may not run all PWA audits)
        'categories:pwa': ['warn', { minScore: 0.5, aggregationMethod: 'optimistic' }],
      },
    },
    upload: {
      // Use temporary public storage (free, 7-day retention)
      // Reports are publicly accessible via URL
      target: 'temporary-public-storage',
    },
  },
};
