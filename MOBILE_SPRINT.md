# Mobile Readiness Assessment & Sprint Plan

**Date:** 2025-11-03
**Application:** Groceries-Jazz (Collaborative Shopping List)
**Overall Mobile Readiness Score:** 3/10

## Executive Summary

The groceries-jazz application has significant mobile usability gaps that must be addressed before mobile deployment. While the application has a solid foundation with proper viewport configuration and touch-compatible drag-and-drop, it lacks comprehensive responsive breakpoints, PWA capabilities, and mobile-specific UI adaptations.

**Current State:**
- Viewport Configuration: 8/10 ✅
- PWA Readiness: 0/10 ❌
- Responsive Design: 2/10 ❌
- Touch Interactions: 5/10 ⚠️
- Mobile Navigation: 1/10 ❌
- Touch Target Sizes: 3/10 ❌
- Mobile Testing: 0/10 ❌
- Mobile-Specific Features: 1/10 ❌

**Assessment:** The application will technically function on mobile devices but provides a **poor mobile user experience** with numerous usability issues.

---

## Critical Issues (Deploy Blockers)

### 1. Hover-Only Menus (CRITICAL)
**Impact:** Context menus are invisible on touch devices
**Instances:** 34 instances across 16 files
**Pattern:** `invisible group-hover:visible`

**Affected Files:**
- `src/components/tree/FolderNodeView.tsx:181`
- `src/components/tree/TemplateItemView.tsx:149`
- `src/components/tree/SessionRowView.tsx:64`

**User Impact:** Users cannot access critical actions like edit, delete, rename on mobile devices.

---

### 2. Mobile Navigation Overflow (CRITICAL)
**Impact:** Navigation header breaks on mobile screens
**File:** `src/components/tree/TreeViewHeader.tsx:62-96`

**Problem:**
- 4 buttons + dropdown menu in horizontal row
- No responsive stacking
- Button text not hidden on mobile
- Will overflow or wrap awkwardly on screens < 768px

**User Impact:** Primary navigation is unusable on mobile.

---

### 3. Touch Targets Too Small (CRITICAL)
**Impact:** Users cannot reliably tap buttons on touch devices
**Minimum Recommended:** 44x44px (Apple/Google guidelines)

**Violations:**
1. Chevron expand/collapse: `h-5 w-5` (20x20px) - `src/components/tree/TreeNode.tsx:33`
2. Shopping checkboxes: `h-6 w-6` (24x24px) - `src/components/session/ShoppingSessionItemRow.tsx:38`
3. Icon buttons: `h-9 w-9` (36x36px) - `src/components/ui/button.tsx` (borderline)
4. Dropdown triggers: Small `MoreVertical` buttons with minimal padding

**User Impact:** Frustrating tap experience, missed taps, accidental taps.

---

### 4. No PWA Support (CRITICAL)
**Impact:** App cannot be installed or used offline beyond Jazz cache

**Missing:**
- No `manifest.json` or web app manifest
- No service worker implementation
- No app icons for home screen
- No install prompt handling
- No offline UI indicators

**User Impact:** Cannot install as native-like app, poor offline experience awareness.

---

## High Priority Issues

### 5. Minimal Responsive Breakpoints
**Impact:** Fixed desktop layouts on mobile

**Current State:**
- Only 12 files use responsive classes
- Only `sm:` breakpoint used (no md:, lg:, xl:, 2xl:)
- Dialog components have some responsiveness ✅
- Main layouts have no mobile adaptation

**Examples:**
- Fixed typography: `text-4xl` everywhere (no `text-2xl sm:text-3xl lg:text-4xl`)
- Fixed padding: `p-8` (no `p-4 sm:p-6 lg:p-8`)
- No layout changes for mobile vs desktop

---

### 6. Missing Mobile Meta Tags
**Impact:** Suboptimal mobile browser experience
**File:** `index.html:6-7`

**Currently Has:**
- ✅ Viewport meta tag
- ✅ Basic description

**Missing:**
- Theme color for browser chrome
- Apple web app capable tags
- Mobile web app capable tags
- App icon declarations
- Status bar style preferences

---

### 7. No Mobile Testing
**Impact:** Mobile issues not caught before deployment
**File:** `playwright.config.ts:40-42`

