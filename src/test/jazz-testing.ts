/**
 * Jazz Testing Utilities
 *
 * Provides a unified API for testing Jazz-based code with swappable backends:
 *
 * ## Backend Types
 * - 'mock': Fast mocks via jazz-mock (default) - no real Jazz runtime
 * - 'jazz': Real Jazz behavior via jazz-tools/testing - Groups, permissions, sync
 *
 * ## How It Works
 *
 * Backend loading is deferred until JazzTestContext.create() is called.
 * This allows each test file to choose its backend without global configuration.
 *
 * The JAZZ_TEST_BACKEND environment variable sets the default, but can be
 * overridden per-test via the `backend` option.
 *
 * ## Usage
 *
 * ```typescript
 * // Uses default backend (mock, or JAZZ_TEST_BACKEND env var)
 * ctx = await JazzTestContext.create();
 *
 * // Explicitly use mock backend (fast)
 * ctx = await JazzTestContext.create('Owner', { backend: 'mock' });
 *
 * // Explicitly use real Jazz backend (for permission/sync tests)
 * ctx = await JazzTestContext.create('Owner', { backend: 'jazz' });
 * ```
 *
 * @example
 * ```typescript
 * import { JazzTestContext } from '@/test/jazz-testing';
 *
 * describe('Folder Permissions', () => {
 *   let ctx: JazzTestContext;
 *
 *   beforeEach(async () => {
 *     ctx = await JazzTestContext.create();
 *   });
 *
 *   it('should allow writer to edit folder', async () => {
 *     const folder = await ctx.createFolder('Shared');
 *     const writer = await ctx.createAccount('Writer');
 *     ctx.shareFolder(folder, writer, 'writer');
 *     expect(ctx.canWrite(folder, writer)).toBe(true);
 *   });
 * });
 * ```
 */

import {
  createMockBackend,
  createMockCoList,
  createMockCoMap,
  type TestBackend as MockTestBackend,
  type TestGroup as MockTestGroup,
} from 'jazz-mock';
import type { Group } from 'jazz-tools';
import { vi, beforeEach as vitestBeforeEach } from 'vitest';

// Types for dynamically loaded modules
// biome-ignore lint/suspicious/noExplicitAny: Dynamic module types
type AccountType = any;
// biome-ignore lint/suspicious/noExplicitAny: Dynamic module types
type FolderNodeType = any;

/** Backend type */
export type BackendType = 'mock' | 'jazz';

/**
 * Role type for group members
 */
export type Role = 'reader' | 'writer' | 'admin';

/**
 * A test folder with its owning group
 */
export interface TestFolder {
  /** The FolderNode CoValue */
  node: FolderNodeType;
  /** The Group that owns this folder */
  group: Group;
  /** Folder ID */
  id: string;
  /** Internal: mock group reference for mock backend */
  _mockGroup?: MockTestGroup;
}

/**
 * Options for creating a test folder
 */
export interface CreateFolderOptions {
  /** Whether this is a template folder (default: true) */
  isTemplate?: boolean;
  /** Parent folder (for nested folders) */
  parent?: TestFolder;
  /** Use same group as parent (inherits permissions) */
  inheritGroup?: boolean;
}

/**
 * Options for creating a test context
 */
export interface CreateContextOptions {
  /** Backend to use (default: from JAZZ_TEST_BACKEND or 'mock') */
  backend?: BackendType;
}

/**
 * Get the default backend from JAZZ_TEST_BACKEND environment variable.
 * Returns 'mock' if not set or invalid.
 */
function getDefaultBackend(): BackendType {
  const envValue = process.env?.JAZZ_TEST_BACKEND?.toLowerCase();
  if (envValue === 'jazz') return 'jazz';
  if (envValue === 'mock') return 'mock';
  return 'mock';
}

// Cached module references (loaded on demand)
// biome-ignore lint/suspicious/noExplicitAny: Dynamic module cache
let jazzTestingModule: any = null;
// biome-ignore lint/suspicious/noExplicitAny: Dynamic module cache
let schemasModule: any = null;

