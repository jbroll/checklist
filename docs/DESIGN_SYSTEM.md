# Design System Documentation

**Project:** GroceryList Application
**Version:** 1.0
**Last Updated:** 2025-11-03

---

## Table of Contents

1. [Overview](#overview)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Component Library](#component-library)
6. [Accessibility Guidelines](#accessibility-guidelines)
7. [Animation Patterns](#animation-patterns)

---

## Overview

The GroceryList design system provides a consistent, accessible, and maintainable foundation for the application's UI. All components are built using:

- **React 18** with TypeScript
- **Tailwind CSS** for utility-first styling
- **Radix UI** for accessible primitives
- **Framer Motion** for animations
- **class-variance-authority** for component variants

### Design Principles

1. **Consistency:** Use design tokens and reusable components
2. **Accessibility:** WCAG 2.1 AA compliance by default
3. **Performance:** Minimal re-renders, optimized bundle size
4. **Developer Experience:** Clear APIs, comprehensive documentation

---

## Color System

### Primary Colors (Green)

Used for primary actions, selected states, and brand elements.

```
green-50:  #f0fdf4  - Hover backgrounds, subtle highlights
green-100: #dcfce7  - Selected backgrounds
green-500: #22c55e  - Focus rings
green-600: #16a34a  - Primary buttons, links (DEFAULT)
green-700: #15803d  - Primary button hover
```

**Usage:**
- Primary buttons: `bg-green-600 hover:bg-green-700`
- Selected items: `bg-green-100`
- Focus rings: `ring-green-500/20`

### Neutral Colors (Gray)

Used for text, borders, backgrounds, and secondary elements.

```
neutral-50:  #fafafa  - Page backgrounds
neutral-100: #f5f5f5  - Hover backgrounds
neutral-200: #e5e5e5  - Borders, dividers
neutral-300: #d4d4d4  - Input borders
neutral-500: #737373  - Secondary text
neutral-600: #525252  - Body text
neutral-700: #404040  - Labels, medium emphasis
neutral-900: #171717  - Headings, high emphasis
```

**Usage:**
- Text hierarchy: `text-neutral-900` (headings) → `text-neutral-700` (labels) → `text-neutral-600` (body)
- Borders: `border-neutral-200` or `border-neutral-300`
- Backgrounds: `bg-neutral-50` (page) → `bg-white` (cards)

### Semantic Colors

```
red-600:    #dc2626  - Danger actions, errors
yellow-600: #ca8a04  - Folder icons
purple-900: #581c87  - Template badges
blue-500:   #3b82f6  - Informational elements
```

**Usage:**
- Error text: `text-red-600`
- Success messages: `text-green-700`
- Warning badges: `bg-amber-100 text-amber-700`

### Category Colors

Pre-defined colors for grocery categories (defined in `tailwind.config.js`):

```
produce:   #22c55e  (green)
dairy:     #3b82f6  (blue)
meat:      #ef4444  (red)
bakery:    #f59e0b  (amber)
frozen:    #06b6d4  (cyan)
pantry:    #8b5cf6  (purple)
beverages: #ec4899  (pink)
snacks:    #f97316  (orange)
household: #6366f1  (indigo)
personal:  #14b8a6  (teal)
pet:       #a855f7  (purple)
other:     #64748b  (slate)
```

---

## Typography

### Font Family

- **Primary:** System font stack (San Francisco, Segoe UI, Roboto)
- **Fallback:** `ui-sans-serif, system-ui, sans-serif`

### Type Scale

```tsx
// Headings
text-3xl font-bold        // H1: 30px, Page titles
text-xl font-semibold     // H2: 20px, Section headers
text-lg font-semibold     // H3: 18px, Dialog titles
text-base font-semibold   // H4: 16px, Card headers

// Body
text-sm                   // Body: 14px, Default text size
text-xs                   // Small: 12px, Helper text, labels

// Specialized
text-sm font-medium       // Buttons, Labels
text-sm font-semibold     // Template/folder names
```

### Text Colors

```tsx
text-neutral-900    // Primary text (headings)
text-neutral-700    // Labels, medium emphasis
text-neutral-600    // Body text
text-neutral-500    // Secondary text, helper text
text-white          // Text on dark backgrounds
```

### Usage Examples

```tsx
// Page title
<h1 className="text-3xl font-bold text-neutral-900">BubbleList</h1>

// Section header
<h2 className="text-xl font-semibold text-neutral-900">Shopping Lists</h2>

// Body text
<p className="text-sm text-neutral-600">Description text goes here.</p>

// Helper text
<p className="text-xs text-neutral-500">Auto-generated names use [YYYY-MM-DD HH:MM]</p>
```

---

## Spacing & Layout

### Spacing Scale

Follow Tailwind's default spacing scale (4px increments):

```
p-1  = 4px     gap-1  = 4px
p-2  = 8px     gap-2  = 8px
p-3  = 12px    gap-3  = 12px
p-4  = 16px    gap-4  = 16px
p-6  = 24px    gap-6  = 24px
p-8  = 32px    gap-8  = 32px
```

### Layout Guidelines

**Page Layout:**
```tsx
<div className="min-h-screen bg-neutral-50 p-6">
  <main className="mx-auto max-w-4xl">
    {/* Content */}
  </main>
</div>
```

**Component Spacing:**
- Page padding: `p-6` (24px)
- Card padding: `p-4` (16px)
- Element gap: `gap-3` (12px) for related items
- Section gap: `gap-4` or `gap-6` (16-24px)

**Border Radius:**
```
rounded-md   = 6px   // Inputs, buttons
rounded-lg   = 8px   // Cards, dialogs
rounded-full = 9999px // Badges, circular buttons
```

---

## Component Library

### Button Component

**Location:** `src/components/ui/button.tsx`

**Variants:**
- `primary` - Green filled button (main actions)
- `secondary` - Gray outline button (cancel, secondary actions)
- `outline` - Green outline button (alternative primary)
- `ghost` - Transparent button (icon buttons)
- `danger` - Red filled button (destructive actions)
- `link` - Text-only button (links)

**Sizes:**
- `sm` - Height 32px, padding 12px
- `md` - Height 40px, padding 16px (default)
- `lg` - Height 48px, padding 24px
- `icon` - Square 36x36px (for icon-only buttons)

**Usage Examples:**

```tsx
import { Button } from '@/components/ui/button';

// Primary action
<Button variant="primary" onClick={handleSave}>
  Save Changes
</Button>

// Secondary action
<Button variant="secondary" onClick={handleCancel}>
  Cancel
</Button>

// Icon button
<Button variant="ghost" size="icon" aria-label="More options">
  <MoreVertical className="h-5 w-5" />
</Button>

// Danger action
<Button variant="danger" onClick={handleDelete}>
  Delete
</Button>

// Loading state
<Button variant="primary" disabled={isLoading}>
  {isLoading ? 'Saving...' : 'Save'}
</Button>
```

**Accessibility:**
- Always provide `aria-label` for icon-only buttons
- Use `disabled` prop for loading/disabled states
- Focus visible by default with ring styles

---

### Input Component

**Location:** `src/components/ui/input.tsx`

**Variants:**
- `default` - Standard text input (height 40px)
- `inline` - Compact inline editing input

**Usage Examples:**

```tsx
import { Input } from '@/components/ui/input';

// Standard input
<Input
  type="text"
  placeholder="Enter name..."
  value={value}
  onChange={(e) => setValue(e.target.value)}
/>

// Inline editing
<Input
  variant="inline"
  value={editedName}
  onChange={(e) => setEditedName(e.target.value)}
/>

// Error state (via FormField)
<FormField label="Email" htmlFor="email" error="Email is required">
  <Input id="email" type="email" />
</FormField>
```

**Accessibility:**
- Always pair with `<label>` or use `aria-label`
- Use `aria-invalid` for error states
- Use `aria-describedby` to link to helper/error text

---

### FormField Component

**Location:** `src/components/ui/form-field.tsx`

**Props:**
- `label` - Label text (required)
- `htmlFor` - Input ID (required)
- `error` - Error message to display
- `required` - Shows asterisk, adds required indicator
- `helperText` - Helper text below label
- `children` - Input element(s)

**Usage Examples:**

```tsx
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

// Basic field
<FormField label="Name" htmlFor="name" required>
  <Input id="name" type="text" />
</FormField>

// With error
<FormField label="Email" htmlFor="email" error="Email is required">
  <Input id="email" type="email" />
</FormField>

// With helper text
<FormField
  label="Session Name"
  htmlFor="session"
  helperText="Auto-generated names use [YYYY-MM-DD HH:MM]"
>
  <Input id="session" type="text" />
</FormField>
```

**Accessibility:**
- Automatically adds `aria-invalid` when error present
- Links error text with `aria-describedby`
- Error messages have `role="alert"`

---

### Badge Component

**Location:** `src/components/ui/badge.tsx`

**Variants:**
- `neutral` - Gray badge (default)
- `primary` - Green badge
- `success` - Green badge (alias)
- `warning` - Amber badge
- `error` - Red badge
- `info` - Blue badge

**Usage Examples:**

```tsx
import { Badge } from '@/components/ui/badge';

// Item count
<Badge variant="neutral">{count}</Badge>

// Status indicator
<Badge variant="success">Active</Badge>

// Warning
<Badge variant="warning">Draft</Badge>
```

---

### Loading Components

**Location:** `src/components/ui/loading.tsx`

**Components:**
- `LoadingSpinner` - Inline spinner (sm, md, lg sizes)
- `LoadingScreen` - Full-screen loading state

**Usage Examples:**

```tsx
import { LoadingSpinner, LoadingScreen } from '@/components/ui/loading';

// Inline spinner
<LoadingSpinner size="sm" />

// In button
<Button disabled={isLoading}>
  {isLoading && <LoadingSpinner size="sm" />}
  {isLoading ? 'Loading...' : 'Submit'}
</Button>

// Full screen
if (!data) return <LoadingScreen message="Loading your lists..." />;
```

---

### EmptyState Component

**Location:** `src/components/ui/empty-state.tsx`

**Props:**
- `icon` - Emoji or icon (optional)
- `title` - Main message
- `description` - Supporting text (optional)
- `action` - Action button (optional)

**Usage Examples:**

```tsx
import { EmptyState } from '@/components/ui/empty-state';

// Simple empty state
<EmptyState
  icon="📋"
  title="No lists yet"
  description="Create your first list to get started."
/>

// With action
<EmptyState
  icon="🛒"
  title="No items in cart"
  description="Add items to start shopping."
  action={<Button onClick={handleAdd}>Add Item</Button>}
/>
```

---

### Dialog Components

**Location:** `src/components/ui/dialog.tsx`

Radix UI Dialog wrappers with consistent styling.

**Components:**
- `Dialog` - Container
- `DialogTrigger` - Trigger button
- `DialogContent` - Content wrapper (max-width: 425-550px)
- `DialogHeader` - Header section
- `DialogTitle` - Title (required for accessibility)
- `DialogDescription` - Description text
- `DialogFooter` - Footer with actions

**Usage Example:**

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="sm:max-w-[425px]">
    <DialogHeader>
      <DialogTitle>Create New List</DialogTitle>
      <DialogDescription>
        Enter a name for your new shopping list.
      </DialogDescription>
    </DialogHeader>

    <form onSubmit={handleSubmit}>
      <div className="grid gap-4 py-4">
        <FormField label="List Name" htmlFor="name" required>
          <Input id="name" type="text" />
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={handleCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Create
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

---

## Accessibility Guidelines

### Semantic HTML

Always use semantic HTML elements:

```tsx
// ✅ Good
<header>...</header>
<main id="main-content">...</main>
<nav>...</nav>
<button type="button">Click</button>

// ❌ Bad
<div>...</div> (for header/main/nav)
<div onClick={...}>Click</div> (for button)
```

### ARIA Labels

Provide labels for all interactive elements:

```tsx
// Icon buttons
<Button variant="ghost" size="icon" aria-label="More options">
  <MoreVertical className="h-5 w-5" />
</Button>

// Decorative icons
<CheckCircle className="h-5 w-5" aria-hidden="true" />

// Form inputs (via FormField)
<FormField label="Email" htmlFor="email">
  <Input id="email" type="email" />
</FormField>
```

### Focus Management

Ensure visible focus indicators:

```tsx
// All interactive elements have focus rings
className="focus:outline-none focus:ring-2 focus:ring-green-500/20"

// Skip-to-content link
<a href="#main-content" className="sr-only focus:not-sr-only ...">
  Skip to main content
</a>
```

### Live Regions

Announce dynamic changes to screen readers:

```tsx
// Success/error messages
<output aria-live="polite" aria-atomic="true">
  {message}
</output>

// Status updates
<div role="status" aria-live="polite">
  Loading...
</div>
```

### Keyboard Navigation

- All interactive elements must be keyboard accessible
- Use native elements (`<button>`, `<a>`) when possible
- Tab order should match visual order
- Provide keyboard shortcuts for common actions (optional)

---

## Animation Patterns

### Transitions

Use consistent timing and easing:

```tsx
// Hover transitions (fast)
className="transition-colors duration-150"

// State changes (base)
className="transition-all duration-200"

// Layout animations (smooth)
className="transition-all duration-300"
```

### Framer Motion

**Standard Patterns:**

```tsx
// Fade in
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.2 }}
>

// Slide down (expand)
<motion.div
  initial={{ height: 0, opacity: 0 }}
  animate={{ height: 'auto', opacity: 1 }}
  exit={{ height: 0, opacity: 0 }}
  transition={{ duration: 0.3 }}
>

// Scale in
<motion.div
  initial={{ scale: 0.95, opacity: 0 }}
  animate={{ scale: 1, opacity: 1 }}
  exit={{ scale: 0.95, opacity: 0 }}
  transition={{ duration: 0.2 }}
>
```

**Respect User Preferences:**

Always respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Best Practices

### Component Composition

Build complex UIs by composing smaller components:

```tsx
// ✅ Good - Composable
<Dialog>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    <FormField label="Name" htmlFor="name">
      <Input id="name" />
    </FormField>
    <DialogFooter>
      <Button variant="secondary">Cancel</Button>
      <Button variant="primary">Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

// ❌ Bad - Monolithic
<CustomDialog
  title="Title"
  fields={[{ name: 'name', label: 'Name' }]}
  onSave={handleSave}
/>
```

### TypeScript

Always use TypeScript for type safety:

```tsx
// ✅ Good - Typed props
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  children: React.ReactNode;
}

// ❌ Bad - Any types
function Button(props: any) { ... }
```

### Performance

- Use `React.memo()` for expensive components
- Avoid inline object/array creation in props
- Use `useCallback` for event handlers in lists
- Optimize images and assets

### Testing

- Write unit tests for utility functions
- Write E2E tests for user flows
- Test accessibility with keyboard and screen readers
- Run automated accessibility checks

---

## Migration Guide

### Migrating to New Components

**Before:**
```tsx
<button className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
  Save
</button>

<div className="grid gap-2">
  <label htmlFor="name" className="text-sm font-medium">Name</label>
  <input
    id="name"
    type="text"
    className="flex h-10 w-full rounded-md border border-neutral-300 bg-white px-3 py-2..."
  />
</div>
```

**After:**
```tsx
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

<Button variant="primary">Save</Button>

<FormField label="Name" htmlFor="name">
  <Input id="name" type="text" />
</FormField>
```

---

## Resources

### Documentation
- **Tailwind CSS:** https://tailwindcss.com/docs
- **Radix UI:** https://www.radix-ui.com/primitives/docs
- **Framer Motion:** https://www.framer.com/motion/
- **WCAG Guidelines:** https://www.w3.org/WAI/WCAG21/quickref/

### Tools
- **TypeScript:** https://www.typescriptlang.org/
- **Vite:** https://vitejs.dev/
- **Biome:** https://biomejs.dev/
- **Playwright:** https://playwright.dev/

---

## Changelog

### v1.0 (2025-11-03)
- Initial design system documentation
- Documented all UI components (Button, Input, FormField, Badge, Loading, EmptyState)
- Defined color system and typography scale
- Added accessibility guidelines
- Added animation patterns and best practices