**Current State:**
- Only `Desktop Chrome` device configured
- No mobile viewport tests
- No touch interaction tests
- No responsive layout tests

**Missing Devices:**
- iPhone 13 / iPhone 13 Pro
- Pixel 5 / Android devices
- iPad / Tablets
- Landscape orientations

---

## Medium Priority Issues

### 8. No Mobile-Specific Navigation Patterns
**Missing:**
- Hamburger menu for mobile
- Bottom navigation bar
- Slide-out drawer/sidebar
- Mobile-optimized header

---

### 9. Fixed Typography & Spacing
**Impact:** Text too large/small on various devices

**Pattern Throughout Codebase:**
```tsx
// Current (non-responsive):
<h1 className="text-4xl">Title</h1>
<div className="p-8">Content</div>

// Should be:
<h1 className="text-2xl sm:text-3xl lg:text-4xl">Title</h1>
<div className="p-4 sm:p-6 lg:p-8">Content</div>
```

---

### 10. No Mobile Input Optimizations
**Impact:** Poor mobile keyboard experience

**Missing Attributes:**
- `inputMode` for numeric/email/tel inputs
- `autoComplete` optimizations
- `autoCapitalize` for proper nouns
- Mobile-friendly date/time pickers

---

## Low Priority Enhancements

11. No swipe gestures (beyond drag-drop)
12. No pull-to-refresh
13. No haptic feedback
14. No loading skeletons
15. No landscape mode optimization
16. No dark mode (common mobile preference)
17. No mobile-specific animations
18. No reduced motion support

---

## What's Working Well

### Strengths
1. ✅ **Proper viewport meta tag** - `index.html:6`
2. ✅ **Touch-compatible drag-and-drop** - Uses `PointerSensor` with 8px activation constraint
3. ✅ **Dialog responsiveness** - Footer stacks on mobile: `flex-col-reverse sm:flex-row`
4. ✅ **Jazz.tools offline-first** - Data layer supports offline by design
5. ✅ **Good base structure** - Clean component architecture ready for responsive enhancement

### Technical Foundation
- React 18 with TypeScript
- Tailwind CSS (responsive utilities available)
- Radix UI (accessible components)
- Modern build tooling (Vite)

---

## Sprint Plan

### Phase 1: Critical Fixes (Deploy Blockers)
**Timeline:** 2-3 days
**Effort:** 13.5 hours
**Priority:** MUST HAVE before mobile deployment

#### 1.1 Fix Touch-Accessible Menus
**Effort:** 4 hours
**Files:** 3 primary files

**Implementation:**
```tsx
// Current (broken on mobile):
<Button className="invisible group-hover:visible">
  <MoreVertical className="h-4 w-4" />
</Button>

// Fix Option A - Always visible on mobile:
<Button className="opacity-70 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
  <MoreVertical className="h-4 w-4" />
</Button>

// Fix Option B - Show on focus (accessibility):
<Button className="opacity-0 group-hover:opacity-100 focus:opacity-100 md:opacity-0">
  <MoreVertical className="h-4 w-4" />
</Button>
```

**Files to Update:**
1. `src/components/tree/FolderNodeView.tsx:181`
2. `src/components/tree/TemplateItemView.tsx:149`
3. `src/components/tree/SessionRowView.tsx:64`

**Verification:**
- Test on iPhone Safari
- Test on Android Chrome
- Verify all menu items accessible via touch

---

#### 1.2 Fix Mobile Navigation Header
**Effort:** 6 hours
**File:** `src/components/tree/TreeViewHeader.tsx:62-96`

**Current Layout:**
```tsx
<div className="flex items-center gap-2">
  <Button>Edit List</Button>
  <Button>Use List</Button>
  <Button><Plus /> New Folder</Button>
  <Button><Plus /> New List</Button>
  <DropdownMenu>...</DropdownMenu>
</div>
```

**Solution A - Quick Fix (Recommended for Phase 1):**
```tsx
<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
  <Button className="w-full sm:w-auto">Edit List</Button>
  <Button className="w-full sm:w-auto">Use List</Button>
  <Button className="w-full sm:w-auto">
    <Plus className="h-4 w-4" />
    <span className="sm:inline">New Folder</span>
  </Button>
  <Button className="w-full sm:w-auto">
    <Plus className="h-4 w-4" />
    <span className="sm:inline">New List</span>
  </Button>
  <DropdownMenu>...</DropdownMenu>
</div>
```