/**
 * Load jazz-tools/testing module (deferred)
 */
async function getJazzTesting() {
  if (!jazzTestingModule) {
    jazzTestingModule = await import('jazz-tools/testing');
  }
  return jazzTestingModule;
}

/**
 * Load schemas module (deferred)
 */
async function getSchemas() {
  if (!schemasModule) {
    schemasModule = await import('../schemas');
  }
  return schemasModule;
}

/**
 * Jazz Test Context
 *
 * Manages test accounts, sync, and provides fluent helpers for creating
 * test data with proper permission structures.
 *
 * Supports swappable backends:
 * - 'jazz': Real Jazz behavior via jazz-tools/testing
 * - 'mock': Fast mocks via jazz-mock
 */
export class JazzTestContext {
  /** Primary test account (owner) */
  public account: AccountType;

  /** All created accounts for cleanup */
  private accounts: AccountType[] = [];

  /** Mock backend (when using 'mock' backend) */
  private mockBackend: MockTestBackend | null = null;

  /** Backend type */
  public readonly backendType: BackendType;

  private constructor(
    account: AccountType,
    backendType: BackendType,
    mockBackend?: MockTestBackend,
  ) {
    this.account = account;
    this.accounts.push(account);
    this.backendType = backendType;
    this.mockBackend = mockBackend ?? null;
  }

  /**
   * Create a new test context
   *
   * Loads the appropriate backend on demand based on the backend option
   * or JAZZ_TEST_BACKEND environment variable.
   *
   * @param name - Account name (default: 'Test Owner')
   * @param options - Context options including backend selection
   */
  static async create(
    name = 'Test Owner',
    options: CreateContextOptions = {},
  ): Promise<JazzTestContext> {
    const backendType = options.backend ?? getDefaultBackend();

    if (backendType === 'mock') {
      // Use jazz-mock's mock backend
      const mockBackend = createMockBackend();
      await mockBackend.setup();
      const mockAccount = await mockBackend.createPrimaryAccount(name);

      // Wrap mock account to match our interface
      const account = mockAccount.raw as AccountType;
      return new JazzTestContext(account, 'mock', mockBackend);
    }

    // Use real Jazz backend - load modules dynamically
    const jazzTesting = await getJazzTesting();
    const schemas = await getSchemas();

    await jazzTesting.setupJazzTestSync();

    const account = await jazzTesting.createJazzTestAccount({
      AccountSchema: schemas.Account,
      isCurrentActiveAccount: true,
      creationProps: { name },
    });

    return new JazzTestContext(account, 'jazz');
  }

  /**
   * Create an additional test account
   *
   * Accounts are automatically linked for sync.
   */
  async createAccount(name: string): Promise<AccountType> {
    if (this.mockBackend) {
      // Use mock backend
      const mockAccount = await this.mockBackend.createAccount(name);
      const account = mockAccount.raw as AccountType;
      this.accounts.push(account);
      return account;
    }

    // Use real Jazz backend
    const jazzTesting = await getJazzTesting();
    const schemas = await getSchemas();

    const account = await jazzTesting.createJazzTestAccount({
      AccountSchema: schemas.Account,
      creationProps: { name },
    });

    // Link all accounts together for sync
    for (const existing of this.accounts) {
      await jazzTesting.linkAccounts(existing, account);
    }

    this.accounts.push(account);
    return account;
  }

  /**
   * Switch the active account for subsequent operations
   */
  async setActiveAccount(account: AccountType): Promise<void> {
    if (this.mockBackend) {
      // Mock backend doesn't need active account tracking
      return;
    }
    const jazzTesting = await getJazzTesting();
    jazzTesting.setActiveAccount(account);
  }

