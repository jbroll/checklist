# Add Missing Shared Primitives to jbr-jazz Packages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the generic utilities, hooks, components, and client SDKs to jbr-jazz that CheckList currently re-implements locally, so CheckList (and other apps) can delete their duplicated code.

**Architecture:** Add small, focused modules to `@jbr-jazz/hierarchy-shared`, `@jbr-jazz/hierarchy-client`, and a new `@jbr-jazz/billing-client` package. Keep each export generic and backward-compatible. Avoid any CheckList-specific types or behavior.

**Tech Stack:** TypeScript, jazz-tools, React, Radix UI, Tailwind CSS, nanoid, better-auth.

## Execution Status (updated 2026-07-06)

Progress is tracked by **jbr-jazz git history**, not the checkboxes below (the executor committed without ticking them).

| Task | Status | jbr-jazz commit |
|---|---|---|
| A1 `generateId` | ✅ Done | `9d415a5` |
| A2 path helpers | ✅ Done | `32bab9b` |
| A3 account guards | ✅ Done | `f03bfb6` |
| A4 generic hooks | ✅ Done | `45dc54c` |
| A5 dialog primitives | ✅ Done (adapted) | `646183b` |
| A6 migration factory | ⏸️ **Deferred** | — |
| A7 merge-client SDK | ✏️ **Needs rewrite** | — |
| A8 billing-client | 🔀 **Split** | — |

**A5 adaptations vs. the spec below:** primitives live in `components/ui/` (not `components/`); the alert component was named `MessageDialog` to avoid colliding with the existing `components/ui/AlertDialog.tsx`; Button variants used are the real ones (`primary`/`danger`/`outline`, not `default`/`destructive`).

**A6 — deferred.** jbr-jazz has no existing account-migration pattern to model against, and CheckList has exactly one call site (`src/schema/index.ts`). The factory as specced (`account.root = createRoot()`, `$jazz.ensureLoaded`) is speculative against the real jazz-tools API. Revisit only when Plan 2 forces the real interface.

**A7 — needs rewrite.** The spec targets `/api/account/merge/initiate` + `/adopt`, which do not exist. The real backend flow is `start → prepare → finalize` (nonce-based) plus `/agent` (see `packages/hierarchy/backend/src/account-merge.ts`). A 2-method SDK cannot replace CheckList's `src/lib/account-merge.ts`. Re-spec against the real endpoints before implementing.

**A8 — split.** The "sync" half already exists: `@jbr-jazz/billing-client`'s `useSubscription()` implements `syncSubscription()` against `/api/billing/subscription/status`. The "checkout/portal" half depends on `/api/billing/checkout` + `/portal`, which live in CheckList's own backend and have **not** been migrated to `billing-backend` yet — that is Plan 3 (backend billing migration). Defer the checkout/portal helpers until those endpoints exist in jbr-jazz. Do **not** apply the plan's `package.json` (it would downgrade the existing package).

## Global Constraints

- Package changes must be **additive and backward-compatible**; `wickedmap` also consumes these packages.
- After editing jbr-jazz package source, **rebuild** the package: `cd /home/john/src/jbr-jazz/packages/<package> && npm run build`.
- CheckList consumes packages via `file:../jbr-jazz/packages/...` symlinks; rebuilds are reflected immediately after `npm run build`.
- Commit messages: subject 10-72 chars, body only `Co-Authored-By: Claude <noreply@anthropic.com>`, ASCII only.
- Do not bypass commit hooks.
- Use TDD: failing test first, minimal implementation, passing test, commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/id.ts` | Compact collision-resistant ID generator. |
| `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/path.ts` | Path-string hierarchy helpers (separator, parent, descendant). |
| `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/account-guards.ts` | Runtime guards for Jazz account loaded state. |
| `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/migration.ts` | Reusable account root + viewState + userSettings migration factory. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useDoubleTap.ts` | Cross-platform double-tap detector. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useTheme.ts` | light/dark/system theme with no-FOUC init. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/usePWAInstall.ts` | PWA install prompt helper. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useHashRouter.ts` | Generic hash-based router. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/ConfirmDialog.tsx` | Higher-level confirm wrapper. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/AlertDialog.tsx` | Higher-level alert wrapper. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/SimpleInputDialog.tsx` | Generic single-input dialog. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/lib/dialog-context.tsx` | Programmatic `showConfirm` / `showAlert` API. |
| `/home/john/src/jbr-jazz/packages/hierarchy/client/src/lib/merge-client.ts` | Account merge client SDK. |
| `/home/john/src/jbr-jazz/packages/billing/client/` | New package: `syncSubscription`, checkout/portal redirects. |

---

## Task A1: Add `generateId` to hierarchy-shared

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/id.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/id.test.ts`

