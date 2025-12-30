/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';
import { createJazzReactModuleMocks } from 'jazz-mock/react';
import { createJazzConsoleFilter, createJazzToolsMock } from 'jazz-mock/vitest';

// Re-export jazz-mock utilities for use in tests
export {
  createMockAccount,
  createMockCoList,
  createMockCoMap,
  createMockJazzAPI,
  generateId,
  resetIdCounter,
} from 'jazz-mock';

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

// Mock console methods to reduce test noise while keeping errors visible
const consoleFilter = createJazzConsoleFilter();
global.console = {
  ...console,
  error: consoleFilter.error,
  warn: consoleFilter.warn,
  // Suppress log/info in tests unless debugging
  log: process.env.VITEST_DEBUG ? console.log : vi.fn(),
  info: process.env.VITEST_DEBUG ? console.info : vi.fn(),
};

// Mock jazz-tools module using jazz-mock
vi.mock('jazz-tools', () => createJazzToolsMock());

// Mock jazz-react module using jazz-mock
vi.mock('jazz-react', () => createJazzReactModuleMocks());

// Mock better-auth client
vi.mock('@/lib/auth-client', () => ({
  betterAuthClient: {
    signIn: {
      social: vi.fn(),
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
  },
}));
