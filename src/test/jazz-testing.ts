/**
 * Jazz Testing Utilities
 *
 * Fluent test helpers with swappable backends:
 * - 'jazz': Real Jazz behavior (Groups, permissions, sync) via jazz-tools/testing
 * - 'mock': Fast mocks via jazz-mock (no real Jazz runtime)
 *
 * Set JAZZ_TEST_BACKEND=mock or JAZZ_TEST_BACKEND=jazz to control backend.
 * Default: 'jazz' for checklist tests (uses real Jazz).
 *
 * @example
 * ```typescript
 * import { JazzTestContext } from '@/test/jazz-testing';
 *
 * describe('Folder Permissions', () => {
 *   let ctx: JazzTestContext;
 *
 *   beforeEach(async () => {
 *     // Uses JAZZ_TEST_BACKEND env var, defaults to 'jazz'
 *     ctx = await JazzTestContext.create();
 *
 *     // Or explicitly specify backend:
 *     ctx = await JazzTestContext.create('Owner', { backend: 'mock' });
 *   });
 *
 *   it('should allow writer to edit folder', async () => {
 *     const folder = await ctx.createFolder('Shared');
 *     const writer = await ctx.createAccount('Writer');
 *
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
import type { Group, InstanceOfSchema } from 'jazz-tools';
import {
  createJazzTestAccount,
  linkAccounts,
  setActiveAccount,
  setupJazzTestSync,
} from 'jazz-tools/testing';
import { vi, beforeEach as vitestBeforeEach } from 'vitest';
import { Account, FolderNode } from '../schemas';

// folderService is dynamically imported to avoid import order issues with vi.mock

// Re-export jazz-tools/testing utilities
export { linkAccounts, setActiveAccount, setupJazzTestSync } from 'jazz-tools/testing';

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
  node: InstanceOfSchema<typeof FolderNode>;
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
 * Get the default backend from environment variable
 */