**Interfaces:**
- Produces: `export function generateId(length?: number): string`

- [ ] **Step 1: Write the failing test**

Create `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generateId } from '../utils/id.js';

describe('generateId', () => {
  it('returns a string of the requested length', () => {
    expect(generateId(8)).toHaveLength(8);
    expect(generateId(16)).toHaveLength(16);
  });

  it('defaults to length 10', () => {
    expect(generateId()).toHaveLength(10);
  });

  it('returns url-safe characters', () => {
    expect(generateId()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/shared && npx vitest run src/__tests__/id.test.ts`
Expected: FAIL — `generateId` not found.

- [ ] **Step 3: Write minimal implementation**

Create `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/id.ts`:

```ts
import { nanoid } from 'nanoid';

/**
 * Generate a short, URL-safe, collision-resistant identifier.
 * @param length — default 10
 */
export function generateId(length = 10): string {
  return nanoid(length);
}
```

- [ ] **Step 4: Re-export from utils/index.ts**

Add to `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts`:

```ts
export { generateId } from './id.js';
```

- [ ] **Step 5: Re-export from package index.ts**

Add to `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts` under "Shared Utilities":

```ts
export { generateId } from './utils/index.js';
```

- [ ] **Step 6: Run tests and type-check**

Run:
```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/shared
npx vitest run src/__tests__/id.test.ts
npm run type-check
npm run build
```
Expected: PASS, no type errors, dist regenerated.

- [ ] **Step 7: Commit**

```bash
git add /home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/id.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/id.test.ts
git commit -m "feat(hierarchy-shared): add generateId utility"
```

---

## Task A2: Add path-based hierarchy helpers to hierarchy-shared

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/path.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/path.test.ts`

**Interfaces:**
- Produces:
  - `export const DEFAULT_PATH_SEPARATOR = '\x01'`
  - `export function getParentPath(path: string, separator?: string): string`
  - `export function createChildPath(parentPath: string, childName: string, separator?: string): string`
  - `export function isDescendantPath(descendant: string, ancestor: string, separator?: string): boolean`
  - `export function splitPath(path: string, separator?: string): string[]`

- [ ] **Step 1: Write the failing test**

Create `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/path.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createChildPath,
  DEFAULT_PATH_SEPARATOR,
  getParentPath,
  isDescendantPath,
  splitPath,
} from '../utils/path.js';