**Solution B - Better UX (Consider for Phase 3):**
- Create hamburger menu for mobile (< md screens)
- Keep primary actions visible
- Move secondary actions to menu
- Use icon-only buttons on mobile with tooltips

**Verification:**
- No horizontal scrolling on 320px viewport
- All buttons tappable on iPhone SE
- Layout doesn't break on tablet landscape

---

#### 1.3 Increase Touch Target Sizes
**Effort:** 3 hours
**Files:** 5 primary files

**Touch Target Minimum:** 44x44px

**File 1: Tree Node Chevrons**
`src/components/tree/TreeNode.tsx:33`
```tsx
// Current:
<button className="h-5 w-5">
  <ChevronRight />
</button>

// Fixed:
<button className="h-10 w-10 p-2 flex items-center justify-center -ml-2">
  <ChevronRight className="h-5 w-5" />
</button>
```

**File 2: Shopping Checkboxes**
`src/components/session/ShoppingSessionItemRow.tsx:38`
```tsx
// Current:
<Checkbox className="h-6 w-6" />

// Fixed:
<Checkbox className="h-10 w-10" />
```

**File 3: Button Icon Variant**
`src/components/ui/button.tsx`
```tsx
// Current:
icon: 'h-9 w-9 p-0', // 36x36px

// Fixed:
icon: 'h-11 w-11 p-0', // 44x44px
```

**File 4-5: Dropdown Menu Triggers**
All `MoreVertical` button uses - add minimum padding:
```tsx
<Button
  variant="ghost"
  className="h-10 w-10 p-2"
>
  <MoreVertical className="h-4 w-4" />
</Button>
```

**Verification:**
- Test tap accuracy on real devices
- Verify no layout breaks from size increases
- Check spacing doesn't become too large on desktop

---

#### 1.4 Add Mobile Meta Tags
**Effort:** 30 minutes
**File:** `index.html`

**Implementation:**
```html
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Mobile optimizations -->
  <meta name="theme-color" content="#10b981" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="Groceries" />
  <meta name="mobile-web-app-capable" content="yes" />

  <!-- App icons -->
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  <link rel="manifest" href="/manifest.json" />

  <meta name="description" content="Collaborative grocery list app with real-time sync" />
  <title>Groceries - Shopping Lists</title>
</head>
```

**Note:** Icons will be created in Phase 2.

---

### Phase 2: PWA Implementation
**Timeline:** 1-2 days
**Effort:** 4.5 hours
**Priority:** MUST HAVE for mobile deployment

#### 2.1 Install PWA Dependencies
**Effort:** 10 minutes

```bash
npm install -D vite-plugin-pwa
npm install workbox-window
```

**Verification:**
```bash
npm list vite-plugin-pwa workbox-window
```

---

#### 2.2 Create Web App Manifest
**Effort:** 1 hour
**Create:** `public/manifest.json`

```json
{
  "name": "Groceries - Collaborative Shopping Lists",
  "short_name": "Groceries",
  "description": "Collaborative grocery list app with real-time sync and offline support",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#10b981",
  "orientation": "portrait-primary",
  "scope": "/",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-192-maskable.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "maskable"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512-maskable.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "categories": ["shopping", "productivity", "lifestyle"],
  "screenshots": [
    {
      "src": "/screenshot-mobile-1.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Browse your shopping lists"
    },
    {
      "src": "/screenshot-mobile-2.png",
      "sizes": "390x844",
      "type": "image/png",
      "form_factor": "narrow",
      "label": "Check off items while shopping"
    },
    {
      "src": "/screenshot-wide-1.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide",
      "label": "Desktop view with folder organization"
    }
  ],
  "shortcuts": [
    {
      "name": "New Shopping Session",
      "short_name": "Shop",
      "description": "Start a new shopping session",
      "url": "/?action=new-session",
      "icons": [
        {
          "src": "/shortcut-shop.png",
          "sizes": "192x192",
          "type": "image/png"
        }
      ]
    },
    {
      "name": "View Lists",
      "short_name": "Lists",
      "description": "Browse your shopping lists",
      "url": "/?action=view-lists",
      "icons": [
        {
          "src": "/shortcut-lists.png",
          "sizes": "192x192",
          "type": "image/png"
        }
      ]
    }
  ]
}
```

