/**
 * Tests for App routing.
 * Verifies that ?merge query param routes to MergeAccountFlow instead of AuthGate.
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock MergeAccountFlow (default export)
vi.mock('./components/auth/MergeAccountFlow', () => ({
  default: () => <div data-testid="merge-flow" />,
}));

// Mock AuthGate so we can detect when it renders
vi.mock('./components/AuthGate', () => ({
  AuthGate: () => <div data-testid="auth-gate" />,
}));

// Mock Jazz provider
vi.mock('./lib/jazz', () => ({
  JazzProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock Jazz inspector to avoid JazzProvider context requirement
vi.mock('jazz-tools/inspector', () => ({
  JazzInspector: () => null,
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

// Mock in-app browser detection (not an in-app browser)
vi.mock('./utils/inAppBrowserDetection', () => ({
  detectInAppBrowser: () => ({ isInAppBrowser: false }),
}));

// Mock loading screen
vi.mock('./components/ui/loading', () => ({
  LoadingScreen: () => <div data-testid="loading-screen" />,
}));

// Mock sharing component
vi.mock('./components/sharing/InAppBrowserWarning', () => ({
  InAppBrowserWarning: () => <div data-testid="in-app-browser-warning" />,
}));

describe('App routing', () => {
  it('renders MergeAccountFlow when ?merge is present', async () => {
    Object.defineProperty(window, 'location', {
      value: {
        search: '?merge=n1',
        pathname: '/',
        origin: 'http://localhost',
        href: 'http://localhost/?merge=n1',
      },
      writable: true,
    });

    const { default: App } = await import('./App');
    render(<App />);

    expect(await screen.findByTestId('merge-flow')).toBeInTheDocument();
    expect(screen.queryByTestId('auth-gate')).not.toBeInTheDocument();
  });
});