  /**
   * Create a test folder with proper group ownership
   *
   * @example
   * ```typescript
   * // Simple template folder
   * const folder = await ctx.createFolder('My List');
   *
   * // Organizational folder with children
   * const parent = await ctx.createFolder('Parent', { isTemplate: false });
   * const child = await ctx.createFolder('Child', { parent, inheritGroup: true });
   * ```
   */
  async createFolder(name: string, options: CreateFolderOptions = {}): Promise<TestFolder> {
    const { isTemplate = true, parent, inheritGroup = false } = options;

    if (this.mockBackend) {
      // Use mock backend - create folder using jazz-mock primitives
      const mockAccountWrapper = {
        id: this.account.$jazz?.id ?? 'mock-owner',
        name: 'Owner',
        raw: this.account,
      };

      // Create or reuse group
      let mockGroup: MockTestGroup;
      if (parent && inheritGroup && parent._mockGroup) {
        mockGroup = parent._mockGroup;
      } else {
        mockGroup = this.mockBackend.createGroup(mockAccountWrapper);
      }

      // Create mock folder data
      const now = new Date();
      const folderId = `folder-${Math.random().toString(36).slice(2, 9)}`;

      const baseData: Record<string, unknown> = {
        name,
        expanded: !isTemplate,
        archived: false,
        parent: parent?.node,
        owner: this.account,
        createdAt: now,
        updatedAt: now,
      };

      if (isTemplate) {
        baseData.items = createMockCoList([], { trackMutations: true });
        baseData.sessions = createMockCoList([], { trackMutations: true });
        baseData.showZoneHeadings = false;
      } else {
        baseData.children = createMockCoList([], { trackMutations: true });
      }

      const mockNode = createMockCoMap(baseData, {
        id: folderId,
        trackMutations: true,
      });

      // Create a Group-like proxy for TestFolder
      const groupProxy = {
        addMember: (account: AccountType, role: Role) => {
          mockGroup.addMember({ id: account.$jazz?.id ?? 'mock', name: '', raw: account }, role);
        },
        getRoleOf: (accountId: string) => mockGroup.getRoleOf(accountId),
      } as unknown as Group;

      return {
        node: mockNode as FolderNodeType,
        group: groupProxy,
        id: folderId,
        _mockGroup: mockGroup,
      };
    }

    // Use real Jazz backend
    const schemas = await getSchemas();

    if (inheritGroup && parent) {
      // Special case: reuse parent's exact group for testing shared group permissions
      const group = parent.group;
      const now = new Date();
      const baseData = {
        name,
        expanded: !isTemplate,
        archived: false,
        parent: parent.node,
        owner: this.account,
        createdAt: now,
        updatedAt: now,
      };

      const node = isTemplate
        ? schemas.FolderNode.create(
            { ...baseData, items: [], sessions: [], showZoneHeadings: false },
            { owner: group },
          )
        : schemas.FolderNode.create({ ...baseData, children: [] }, { owner: group });

      parent.node.children?.$jazz.push(node);

      return {
        node,
        group,
        id: node.$jazz.id,
      };
    }

    // Use actual folderService for realistic app behavior
    const { createFolder } = await import('../services/folderService');
    const folder = createFolder(this.account, name, isTemplate, parent?.node ?? null);
    const group = folder.$jazz.owner as Group;

    return {
      node: folder,
      group,
      id: folder.$jazz.id,
    };
  }

  /**
   * Share a folder with another account
   */
  shareFolder(folder: TestFolder, account: AccountType, role: Role = 'writer'): void {
    folder.group.addMember(account, role);
  }

  /**
   * Check if an account can read a folder
   */
  canRead(folder: TestFolder, account: AccountType): boolean {
    const role = folder.group.getRoleOf(account.$jazz?.id ?? '');
    return role !== undefined;
  }

  /**
   * Check if an account can write to a folder
   */
  canWrite(folder: TestFolder, account: AccountType): boolean {
    const role = folder.group.getRoleOf(account.$jazz?.id ?? '');
    return role === 'writer' || role === 'admin';
  }

  /**
   * Check if an account has admin access to a folder
   */
  canAdmin(folder: TestFolder, account: AccountType): boolean {
    const role = folder.group.getRoleOf(account.$jazz?.id ?? '');
    return role === 'admin';
  }

