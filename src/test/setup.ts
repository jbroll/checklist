/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

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
const originalError = console.error;
const originalWarn = console.warn;

global.console = {
  ...console,
  // Keep errors but filter out known Jazz initialization warnings
  error: (...args) => {
    const message = args[0]?.toString() || '';
    if (
      message.includes('Jazz') ||
      message.includes('CoMap') ||
      message.includes('account initialization') ||
      message.includes('Warning: ReactDOM.render')
    ) {
      return; // Suppress Jazz/React initialization errors in tests
    }
    originalError(...args);
  },
  warn: (...args) => {
    const message = args[0]?.toString() || '';
    if (
      message.includes('Jazz') ||
      message.includes('CoMap') ||
      message.includes('componentWillReceiveProps')
    ) {
      return; // Suppress Jazz/React warnings in tests
    }
    originalWarn(...args);
  },
  // Suppress log/info in tests unless debugging
  log: process.env.VITEST_DEBUG ? console.log : vi.fn(),
  info: process.env.VITEST_DEBUG ? console.info : vi.fn(),
};

// Mock jazz-tools module
vi.mock('jazz-tools', () => ({
  useAccount: vi.fn(() => null),
  logout: vi.fn(),
  co: {
    map: vi.fn(() => ({
      withMigration: vi.fn((_fn) => ({
        optional: vi.fn(() => ({})),
        create: vi.fn(() => ({})),
      })),
      optional: vi.fn(() => ({})),
      create: vi.fn(() => ({})),
    })),
    list: vi.fn(() => ({
      optional: vi.fn(() => ({})),
      create: vi.fn(() => ({})),
    })),
    profile: vi.fn(() => ({
      optional: vi.fn(() => ({})),
      create: vi.fn(() => ({})),
    })),
    account: vi.fn(() => ({
      withMigration: vi.fn((_fn) => ({
        optional: vi.fn(() => ({})),
        create: vi.fn(() => ({})),
      })),
      optional: vi.fn(() => ({})),
      create: vi.fn(() => ({})),
    })),
    record: vi.fn(() => ({
      optional: vi.fn(() => ({})),
      create: vi.fn(() => ({})),
    })),
    optional: vi.fn((schema) => schema),
  },
  z: {
    string: vi.fn(() => ({ optional: vi.fn() })),
    number: vi.fn(() => ({ optional: vi.fn() })),
    boolean: vi.fn(() => ({ optional: vi.fn() })),
    object: vi.fn(() => ({ optional: vi.fn() })),
    array: vi.fn(() => ({ optional: vi.fn() })),
    enum: vi.fn(() => ({ optional: vi.fn() })),
    tuple: vi.fn(() => ({ optional: vi.fn() })),
    date: vi.fn(() => ({ optional: vi.fn() })),
    unknown: vi.fn(() => ({ optional: vi.fn() })),
    record: vi.fn(() => ({ optional: vi.fn() })),
    union: vi.fn(() => ({ optional: vi.fn() })),
    literal: vi.fn(() => ({ optional: vi.fn(), default: vi.fn() })),
    optional: vi.fn((schema) => schema),
  },
}));

// Mock jazz-react module
vi.mock('jazz-react', () => ({
  useAccount: vi.fn(() => ({
    logOut: vi.fn(),
  })),
  useCoState: vi.fn(() => null),
  DemoAuth: vi.fn(() => null),
  DemoAuthBasicUI: vi.fn(() => null),
}));

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

// Helper to create mock Jazz account
export const createMockAccount = (overrides = {}) => ({
  profile: {
    name: 'Test User',
    $jazz: {
      set: vi.fn(),
    },
  },
  root: {
    nodes: [],
    myLists: [],
    sharedLists: [],
    $jazz: {
      set: vi.fn(),
      push: vi.fn(),
      has: vi.fn(() => true),
    },
  },
  $jazz: {
    id: 'test-account-id',
    set: vi.fn(),
    has: vi.fn(() => true),
  },
  ...overrides,
});

// Helper to create mock GroceryList
export const createMockGroceryList = (overrides = {}) => ({
  name: 'Test List',
  items: [],
  owner: createMockAccount(),
  archived: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  $jazz: {
    id: 'test-list-id',
    set: vi.fn(),
    push: vi.fn(),
  },
  ...overrides,
});

// Helper to create mock GroceryItem
export const createMockGroceryItem = (overrides = {}) => ({
  name: 'Test Item',
  category: 'other',
  checked: false,
  archived: false,
  addedBy: createMockAccount(),
  checkedBy: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
  $jazz: {
    id: 'test-item-id',
    set: vi.fn(),
  },
  ...overrides,
});