function getDefaultBackend(): BackendType {
  if (typeof process !== 'undefined' && process.env?.JAZZ_TEST_BACKEND) {
    const backend = process.env.JAZZ_TEST_BACKEND.toLowerCase();
    if (backend === 'jazz' || backend === 'mock') {
      return backend;
    }
    console.warn(
      `Invalid JAZZ_TEST_BACKEND value: "${backend}". Using 'mock'. Valid values: 'mock', 'jazz'`,
    );
  }
  // Default to 'mock' for fast tests (consistent with setup.ts mock behavior)
  // Use JAZZ_TEST_BACKEND=jazz for real Jazz behavior tests
  return 'mock';
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
  public account: InstanceOfSchema<typeof Account>;

  /** All created accounts for cleanup */
  private accounts: InstanceOfSchema<typeof Account>[] = [];

  /** Mock backend (when using 'mock' backend) */
  private mockBackend: MockTestBackend | null = null;

  /** Backend type */
  public readonly backendType: BackendType;

  private constructor(
    account: InstanceOfSchema<typeof Account>,
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
   * Sets up Jazz sync and creates the primary account.
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
      const account = mockAccount.raw as unknown as InstanceOfSchema<typeof Account>;
      return new JazzTestContext(account, 'mock', mockBackend);
    }

    // Use real Jazz backend
    await setupJazzTestSync();

    const account = await createJazzTestAccount({
      AccountSchema: Account,
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
  async createAccount(name: string): Promise<InstanceOfSchema<typeof Account>> {
    if (this.mockBackend) {
      // Use mock backend
      const mockAccount = await this.mockBackend.createAccount(name);
      const account = mockAccount.raw as unknown as InstanceOfSchema<typeof Account>;
      this.accounts.push(account);
      return account;
    }

    // Use real Jazz backend
    const account = await createJazzTestAccount({
      AccountSchema: Account,
      creationProps: { name },
    });

    // Link all accounts together for sync
    for (const existing of this.accounts) {
      await linkAccounts(existing, account);
    }

    this.accounts.push(account);
    return account;
  }

  /**
   * Switch the active account for subsequent operations
   */
  setActiveAccount(account: InstanceOfSchema<typeof Account>): void {
    if (this.mockBackend) {
      // Mock backend doesn't need active account tracking
      return;
    }
    setActiveAccount(account);
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
        addMember: (account: InstanceOfSchema<typeof Account>, role: Role) => {
          mockGroup.addMember({ id: account.$jazz?.id ?? 'mock', name: '', raw: account }, role);
        },
        getRoleOf: (accountId: string) => mockGroup.getRoleOf(accountId),
      } as unknown as Group;

      return {
        node: mockNode as unknown as InstanceOfSchema<typeof FolderNode>,
        group: groupProxy,
        id: folderId,
        _mockGroup: mockGroup,
      };
    }

    // Use real Jazz backend
    if (inheritGroup && parent) {
      // Special case: reuse parent's exact group for testing shared group permissions
      // This tests Jazz's group permission model directly (not how the app works)
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
        ? FolderNode.create(
            { ...baseData, items: [], sessions: [], showZoneHeadings: false },
            { owner: group },
          )
        : FolderNode.create({ ...baseData, children: [] }, { owner: group });

      parent.node.children?.$jazz.push(node);

      return {
        node,
        group,
        id: node.$jazz.id,
      };
    }

    // Use actual folderService for realistic app behavior
    // Dynamic import to handle mock/real jazz-tools based on JAZZ_TEST_BACKEND
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
   *
   * @example
   * ```typescript
   * const folder = await ctx.createFolder('Shared');
   * const collaborator = await ctx.createAccount('Bob');
   *
   * ctx.shareFolder(folder, collaborator, 'writer');
   *
   * // Verify permission
   * expect(folder.group.getRoleOf(collaborator.$jazz.id)).toBe('writer');
   * ```
   */
  shareFolder(
    folder: TestFolder,
    account: InstanceOfSchema<typeof Account>,
    role: Role = 'writer',
  ): void {
    folder.group.addMember(account, role);
  }

  /**
   * Check if an account can read a folder
   */
  canRead(folder: TestFolder, account: InstanceOfSchema<typeof Account>): boolean {
    const role = folder.group.getRoleOf(account.$jazz?.id ?? '');
    return role !== undefined;
  }

  /**
   * Check if an account can write to a folder
   */
  canWrite(folder: TestFolder, account: InstanceOfSchema<typeof Account>): boolean {
    const role = folder.group.getRoleOf(account.$jazz?.id ?? '');
    return role === 'writer' || role === 'admin';
  }

  /**
   * Check if an account has admin access to a folder
   */
  canAdmin(folder: TestFolder, account: InstanceOfSchema<typeof Account>): boolean {
    const role = folder.group.getRoleOf(account.$jazz?.id ?? '');
    return role === 'admin';
  }

  /**
   * Wait for all accounts to sync their CoValues
   *
   * This is essential for reliable tests when using the 'jazz' backend.
   * For the 'mock' backend, this is a no-op since everything is synchronous.
   *
   * Call this after operations that modify shared data to ensure
   * all accounts have the latest state before making assertions.
   *
   * @example
   * ```typescript
   * ctx.shareFolder(folder, collaborator, 'writer');
   * await ctx.waitForSync();  // Ensure sync is complete
   * expect(ctx.canWrite(folder, collaborator)).toBe(true);
   * ```
   */
  async waitForSync(): Promise<void> {
    if (this.mockBackend) {
      // Mock backend is synchronous, no need to wait
      return;
    }

    // Wait for all accounts to sync their CoValues
    for (const account of this.accounts) {
      await account.$jazz.waitForAllCoValuesSync();
    }
  }
}

/**
 * Setup Jazz testing for a test suite
 *
 * Call this in beforeEach to get a fresh context for each test.
 *
 * @example
 * ```typescript
 * describe('My Tests', () => {
 *   const getContext = setupJazzTesting();
 *
 *   it('creates folders', async () => {
 *     const ctx = getContext();
 *     const folder = await ctx.createFolder('Test');
 *     expect(folder.node.name).toBe('Test');
 *   });
 * });
 * ```
 */
export function setupJazzTesting(): () => JazzTestContext {
  let context: JazzTestContext;

  vitestBeforeEach(async () => {
    context = await JazzTestContext.create();
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
  owner?: Group | InstanceOfSchema<typeof Account>;
  set: (key: string, value: unknown) => void;
  has: (key: string) => boolean;
  push?: (value: unknown) => void;
  splice?: (index: number, count: number, ...items: unknown[]) => void;
}

/**
 * Create a mock CoMap with Jazz metadata
 *
 * This is a compatibility shim for tests migrating from jazz-mock.
 * For new tests, prefer using JazzTestContext.
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
 *
 * This is a compatibility shim for tests migrating from jazz-mock.
 * For new tests, prefer using JazzTestContext.
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
 *
 * This is a compatibility shim for tests migrating from jazz-mock.
 * For new tests, prefer using JazzTestContext.createAccount().
 */
export function createLocalMockAccount(
  options: { id?: string; name?: string } = {},
): InstanceOfSchema<typeof Account> {
  const id = options.id ?? `account-${Math.random().toString(36).slice(2, 9)}`;
  const folders = createLocalMockCoList([], { trackMutations: true });
  const root = createLocalMockCoMap({ folders }, { trackMutations: true });
  const profile = createLocalMockCoMap({ name: options.name ?? 'Test User' }, {});

  const account = createLocalMockCoMap(
    { root, profile },
    { id, trackMutations: true },
  ) as unknown as InstanceOfSchema<typeof Account>;

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