---

#### 2.3 Configure Vite PWA Plugin
**Effort:** 2 hours
**File:** `vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'icon-*.png'
      ],
      manifest: false, // We're using public/manifest.json directly
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cloud\.jazz\.tools\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'jazz-sync',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: true, // Enable PWA in dev mode for testing
        type: 'module',
      },
    }),
  ],
});
```

**Add to `src/main.tsx`:**
```typescript
import { registerSW } from 'virtual:pwa-register';

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New content available. Reload?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
});
```

---

#### 2.4 Create App Icons
**Effort:** 1 hour
**Tool:** https://realfavicongenerator.net/ or Figma

**Required Icons:**
- `public/icon-192.png` (192x192)
- `public/icon-192-maskable.png` (192x192 with safe zone)
- `public/icon-512.png` (512x512)
- `public/icon-512-maskable.png` (512x512 with safe zone)
- `public/apple-touch-icon.png` (180x180)
- `public/favicon.ico` (multi-size)
- `public/favicon-32x32.png`
- `public/favicon-16x16.png`

**Design Guidelines:**
- Use green (#10b981) as primary color
- Simple, recognizable icon
- Works well at small sizes
- Maskable icons: keep content in 80% safe zone

**Placeholder Command (for development):**
```bash
# Create placeholder icons
convert -size 512x512 xc:#10b981 -pointsize 200 -fill white \
  -gravity center -annotate +0+0 "G" public/icon-512.png

convert public/icon-512.png -resize 192x192 public/icon-192.png
convert public/icon-512.png -resize 180x180 public/apple-touch-icon.png
convert public/icon-512.png -resize 32x32 public/favicon-32x32.png
convert public/icon-512.png -resize 16x16 public/favicon-16x16.png
```

---

### Phase 3: Responsive Design Overhaul
**Timeline:** 3-4 days
**Effort:** 30 hours
**Priority:** NICE TO HAVE (can deploy without, but recommended)

#### 3.1 Implement Responsive Typography
**Effort:** 4 hours
**Pattern:**

```tsx
// Headings
text-2xl sm:text-3xl lg:text-4xl   // H1
text-xl sm:text-2xl lg:text-3xl    // H2
text-lg sm:text-xl lg:text-2xl     // H3

// Body text
text-sm sm:text-base               // Body
text-xs sm:text-sm                 // Small text
```

**Files to Update:**
- `src/components/Dashboard.tsx:101` - Main heading
- `src/components/tree/TreeViewHeader.tsx:70` - Page title
- `src/components/session/ShoppingSessionView.tsx:125` - Session title
- All dialog titles
- All form labels
- All button text

---

#### 3.2 Implement Responsive Spacing
**Effort:** 6 hours
**Pattern:**

```tsx
// Padding
p-4 sm:p-6 lg:p-8        // Container padding
px-4 sm:px-6 lg:px-8     // Horizontal padding
py-3 sm:py-4 lg:py-6     // Vertical padding

// Gaps
gap-2 sm:gap-3 lg:gap-4  // Flex/grid gaps
space-y-3 sm:space-y-4   // Vertical spacing

// Margins
mb-4 sm:mb-6 lg:mb-8     // Bottom margin
```

**Apply Throughout:**
- All container components
- All dialog content
- All form layouts
- All card/panel components

---

#### 3.3 Create Mobile-First Navigation
**Effort:** 8 hours

**Option A: Responsive Header (Recommended)**

Create `src/components/tree/MobileNavigation.tsx`:
```tsx
export function MobileNavigation() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger - visible < md */}
      <Button
        variant="ghost"
        className="md:hidden"
        onClick={() => setIsOpen(true)}
      >
        <Menu className="h-6 w-6" />
      </Button>

      {/* Slide-out menu */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent side="left">
          <nav className="flex flex-col gap-4">
            {/* Navigation items */}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Desktop navigation - visible md+ */}
      <div className="hidden md:flex items-center gap-2">
        {/* Existing buttons */}
      </div>
    </>
  );
}
```

**Update:** `src/components/tree/TreeViewHeader.tsx`
- Replace button row with `<MobileNavigation />`
- Keep primary actions visible on mobile
- Move secondary actions to hamburger menu

---

#### 3.4 Add Responsive Layouts
**Effort:** 12 hours

**Layout 1: Tree + Editor Split**

Current: Side-by-side always
New: Stack on mobile, split on md+

```tsx
<div className="flex flex-col md:flex-row gap-4 md:gap-6">
  <aside className="w-full md:w-64 lg:w-80">
    {/* Tree */}
  </aside>
  <main className="flex-1 min-w-0">
    {/* Editor */}
  </main>
</div>
```

**Layout 2: Dialog Full-Screen Mobile**
```tsx
<DialogContent className="w-full h-full sm:h-auto sm:max-w-[500px] p-4 sm:p-6">
  {/* Dialog content */}
</DialogContent>
```

**Layout 3: Form Multi-Column**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  {/* Form fields */}
</div>
```

---

### Phase 4: Mobile Testing
**Timeline:** 1 day
**Effort:** 6 hours
**Priority:** SHOULD HAVE

#### 4.1 Configure Playwright Mobile Devices
**Effort:** 2 hours
**File:** `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'iPhone 13',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'iPhone 13 landscape',
      use: { ...devices['iPhone 13 landscape'] },
    },
    {
      name: 'Pixel 5',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'iPad Pro',
      use: { ...devices['iPad Pro'] },
    },
    {
      name: 'Samsung Galaxy S21',
      use: {
        ...devices['Galaxy S9+'], // Use S9+ as proxy
        viewport: { width: 360, height: 800 },
      },
    },
  ],
});
```

**Run Tests:**
```bash
# All devices
npm run test:e2e