  /**
   * Wait for all accounts to sync their CoValues
   *
   * Essential for reliable tests with 'jazz' backend.
   * No-op for 'mock' backend (synchronous).
   */
  async waitForSync(): Promise<void> {
    if (this.mockBackend) {
      return;
    }

    for (const account of this.accounts) {
      await account.$jazz.waitForAllCoValuesSync();
    }
  }
}

/**
 * Setup Jazz testing for a test suite
 *
 * Call this in beforeEach to get a fresh context for each test.
 */
export function setupJazzTesting(options?: CreateContextOptions): () => JazzTestContext {
  let context: JazzTestContext;

  vitestBeforeEach(async () => {
    context = await JazzTestContext.create('Test Owner', options);
  });

  return () => {
    if (!context) {
      throw new Error('Jazz context not initialized. Did you forget to await setupJazzTesting()?');
    }
    return context;
  };
}

// =============================================================================
// Compatibility layer for jazz-mock style tests
// =============================================================================

/**
 * Mock Jazz API interface (compatible with jazz-mock)
 */
export interface MockJazzAPI {
  id: string;
  owner?: Group | AccountType;
  set: (key: string, value: unknown) => void;
  has: (key: string) => boolean;
  push?: (value: unknown) => void;
  splice?: (index: number, count: number, ...items: unknown[]) => void;
}

/**
 * Create a mock CoMap with Jazz metadata
 */
export function createLocalMockCoMap<T extends object>(
  data: T,
  options: { id?: string; owner?: Group; trackMutations?: boolean } = {},
): T & { $jazz: MockJazzAPI; $isLoaded: true } {
  const target = { ...data } as T & { $jazz: MockJazzAPI; $isLoaded: true };
  const id = options.id ?? `comap-${Math.random().toString(36).slice(2, 9)}`;

  const $jazz: MockJazzAPI = {
    id,
    owner: options.owner,
    set: options.trackMutations
      ? vi.fn((key: string, value: unknown) => {
          (target as Record<string, unknown>)[key] = value;
        })
      : vi.fn(),
    has: vi.fn((key: string) => key in target),
  };

  target.$jazz = $jazz;
  target.$isLoaded = true;

  return target;
}

/**
 * Create a mock CoList with Jazz metadata
 */
export function createLocalMockCoList<T>(
  items: T[] = [],
  options: { id?: string; owner?: Group; trackMutations?: boolean } = {},
): T[] & { $jazz: MockJazzAPI; $isLoaded: true } {
  const list = [...items] as T[] & { $jazz: MockJazzAPI; $isLoaded: true };
  const id = options.id ?? `colist-${Math.random().toString(36).slice(2, 9)}`;

  const $jazz: MockJazzAPI = {
    id,
    owner: options.owner,
    set: vi.fn(),
    has: vi.fn(),
    push: options.trackMutations ? vi.fn((value: unknown) => list.push(value as T)) : vi.fn(),
    splice: options.trackMutations
      ? vi.fn((index: number, count: number, ...insertItems: unknown[]) => {
          list.splice(index, count, ...(insertItems as T[]));
        })
      : vi.fn(),
  };

  list.$jazz = $jazz;
  list.$isLoaded = true;

  return list;
}

/**
 * Create a mock Account
 */
export function createLocalMockAccount(options: { id?: string; name?: string } = {}): AccountType {
  const id = options.id ?? `account-${Math.random().toString(36).slice(2, 9)}`;
  const folders = createLocalMockCoList([], { trackMutations: true });
  const root = createLocalMockCoMap({ folders }, { trackMutations: true });
  const profile = createLocalMockCoMap({ name: options.name ?? 'Test User' }, {});

  const account = createLocalMockCoMap(
    { root, profile },
    { id, trackMutations: true },
  ) as AccountType;

  return account;
}

/**
 * Generate a unique ID
 */
let idCounter = 0;
export function generateId(prefix = 'id'): string {
  return `${prefix}-${++idCounter}`;
}

/**
 * Reset the ID counter (call in beforeEach for deterministic tests)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}