describe('path utils', () => {
  it('splits and joins paths', () => {
    expect(splitPath(`a${DEFAULT_PATH_SEPARATOR}b`)).toEqual(['a', 'b']);
  });

  it('gets parent path', () => {
    expect(getParentPath(`a${DEFAULT_PATH_SEPARATOR}b`)).toBe('a');
    expect(getParentPath('a')).toBe('');
  });

  it('creates child path', () => {
    expect(createChildPath('a', 'b')).toBe(`a${DEFAULT_PATH_SEPARATOR}b`);
    expect(createChildPath('', 'b')).toBe('b');
  });

  it('detects descendants without prefix false positives', () => {
    const ancestor = `produce${DEFAULT_PATH_SEPARATOR}fresh`;
    expect(isDescendantPath(`produce${DEFAULT_PATH_SEPARATOR}fresh${DEFAULT_PATH_SEPARATOR}apples`, ancestor)).toBe(true);
    expect(isDescendantPath(`produce-special${DEFAULT_PATH_SEPARATOR}fresh`, ancestor)).toBe(false);
    expect(isDescendantPath(ancestor, ancestor)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/shared && npx vitest run src/__tests__/path.test.ts`
Expected: FAIL — path utils not found.

- [ ] **Step 3: Write minimal implementation**

Create `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/path.ts`:

```ts
/**
 * Default hierarchy path separator (ASCII SOH).
 */
export const DEFAULT_PATH_SEPARATOR = '\x01';

function normalize(path: string): string {
  return path.replace(/\x01+/g, '\x01').replace(/^\x01+|\x01+$/g, '');
}

export function splitPath(path: string, separator = DEFAULT_PATH_SEPARATOR): string[] {
  const normalized = normalize(path);
  if (!normalized) return [];
  return normalized.split(separator);
}

export function getParentPath(path: string, separator = DEFAULT_PATH_SEPARATOR): string {
  const parts = splitPath(path, separator);
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join(separator);
}

export function createChildPath(
  parentPath: string,
  childName: string,
  separator = DEFAULT_PATH_SEPARATOR,
): string {
  const parent = normalize(parentPath);
  if (!parent) return childName;
  return `${parent}${separator}${childName}`;
}

export function isDescendantPath(
  descendant: string,
  ancestor: string,
  separator = DEFAULT_PATH_SEPARATOR,
): boolean {
  const d = splitPath(descendant, separator);
  const a = splitPath(ancestor, separator);
  if (a.length === 0 || d.length <= a.length) return false;
  return a.every((part, i) => part === d[i]);
}
```

- [ ] **Step 4: Re-export from utils/index.ts and package index.ts**

Add to `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts`:

```ts
export {
  createChildPath,
  DEFAULT_PATH_SEPARATOR,
  getParentPath,
  isDescendantPath,
  splitPath,
} from './path.js';
```

Add to `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts` under "Path utilities":

```ts
export {
  createChildPath,
  DEFAULT_PATH_SEPARATOR,
  getParentPath,
  isDescendantPath,
  splitPath,
} from './utils/index.js';
```

- [ ] **Step 5: Run tests, type-check, build**

Run:
```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/shared
npx vitest run src/__tests__/path.test.ts
npm run type-check
npm run build
```
Expected: PASS, no type errors, dist regenerated.

- [ ] **Step 6: Commit**

```bash
git add /home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/path.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/path.test.ts
git commit -m "feat(hierarchy-shared): add path-based hierarchy helpers"
```

---

## Task A3: Add Jazz account loaded-state guards

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/account-guards.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/account-guards.test.ts`

**Interfaces:**
- Produces:
  - `export function isAccountLoaded(account: unknown): account is { id: string; root: object }`
  - `export function hasLoadedRoot(account: unknown): account is { root: { folders: object } }`
  - `export function hasLoadedField<T extends object>(root: T, field: keyof T): boolean`

- [ ] **Step 1: Write the failing test**

Create `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/account-guards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hasLoadedField, hasLoadedRoot, isAccountLoaded } from '../utils/account-guards.js';

describe('account guards', () => {
  it('recognizes a loaded account', () => {
    expect(isAccountLoaded(null)).toBe(false);
    expect(isAccountLoaded({ id: 'a', root: {} })).toBe(true);
    expect(isAccountLoaded({ root: {} })).toBe(false);
  });

  it('checks root fields', () => {
    expect(hasLoadedRoot({ root: { folders: [] } })).toBe(true);
    expect(hasLoadedRoot({ root: {} })).toBe(false);
    expect(hasLoadedField({ viewState: {} }, 'viewState')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/shared && npx vitest run src/__tests__/account-guards.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Create `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/account-guards.ts`:

```ts
/**
 * Runtime guards for Jazz account loaded state.
 * Useful while `MaybeLoadedAccount` types require manual narrowing.
 */
export function isAccountLoaded(account: unknown): account is { id: string; root: object } {
  return (
    typeof account === 'object' &&
    account !== null &&
    'id' in account &&
    'root' in account &&
    typeof (account as { id: unknown }).id === 'string' &&
    typeof (account as { root: unknown }).root === 'object' &&
    (account as { root: unknown }).root !== null
  );
}

export function hasLoadedRoot(
  account: unknown,
): account is { root: { folders: object } } {
  return (
    isAccountLoaded(account) &&
    'folders' in account.root &&
    typeof (account.root as { folders: unknown }).folders === 'object' &&
    (account.root as { folders: unknown }).folders !== null
  );
}

export function hasLoadedField<T extends object>(root: T, field: keyof T): boolean {
  return field in root && (root as Record<keyof T, unknown>)[field] !== undefined;
}
```

- [ ] **Step 4: Re-export and build**

Add to `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts`:

```ts
export { hasLoadedField, hasLoadedRoot, isAccountLoaded } from './account-guards.js';
```

Add to `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts`:

```ts
export { hasLoadedField, hasLoadedRoot, isAccountLoaded } from './utils/index.js';
```

Run:
```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/shared
npx vitest run src/__tests__/account-guards.test.ts
npm run type-check
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add /home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/account-guards.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/utils/index.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/account-guards.test.ts
git commit -m "feat(hierarchy-shared): add account loaded-state guards"
```

---

## Task A4: Add generic React hooks to hierarchy-client

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useDoubleTap.ts`
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useTheme.ts`
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/usePWAInstall.ts`
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useHashRouter.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/index.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/index.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/__tests__/useDoubleTap.test.ts`

**Interfaces:**
- Produces:
  - `useDoubleTap(options: { onDoubleTap: (e: PointerEvent) => void; delay?: number }): { onPointerDown: (e: PointerEvent) => void }`
  - `useTheme(): { theme: 'light' | 'dark' | 'system'; setTheme: (t) => void; resolved: 'light' | 'dark' }`
  - `usePWAInstall(): { isInstallable: boolean; isStandalone: boolean; install: () => Promise<void> }`
  - `useHashRouter<T>(parser: (hash: string) => T, serializer: (state: T) => string, initial: T): { state: T; navigate: (state: T) => void; replace: (state: T) => void }`

- [ ] **Step 1: Copy generic implementations from CheckList**

Use these CheckList files as the source of truth for behavior, then strip CheckList-specific naming:
- `src/lib/useDoubleTap.ts`
- `src/lib/useTheme.ts`
- `src/lib/usePWAInstall.ts`
- `src/lib/useNavigationHistory.ts`

- [ ] **Step 2: Create useDoubleTap.ts**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useDoubleTap.ts`:

```ts
import { useCallback, useRef } from 'react';

export interface UseDoubleTapOptions {
  onDoubleTap: (event: React.PointerEvent) => void;
  delay?: number;
}

export function useDoubleTap({ onDoubleTap, delay = 300 }: UseDoubleTapOptions) {
  const lastTapRef = useRef<number>(0);
  const lastTargetRef = useRef<EventTarget | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      const now = Date.now();
      const target = event.target;
      if (
        now - lastTapRef.current < delay &&
        lastTargetRef.current === target
      ) {
        event.preventDefault();
        onDoubleTap(event);
        lastTapRef.current = 0;
        lastTargetRef.current = null;
      } else {
        lastTapRef.current = now;
        lastTargetRef.current = target;
      }
    },
    [onDoubleTap, delay],
  );

  return { onPointerDown };
}
```

- [ ] **Step 3: Create useTheme.ts**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useTheme.ts`:

```ts
import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';

export interface UseThemeOptions {
  storageKey?: string;
  defaultTheme?: Theme;
}

export function useTheme({ storageKey = 'jbr-jazz-theme', defaultTheme = 'system' }: UseThemeOptions = {}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
  });

  const [resolved, setResolved] = useState<'light' | 'dark'>(() =>
    resolveTheme(theme),
  );

  function resolveTheme(t: Theme): 'light' | 'dark' {
    if (t !== 'system') return t;
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  useEffect(() => {
    const resolvedTheme = resolveTheme(theme);
    setResolved(resolvedTheme);
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolvedTheme);
    localStorage.setItem(storageKey, theme);
  }, [theme, storageKey]);

  useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => setResolved(resolveTheme('system'));
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);

  return { theme, resolved, setTheme };
}
```

- [ ] **Step 4: Create usePWAInstall.ts**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/usePWAInstall.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWAInstall() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true,
    );
    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  }, [promptEvent]);

  return { isInstallable: promptEvent !== null, isStandalone, install };
}
```

- [ ] **Step 5: Create useHashRouter.ts**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/useHashRouter.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

export interface UseHashRouterOptions<T> {
  parse: (hash: string) => T;
  serialize: (state: T) => string;
  initial: T;
}

export function useHashRouter<T>({ parse, serialize, initial }: UseHashRouterOptions<T>) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    return parse(window.location.hash);
  });

  useEffect(() => {
    const handler = () => setState(parse(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [parse]);

  const navigate = useCallback(
    (next: T) => {
      window.location.hash = serialize(next);
    },
    [serialize],
  );

  const replace = useCallback(
    (next: T) => {
      window.history.replaceState(null, '', '#' + serialize(next));
      setState(next);
    },
    [serialize],
  );

  return { state, navigate, replace };
}
```

- [ ] **Step 6: Re-export hooks and build**

Add to `/home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/index.ts`:

```ts
export { useDoubleTap } from './useDoubleTap.js';
export type { UseDoubleTapOptions } from './useDoubleTap.js';
export { useHashRouter } from './useHashRouter.js';
export type { UseHashRouterOptions } from './useHashRouter.js';
export { usePWAInstall } from './usePWAInstall.js';
export { useTheme } from './useTheme.js';
export type { Theme, UseThemeOptions } from './useTheme.js';
```

Add to `/home/john/src/jbr-jazz/packages/hierarchy/client/src/index.ts` under "Hooks":

```ts
export {
  useDoubleTap,
  useHashRouter,
  usePWAInstall,
  useTheme,
} from './hooks/index.js';
export type {
  Theme,
  UseDoubleTapOptions,
  UseHashRouterOptions,
  UseThemeOptions,
} from './hooks/index.js';
```

Run:
```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/client
npm run type-check
npm run build
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add /home/john/src/jbr-jazz/packages/hierarchy/client/src/hooks/
git commit -m "feat(hierarchy-client): add generic useDoubleTap, useTheme, usePWAInstall, useHashRouter hooks"
```

---

## Task A5: Add dialog primitives to hierarchy-client

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/AlertDialog.tsx`
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/ConfirmDialog.tsx`
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/SimpleInputDialog.tsx`
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/lib/dialog-context.tsx`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/index.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/index.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/__tests__/dialog-context.test.tsx`

**Interfaces:**
- Produces:
  - `AlertDialogProps`
  - `ConfirmDialogProps`
  - `SimpleInputDialogProps`
  - `useDialog(): { showAlert(options): Promise<void>; showConfirm(options): Promise<boolean>; showInput(options): Promise<string | null> }`

- [ ] **Step 1: Create AlertDialog.tsx**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/AlertDialog.tsx`:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog.js';
import { Button } from './Button.js';

export interface AlertDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  onConfirm: () => void;
}

export function AlertDialog({ open, title, message, confirmText = 'OK', onConfirm }: AlertDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onConfirm()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {message && <DialogDescription>{message}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onConfirm}>{confirmText}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create ConfirmDialog.tsx**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/ConfirmDialog.tsx`:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog.js';
import { Button } from './Button.js';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {message && <DialogDescription>{message}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant={variant === 'danger' ? 'destructive' : 'default'} onClick={onConfirm}>
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create SimpleInputDialog.tsx**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/SimpleInputDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './Dialog.js';
import { Button } from './Button.js';
import { Input } from './Input.js';

export interface SimpleInputDialogProps {
  open: boolean;
  title: string;
  description?: string;
  inputLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  required?: boolean;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function SimpleInputDialog({
  open,
  title,
  description,
  inputLabel,
  defaultValue = '',
  placeholder,
  confirmText = 'Save',
  cancelText = 'Cancel',
  required = true,
  onSubmit,
  onCancel,
}: SimpleInputDialogProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue, open]);

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (required && !value.trim()) return;
    onSubmit(value.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          {inputLabel && <label className="mb-2 block text-sm font-medium">{inputLabel}</label>}
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
          />
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              {cancelText}
            </Button>
            <Button type="submit">{confirmText}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create dialog-context.tsx**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/lib/dialog-context.tsx`:

```tsx
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertDialog } from '../components/AlertDialog.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { SimpleInputDialog } from '../components/SimpleInputDialog.js';

type AlertOptions = {
  title: string;
  message?: string;
  confirmText?: string;
};

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
};

type InputOptions = {
  title: string;
  description?: string;
  inputLabel?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  required?: boolean;
};

type DialogState =
  | { type: 'alert'; options: AlertOptions; resolve: () => void }
  | { type: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: 'input'; options: InputOptions; resolve: (value: string | null) => void }
  | null;

interface DialogContextValue {
  showAlert: (options: AlertOptions) => Promise<void>;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
  showInput: (options: InputOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState>(null);

  const close = useCallback(() => setDialog(null), []);

  const showAlert = useCallback((options: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setDialog({ type: 'alert', options, resolve });
    });
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ type: 'confirm', options, resolve });
    });
  }, []);

  const showInput = useCallback((options: InputOptions) => {
    return new Promise<string | null>((resolve) => {
      setDialog({ type: 'input', options, resolve });
    });
  }, []);

  const value = useMemo(
    () => ({ showAlert, showConfirm, showInput }),
    [showAlert, showConfirm, showInput],
  );

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog?.type === 'alert' && (
        <AlertDialog
          open
          title={dialog.options.title}
          message={dialog.options.message}
          confirmText={dialog.options.confirmText}
          onConfirm={() => {
            dialog.resolve();
            close();
          }}
        />
      )}
      {dialog?.type === 'confirm' && (
        <ConfirmDialog
          open
          title={dialog.options.title}
          message={dialog.options.message}
          confirmText={dialog.options.confirmText}
          cancelText={dialog.options.cancelText}
          variant={dialog.options.variant}
          onConfirm={() => {
            dialog.resolve(true);
            close();
          }}
          onCancel={() => {
            dialog.resolve(false);
            close();
          }}
        />
      )}
      {dialog?.type === 'input' && (
        <SimpleInputDialog
          open
          title={dialog.options.title}
          description={dialog.options.description}
          inputLabel={dialog.options.inputLabel}
          defaultValue={dialog.options.defaultValue}
          placeholder={dialog.options.placeholder}
          confirmText={dialog.options.confirmText}
          cancelText={dialog.options.cancelText}
          required={dialog.options.required}
          onSubmit={(value) => {
            dialog.resolve(value);
            close();
          }}
          onCancel={() => {
            dialog.resolve(null);
            close();
          }}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
```

- [ ] **Step 5: Re-export and build**

Add to `/home/john/src/jbr-jazz/packages/hierarchy/client/src/components/index.ts`:

```ts
export { AlertDialog } from './AlertDialog.js';
export type { AlertDialogProps } from './AlertDialog.js';
export { ConfirmDialog } from './ConfirmDialog.js';
export type { ConfirmDialogProps } from './ConfirmDialog.js';
export { SimpleInputDialog } from './SimpleInputDialog.js';
export type { SimpleInputDialogProps } from './SimpleInputDialog.js';
```

Add to `/home/john/src/jbr-jazz/packages/hierarchy/client/src/index.ts`:

```ts
export { DialogProvider, useDialog } from './lib/dialog-context.js';
export type {
  AlertDialogProps,
  ConfirmDialogProps,
  SimpleInputDialogProps,
} from './components/index.js';
export { AlertDialog, ConfirmDialog, SimpleInputDialog } from './components/index.js';
```

Run:
```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/client
npm run type-check
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add /home/john/src/jbr-jazz/packages/hierarchy/client/src/components/AlertDialog.tsx \
  /home/john/src/jbr-jazz/packages/hierarchy/client/src/components/ConfirmDialog.tsx \
  /home/john/src/jbr-jazz/packages/hierarchy/client/src/components/SimpleInputDialog.tsx \
  /home/john/src/jbr-jazz/packages/hierarchy/client/src/lib/dialog-context.tsx \
  /home/john/src/jbr-jazz/packages/hierarchy/client/src/components/index.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/client/src/index.ts
git commit -m "feat(hierarchy-client): add generic dialog primitives and dialog-context"
```

---

## Task A6: Add account root migration factory to hierarchy-shared

> ⏸️ **DEFERRED — see Execution Status.** Speculative abstraction, no existing pattern in jbr-jazz, single CheckList call site. Do not implement as written.

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/migration.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/migration.test.ts`

**Interfaces:**
- Produces: `createAccountMigration<R, V, U>(options)` returning a `.withMigration` callback for `co.account()`.

- [ ] **Step 1: Write the failing test**

Create `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/migration.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createAccountMigration } from '../migration.js';

describe('createAccountMigration', () => {
  it('returns a migration function', () => {
    const migration = createAccountMigration({
      createRoot: vi.fn(() => ({ folders: [] })),
      createViewState: vi.fn(() => ({ folderExpanded: {} })),
      createUserSettings: vi.fn(() => ({})),
      onCreated: vi.fn(),
    });
    expect(typeof migration).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/john/src/jbr-jazz/packages/hierarchy/shared && npx vitest run src/__tests__/migration.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Create `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/migration.ts`:

```ts
export interface AccountMigrationOptions<R, V, U> {
  createRoot: () => R;
  createViewState: () => V;
  createUserSettings: () => U;
  onCreated?: (account: { root: R; viewState: V; userSettings: U }) => void | Promise<void>;
}

export function createAccountMigration<R, V, U>({
  createRoot,
  createViewState,
  createUserSettings,
  onCreated,
}: AccountMigrationOptions<R, V, U>) {
  return async (account: { root?: R | undefined; viewState?: V | undefined; userSettings?: U | undefined }) => {
    let created = false;

    if (!account.root) {
      account.root = createRoot();
      created = true;
    }

    const root = account.root;
    await (root as { $jazz?: { ensureLoaded?: () => Promise<void> } }).$jazz?.ensureLoaded?.();

    if (!account.viewState) {
      account.viewState = createViewState();
      created = true;
    }

    if (!account.userSettings) {
      account.userSettings = createUserSettings();
      created = true;
    }

    if (created && onCreated) {
      await onCreated(account as { root: R; viewState: V; userSettings: U });
    }
  };
}
```

- [ ] **Step 4: Re-export and build**

Add to `/home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts`:

```ts
export { createAccountMigration } from './migration.js';
export type { AccountMigrationOptions } from './migration.js';
```

Run:
```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/shared
npx vitest run src/__tests__/migration.test.ts
npm run type-check
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add /home/john/src/jbr-jazz/packages/hierarchy/shared/src/migration.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/index.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/shared/src/__tests__/migration.test.ts
git commit -m "feat(hierarchy-shared): add reusable account root migration factory"
```

---

## Task A7: Add account-merge client SDK to hierarchy-client

> ✏️ **NEEDS REWRITE — see Execution Status.** Endpoints below (`/merge/initiate`, `/adopt`) do not exist; real flow is `start → prepare → finalize` + `/agent`. Re-spec before implementing.

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/lib/merge-client.ts`
- Modify: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/index.ts`
- Test: `/home/john/src/jbr-jazz/packages/hierarchy/client/src/__tests__/merge-client.test.ts`

**Interfaces:**
- Produces: `createMergeClient(apiBaseUrl)` returning `{ initiateMerge(): Promise<void>; adoptFolder(folderId): Promise<void>; }`

- [ ] **Step 1: Write minimal implementation**

Create `/home/john/src/jbr-jazz/packages/hierarchy/client/src/lib/merge-client.ts`:

```ts
export interface MergeClient {
  initiateMerge(): Promise<void>;
  adoptFolder(folderId: string): Promise<void>;
}

export function createMergeClient(apiBaseUrl: string): MergeClient {
  async function fetchJson(path: string, options?: RequestInit) {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' },
      ...options,
    });
    if (!response.ok) {
      throw new Error(`Merge request failed: ${response.status} ${response.statusText}`);
    }
  }

  return {
    async initiateMerge() {
      await fetchJson('/api/account/merge/initiate', { method: 'POST' });
    },
    async adoptFolder(folderId: string) {
      await fetchJson('/api/account/merge/adopt', {
        method: 'POST',
        body: JSON.stringify({ folderId }),
      });
    },
  };
}
```

- [ ] **Step 2: Re-export and build**

Add to `/home/john/src/jbr-jazz/packages/hierarchy/client/src/index.ts`:

```ts
export { createMergeClient } from './lib/merge-client.js';
export type { MergeClient } from './lib/merge-client.js';
```

Run:
```bash
cd /home/john/src/jbr-jazz/packages/hierarchy/client
npm run type-check
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add /home/john/src/jbr-jazz/packages/hierarchy/client/src/lib/merge-client.ts \
  /home/john/src/jbr-jazz/packages/hierarchy/client/src/index.ts