# Specific device
npx playwright test --project="iPhone 13"
```

---

#### 4.2 Create Mobile Test Scenarios
**Effort:** 4 hours
**Create:** `e2e/mobile.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Mobile Navigation', () => {
  test('should open hamburger menu on mobile', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 375, height: 667 });

    // Should see hamburger button
    const hamburger = page.getByRole('button', { name: /menu/i });
    await expect(hamburger).toBeVisible();

    // Should open menu
    await hamburger.click();
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('should have no horizontal scrolling', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 320, height: 568 }); // iPhone SE

    const scrollWidth = await page.evaluate(() => {
      return document.documentElement.scrollWidth;
    });
    const clientWidth = await page.evaluate(() => {
      return document.documentElement.clientWidth;
    });

    expect(scrollWidth).toBe(clientWidth);
  });
});

test.describe('Touch Interactions', () => {
  test('should expand folder on tap', async ({ page }) => {
    await page.goto('/');

    const folder = page.getByTestId('folder-item').first();
    await folder.tap();

    await expect(page.getByTestId('folder-children')).toBeVisible();
  });

  test('should access context menu on tap', async ({ page }) => {
    await page.goto('/');

    const menuButton = page.getByRole('button', { name: /more options/i }).first();
    await expect(menuButton).toBeVisible();

    await menuButton.tap();
    await expect(page.getByRole('menu')).toBeVisible();
  });

  test('should have tappable touch targets (min 44x44px)', async ({ page }) => {
    await page.goto('/');

    const buttons = page.getByRole('button');
    const count = await buttons.count();

    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const box = await button.boundingBox();

      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
    }
  });
});

test.describe('PWA', () => {
  test('should have manifest', async ({ page }) => {
    await page.goto('/');

    const manifest = await page.evaluate(() => {
      const link = document.querySelector('link[rel="manifest"]');
      return link?.getAttribute('href');
    });

    expect(manifest).toBe('/manifest.json');
  });

  test('should register service worker', async ({ page }) => {
    await page.goto('/');

    const swRegistered = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return navigator.serviceWorker.controller !== null;
    });

    expect(swRegistered).toBe(true);
  });

  test('should work offline', async ({ page, context }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Go offline
    await context.setOffline(true);

    // Navigate should still work
    await page.reload();
    await expect(page.getByText('Groceries')).toBeVisible();
  });
});

test.describe('Forms', () => {
  test('should use mobile keyboard for inputs', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /new list/i }).click();
    const input = page.getByLabel(/name/i);

    const inputMode = await input.getAttribute('inputmode');
    expect(inputMode).toBeTruthy();
  });
});

