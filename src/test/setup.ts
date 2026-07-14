/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

// rowboat test helpers (makeGraph/renderWithRowboat/rowboatJazzMock) — see src/test/rowboat.ts.
// Not re-exported here: tests import them directly from '@/test/rowboat' so `vi.mock('@/jazz', ...)`
// can dynamic-`import()` them without hoisting surprises (see that module's doc comment).

// Mock window.alert for components that use alert() for error messages
global.alert = vi.fn();

// Mock window.confirm for components that use confirm() for confirmations
global.confirm = vi.fn(() => true);

// Mock window.matchMedia for media query tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Suppress log/info in tests unless debugging; error/warn stay real so failures are visible.
global.console = {
  ...console,
  log: process.env.VITEST_DEBUG ? console.log : vi.fn(),
  info: process.env.VITEST_DEBUG ? console.info : vi.fn(),
};

// Mock the rowboat better-auth client (mirrors @jbroll/rowboat-auth-betterauth-react's
// `createBetterAuthClient` shape — see src/lib/auth-client.ts).
vi.mock('@/lib/auth-client', () => ({
  betterAuthClient: {
    signIn: {
      social: vi.fn(),
      email: vi.fn(),
    },
    signUp: {
      email: vi.fn(),
    },
    signOut: vi.fn(),
    getSession: vi.fn(() =>
      Promise.resolve({
        data: {
          user: {
            name: 'Test User',
            email: 'test@example.com',
          },
        },
      }),
    ),
    requestPasswordReset: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn(),
  },
}));