git commit -m "feat(hierarchy-client): add account merge client SDK"
```

---

## Task A8: Create `@jbr-jazz/billing-client` package

> 🔀 **SPLIT — see Execution Status.** Package already exists; sync half is done via `useSubscription`. Checkout/portal helpers depend on backend endpoints not yet migrated (Plan 3). Do NOT apply the `package.json` below.

**Files:**
- Create: `/home/john/src/jbr-jazz/packages/billing/client/package.json`
- Create: `/home/john/src/jbr-jazz/packages/billing/client/tsconfig.json`
- Create: `/home/john/src/jbr-jazz/packages/billing/client/tsup.config.ts`
- Create: `/home/john/src/jbr-jazz/packages/billing/client/src/index.ts`
- Create: `/home/john/src/jbr-jazz/packages/billing/client/src/sync.ts`
- Create: `/home/john/src/jbr-jazz/packages/billing/client/src/checkout.ts`
- Modify: `/home/john/src/jbr-jazz/packages/billing/package.json` if a workspace root exists
- Test: `/home/john/src/jbr-jazz/packages/billing/client/src/__tests__/checkout.test.ts`

**Interfaces:**
- Produces:
  - `syncSubscription(apiBaseUrl): Promise<SubscriptionSnapshot>`
  - `redirectToCheckout(apiBaseUrl, tierSlug): Promise<void>`
  - `redirectToPortal(apiBaseUrl): Promise<void>`

- [ ] **Step 1: Create package.json**

Create `/home/john/src/jbr-jazz/packages/billing/client/package.json`:

```json
{
  "name": "@jbr-jazz/billing-client",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "type-check": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@jbr-jazz/billing-shared": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json and tsup.config.ts**

Create `/home/john/src/jbr-jazz/packages/billing/client/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

Create `/home/john/src/jbr-jazz/packages/billing/client/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
});
```

- [ ] **Step 3: Create source files**

Create `/home/john/src/jbr-jazz/packages/billing/client/src/checkout.ts`:

```ts
export async function redirectToCheckout(apiBaseUrl: string, tierSlug: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/billing/checkout`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({ tierSlug }),
  });
  if (!response.ok) {
    throw new Error(`Checkout failed: ${response.status}`);
  }
  const { url } = (await response.json()) as { url?: string };
  if (!url) throw new Error('Checkout response missing url');
  window.location.href = url;
}

export async function redirectToPortal(apiBaseUrl: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/billing/portal`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });
  if (!response.ok) {
    throw new Error(`Portal failed: ${response.status}`);
  }
  const { url } = (await response.json()) as { url?: string };
  if (!url) throw new Error('Portal response missing url');
  window.location.href = url;
}
```

Create `/home/john/src/jbr-jazz/packages/billing/client/src/sync.ts`:

```ts
import type { SubscriptionStatus, SubscriptionTier } from '@jbr-jazz/billing-shared';