test.describe('Responsive Layout', () => {
  test('should stack navigation on mobile', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 375, height: 667 });

    // Check if layout is vertical
    const nav = page.getByRole('navigation').first();
    const flexDirection = await nav.evaluate(el => {
      return window.getComputedStyle(el).flexDirection;
    });

    expect(flexDirection).toBe('column');
  });

  test('should show horizontal layout on desktop', async ({ page }) => {
    await page.goto('/');
    await page.setViewportSize({ width: 1280, height: 720 });

    const nav = page.getByRole('navigation').first();
    const flexDirection = await nav.evaluate(el => {
      return window.getComputedStyle(el).flexDirection;
    });

    expect(flexDirection).toBe('row');
  });
});
```

---

### Phase 5: Mobile-Specific Enhancements
**Timeline:** 2 days
**Effort:** 11 hours
**Priority:** NICE TO HAVE (post-launch)

#### 5.1 Add Pull-to-Refresh
**Effort:** 3 hours
**Library:** `react-simple-pull-to-refresh`

```bash
npm install react-simple-pull-to-refresh
```

```tsx
import PullToRefresh from 'react-simple-pull-to-refresh';

function ShoppingSessionView() {
  const handleRefresh = async () => {
    // Trigger Jazz sync refresh
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div>{/* Content */}</div>
    </PullToRefresh>
  );
}
```

---

#### 5.2 Optimize Mobile Keyboard
**Effort:** 2 hours

```tsx
// Numeric inputs
<input
  type="number"
  inputMode="numeric"
  pattern="[0-9]*"
/>

// Text with capitalization
<input
  type="text"
  inputMode="text"
  autoCapitalize="words"
  autoComplete="off"
/>

// Email
<input
  type="email"
  inputMode="email"
  autoComplete="email"
/>

// Search
<input
  type="search"
  inputMode="search"
  autoComplete="off"
/>
```

**Apply to:**
- Item name inputs
- Folder name inputs
- Search inputs
- Any form fields

---

#### 5.3 Add Swipe Gestures
**Effort:** 4 hours
**Library:** `framer-motion`

```tsx
import { motion } from 'framer-motion';

