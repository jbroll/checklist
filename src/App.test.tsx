/**
 * Tests for App routing.
 *
 * Merge-account routing (`?merge=`) was dropped when App.tsx was ported to rowboat —
 * MergeAccountFlow still reads an `Account` the rowboat provider no longer supplies, so
 * its route is disabled for slice 1 (see App.tsx's header comment; merge itself is deferred
 * to rowboat C3, tracked alongside src/lib/__tests__/account-merge.test.ts /
 * src/components/auth/__tests__/MergeAccountFlow.test.tsx). This file now covers what's
 * actually wired: the default route renders AuthGate, and the in-app-browser gate still
 * blocks it when detected.
 */

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock AuthGate so we can detect when it renders
vi.mock('./components/AuthGate', () => ({
  AuthGate: () => <div data-testid="auth-gate" />,
}));

// Mock the rowboat provider
vi.mock('./lib/rowboat', () => ({
  RowboatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock dialog context
vi.mock('./lib/dialog-context', () => ({
  DialogProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDialog: () => ({ showAlert: vi.fn(), showConfirm: vi.fn() }),
}));

// Mock brand
vi.mock('./lib/brand', () => ({
  brand: {
    name: 'CheckList',
    tagline: 'Shared Checklists',
    themeColor: '#000000',
    logos: { favicon: '/favicon.ico' },
  },
}));

let mockIsInAppBrowser = false;
vi.mock('./utils/inAppBrowserDetection', () => ({
  detectInAppBrowser: () => ({ isInAppBrowser: mockIsInAppBrowser }),
}));

// Mock loading screen
vi.mock('./components/ui/loading', () => ({
  LoadingScreen: () => <div data-testid="loading-screen" />,
}));

// Mock sharing component
vi.mock('./components/sharing/InAppBrowserWarning', () => ({
  InAppBrowserWarning: () => <div data-testid="in-app-browser-warning" />,
}));

function setLocation(pathname: string, search = '') {
  Object.defineProperty(window, 'location', {
    value: {
      search,
      pathname,
      origin: 'http://localhost',
      href: `http://localhost${pathname}${search}`,
    },
    writable: true,
  });
}

describe('App routing', () => {
  beforeEach(() => {
    mockIsInAppBrowser = false;
    setLocation('/');
  });

  it('renders AuthGate by default', async () => {
    const { default: App } = await import('./App');
    render(<App />);

    expect(await screen.findByTestId('auth-gate')).toBeInTheDocument();
  });

  it('blocks with InAppBrowserWarning when an in-app browser is detected', async () => {
    mockIsInAppBrowser = true;

    const { default: App } = await import('./App');
    render(<App />);

    expect(await screen.findByTestId('in-app-browser-warning')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-gate')).not.toBeInTheDocument();
  });
});