export interface SubscriptionSnapshot {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  endsAt?: number;
  maxItems?: number;
  retentionDays?: number;
}

export async function fetchSubscription(apiBaseUrl: string): Promise<SubscriptionSnapshot> {
  const response = await fetch(`${apiBaseUrl}/api/billing/subscription`, {
    credentials: 'include',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!response.ok) {
    throw new Error(`Subscription fetch failed: ${response.status}`);
  }
  return (await response.json()) as SubscriptionSnapshot;
}
```

Create `/home/john/src/jbr-jazz/packages/billing/client/src/index.ts`:

```ts
export { redirectToCheckout, redirectToPortal } from './checkout.js';
export { fetchSubscription } from './sync.js';
export type { SubscriptionSnapshot } from './sync.js';
```

- [ ] **Step 4: Install and build**

Run:
```bash
cd /home/john/src/jbr-jazz/packages/billing/client
npm install
npm run type-check
npm run build
```
Expected: dist created, no type errors.

- [ ] **Step 5: Commit**

```bash
git add /home/john/src/jbr-jazz/packages/billing/client/
git commit -m "feat(billing-client): create package with subscription sync and checkout helpers"
```

---

## Self-Review

**Spec coverage:** Every duplication identified in the code review maps to a task:
- `generateId` → Task A1
- Path utilities → Task A2
- Account guards → Task A3
- `useDoubleTap`/`useTheme`/`usePWAInstall`/`useNavigationHistory` → Task A4
- Dialog/confirm/alert/input → Task A5
- Account migration factory → Task A6
- Account merge SDK → Task A7
- Billing sync/checkout → Task A8

**Placeholder scan:** No TBD/TODO placeholders. Each task has concrete file paths and code.

**Type consistency:** Package exports use consistent naming. CheckList migration plans will import these exact names.