function SwipeableItem({ item, onDelete }) {
  return (
    <motion.div
      drag="x"
      dragConstraints={{ left: -100, right: 0 }}
      onDragEnd={(e, info) => {
        if (info.offset.x < -80) {
          onDelete(item);
        }
      }}
    >
      <div>{item.name}</div>
      <div className="absolute right-0 top-0 h-full bg-red-500">
        Delete
      </div>
    </motion.div>
  );
}
```

**Use Cases:**
- Swipe left to delete items
- Swipe to archive folders
- Swipe between sessions

---

#### 5.4 Add Haptic Feedback
**Effort:** 2 hours

```typescript
// lib/haptics.ts
export const haptics = {
  light() {
    if ('vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },

  medium() {
    if ('vibrate' in navigator) {
      navigator.vibrate(20);
    }
  },

  heavy() {
    if ('vibrate' in navigator) {
      navigator.vibrate([10, 50, 10]);
    }
  },

  success() {
    if ('vibrate' in navigator) {
      navigator.vibrate([10, 30, 10]);
    }
  },

  error() {
    if ('vibrate' in navigator) {
      navigator.vibrate([20, 50, 20, 50, 20]);
    }
  },
};

// Usage
function CheckboxItem() {
  const handleCheck = () => {
    haptics.light();
    // ... toggle logic
  };

  return <Checkbox onChange={handleCheck} />;
}
```

**Apply to:**
- Item check/uncheck
- Drag start/end
- Delete actions
- Navigation feedback

---

## Testing Checklist

### Pre-Deployment Mobile Testing (Minimum)

#### Device Testing
- [ ] iPhone 13 Pro (iOS Safari)
- [ ] iPhone SE (small screen)
- [ ] Google Pixel 5 (Android Chrome)
- [ ] Samsung Galaxy S21 (Samsung Internet)
- [ ] iPad Pro (tablet)

#### Functional Testing
- [ ] Can log in with Google OAuth
- [ ] Can log in with Apple ID
- [ ] Can navigate folder tree
- [ ] Can create new folders
- [ ] Can create new lists
- [ ] Can edit items
- [ ] Can start shopping session
- [ ] Can check off items
- [ ] Can access context menus
- [ ] Can drag and drop items

#### Layout Testing
- [ ] No horizontal scrolling (320px - 414px widths)
- [ ] All text is readable
- [ ] All buttons are tappable
- [ ] Forms are usable
- [ ] Dialogs display correctly
- [ ] Navigation doesn't overflow

#### PWA Testing
- [ ] Can install to home screen (iOS)
- [ ] Can install to home screen (Android)
- [ ] App launches from home screen
- [ ] Splash screen displays
- [ ] Works offline
- [ ] Service worker caches assets
- [ ] Updates automatically

#### Performance Testing
- [ ] App loads in < 3 seconds on 3G
- [ ] Interactions feel responsive
- [ ] No janky scrolling
- [ ] No layout shifts

#### Accessibility Testing
- [ ] Touch targets min 44x44px
- [ ] Sufficient color contrast
- [ ] Text scales with system settings
- [ ] Focus indicators visible

---

## Deployment Readiness Criteria

### Must Have (Phase 1 + 2)
- ✅ All context menus accessible on touch devices
- ✅ Navigation works on mobile without overflow
- ✅ All touch targets minimum 44x44px
- ✅ Mobile meta tags configured
- ✅ PWA manifest created
- ✅ Service worker registered
- ✅ App icons created
- ✅ Works offline
- ✅ Tested on iPhone Safari
- ✅ Tested on Android Chrome
- ✅ No horizontal scrolling on 320px viewport

### Should Have (Phase 3)
- ✅ Responsive typography implemented
- ✅ Responsive spacing implemented
- ✅ Mobile navigation pattern
- ✅ Responsive layouts (tree/editor split)
- ✅ Mobile E2E tests passing

### Nice to Have (Phase 4-5)
- ✅ Pull-to-refresh
- ✅ Mobile keyboard optimizations
- ✅ Swipe gestures
- ✅ Haptic feedback

---

## Effort Summary

| Phase | Description | Effort | Priority | Deploy Blocker |
|-------|-------------|--------|----------|----------------|
| **Phase 1** | Critical Fixes | 13.5 hours | CRITICAL | YES |
| 1.1 | Fix touch menus | 4 hours | CRITICAL | YES |
| 1.2 | Fix navigation | 6 hours | CRITICAL | YES |
| 1.3 | Touch targets | 3 hours | CRITICAL | YES |
| 1.4 | Mobile meta tags | 0.5 hours | HIGH | YES |
| **Phase 2** | PWA Implementation | 4.5 hours | HIGH | YES |
| 2.1 | Install deps | 0.2 hours | HIGH | YES |
| 2.2 | Create manifest | 1 hour | HIGH | YES |
| 2.3 | Configure Vite PWA | 2 hours | HIGH | YES |
| 2.4 | Create icons | 1 hour | HIGH | YES |
| **Phase 3** | Responsive Design | 30 hours | MEDIUM | NO |
| 3.1 | Responsive typography | 4 hours | MEDIUM | NO |
| 3.2 | Responsive spacing | 6 hours | MEDIUM | NO |
| 3.3 | Mobile navigation | 8 hours | MEDIUM | NO |
| 3.4 | Responsive layouts | 12 hours | MEDIUM | NO |
| **Phase 4** | Mobile Testing | 6 hours | MEDIUM | NO |
| 4.1 | Configure devices | 2 hours | MEDIUM | NO |
| 4.2 | Create mobile tests | 4 hours | MEDIUM | NO |
| **Phase 5** | Enhancements | 11 hours | LOW | NO |
| 5.1 | Pull-to-refresh | 3 hours | LOW | NO |
| 5.2 | Mobile keyboard | 2 hours | LOW | NO |
| 5.3 | Swipe gestures | 4 hours | LOW | NO |
| 5.4 | Haptic feedback | 2 hours | LOW | NO |
| **TOTAL** | | **65 hours** | | |
| **MINIMUM** | Phases 1-2 only | **18 hours** | | |

---

## Timeline Recommendations

### Option A: Minimum Viable Mobile (2-3 days)
**Scope:** Phase 1 + Phase 2
**Effort:** 18 hours
**Outcome:** Mobile-functional, installable as PWA

**Week 1:**
- Day 1: Phase 1.1-1.2 (Fix menus + navigation)
- Day 2: Phase 1.3-1.4 + Phase 2.1-2.2 (Touch targets + PWA setup)
- Day 3: Phase 2.3-2.4 + testing (Complete PWA + test)

**Deploy after Week 1** with basic mobile support.

---

### Option B: Mobile-Optimized (2 weeks)
**Scope:** Phase 1 + Phase 2 + Phase 3
**Effort:** 48 hours
**Outcome:** Fully responsive, mobile-optimized

**Week 1:**
- Days 1-3: Phase 1 + Phase 2 (Critical fixes + PWA)
- Days 4-5: Phase 3.1-3.2 (Responsive typography + spacing)

**Week 2:**
- Days 1-3: Phase 3.3-3.4 (Mobile navigation + layouts)
- Days 4-5: Testing and refinement

**Deploy after Week 2** with excellent mobile experience.

---

### Option C: Mobile-First (3 weeks)
**Scope:** All phases
**Effort:** 65 hours
**Outcome:** Best-in-class mobile experience

**Week 1:** Phase 1 + Phase 2
**Week 2:** Phase 3 + Phase 4
**Week 3:** Phase 5 + polish

**Deploy after Week 3** with complete mobile feature set.

---

## Recommended Approach

**For Production Deployment:**
**Start with Option A (18 hours), then iterate post-launch.**

**Rationale:**
1. Phases 1-2 fix critical usability blockers
2. App becomes installable and works offline
3. Users can actually use the app on mobile
4. Allows faster time-to-market
5. Can gather real user feedback
6. Can prioritize Phase 3-5 based on actual usage

**Post-Launch Iteration:**
- Week 1: Deploy with Phase 1-2
- Week 2-3: Implement Phase 3 based on user feedback
- Week 4+: Add Phase 4-5 enhancements as needed

---

## Success Metrics

### Mobile Usage Metrics (Post-Launch)
- % of traffic from mobile devices
- Mobile vs desktop conversion rate
- Mobile bounce rate
- PWA install rate
- Mobile session duration
- Touch target error rate (analytics)

### Technical Metrics
- Lighthouse mobile score > 90
- First Contentful Paint < 2s on 3G
- Time to Interactive < 3.5s on 3G
- Cumulative Layout Shift < 0.1
- Service worker cache hit rate > 80%

### User Satisfaction
- Mobile app store rating (if applicable)
- User feedback on mobile experience
- Support tickets for mobile issues
- Task completion rate on mobile

---

## Notes & Considerations

### Browser Compatibility
- **iOS Safari:** Primary mobile browser for iOS
  - Test with iOS 15+ (current - 2 versions)
  - PWA support is good but limited vs Android
  - No push notifications on iOS PWA

- **Android Chrome:** Primary mobile browser for Android
  - Excellent PWA support
  - Full feature set available

- **Samsung Internet:** Common on Samsung devices
  - Generally compatible with Chrome
  - Test separately if possible

### Known Limitations
- Jazz.tools sync over slow connections (test on 3G)
- Large lists may impact mobile performance
- Drag-and-drop on mobile can be finicky
- OAuth redirects on mobile need testing
- BetterAuth mobile compatibility needs verification

### Future Enhancements (Not in Sprint)
- Push notifications (requires backend changes)
- Native mobile app (React Native)
- Tablet-optimized layouts
- Dark mode (mobile preference)
- Voice input for adding items
- Barcode scanning
- Location-based list suggestions
- Share to other apps
- Widgets (iOS/Android)

---

## Resources

### Documentation
- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [Tailwind Responsive Design](https://tailwindcss.com/docs/responsive-design)
- [Playwright Mobile Emulation](https://playwright.dev/docs/emulation)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)

### Tools
- [Favicon Generator](https://realfavicongenerator.net/)
- [PWA Builder](https://www.pwabuilder.com/)
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
- [Mobile-Friendly Test](https://search.google.com/test/mobile-friendly)

### Testing
- [BrowserStack](https://www.browserstack.com/) - Real device testing
- [Chrome DevTools Device Mode](https://developer.chrome.com/docs/devtools/device-mode/)
- [Responsively App](https://responsively.app/) - Multi-device preview

---

**Document Version:** 1.0
**Last Updated:** 2025-11-03
**Owner:** Development Team
**Status:** Ready for Sprint Planning
