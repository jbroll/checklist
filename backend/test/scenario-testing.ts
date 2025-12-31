/**
 * Multi-User Scenario Testing Framework
 *
 * Tests complex multi-account flows (sharing, aliases) without UI interaction.
 * Uses direct API calls with switchable user contexts.
 *
 * Key concepts:
 * - TestContext: Manages multiple simulated users and their auth states
 * - Scenario: A sequence of actions across different users
 * - Actions: Atomic operations (createInvite, acceptInvite, addAlias, etc.)
 *
 * Example:
 *   await scenario()
 *     .withUsers(['alice', 'bob'])
 *     .asUser('alice').createFolder('Groceries')
 *     .asUser('alice').shareWith('bob', { permission: 'edit' })
 *     .asUser('bob').acceptInvite()
 *     .verify(ctx => {
 *       expect(ctx.getFolder('Groceries').collaborators).toContain('bob');
 *     })
 *     .run();
 */

import { vi, expect } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import Database from 'better-sqlite3';

// Types
export interface TestUser {
  id: string;
  email: string;
  name: string;
  accountID: string;
  aliases: string[];
}

export interface InviteRecord {
  token: string;
  senderEmail: string;
  recipientEmail: string;
  folderId: string;
  permission: 'view' | 'edit' | 'admin';
}

export interface TestFolder {
  id: string;
  name: string;
  ownerId: string;
}

type Permission = 'view' | 'edit' | 'admin';

/**
 * TestContext - Manages multiple users and shared test state
 */
export class TestContext {
  readonly db: Database.Database;
  readonly app: Express;
  private users: Map<string, TestUser> = new Map();
  private currentUser: TestUser | null = null;
  private folders: Map<string, TestFolder> = new Map();
  private invites: Map<string, InviteRecord> = new Map();
  private pendingInviteToken: string | null = null;

  // Mock functions (exposed for direct manipulation)
  readonly mocks = {
    getSession: vi.fn(),
    validateSenderAccess: vi.fn().mockResolvedValue(true),
    addToFolderGroup: vi.fn().mockResolvedValue({ alreadyMember: false }),
    getFolderGroupMembers: vi.fn().mockResolvedValue([]),
    removeFromFolderGroup: vi.fn().mockResolvedValue(undefined),
    shareInviteLimiter: { check: vi.fn().mockReturnValue(true) },
    tokenValidationLimiter: { check: vi.fn().mockReturnValue(true) },
  };

  constructor() {
    this.db = new Database(':memory:');
    this.app = express();
    this.app.use(express.json());
  }

  /**
   * Initialize with required tables and routes
   */
  async initialize(
    initDb: (db: Database.Database) => void,
    setupSharingRoutes: (app: Express, db: Database.Database) => void,
    setupVerifiedEmailRoutes?: (app: Express, db: Database.Database) => void
  ): Promise<void> {
    // Create BetterAuth user table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        emailVerified INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        accountID TEXT
      );
    `);

    // Initialize app tables (shares, verified_emails, etc.)
    initDb(this.db);

    // Setup routes
    setupSharingRoutes(this.app, this.db);
    if (setupVerifiedEmailRoutes) {
      setupVerifiedEmailRoutes(this.app, this.db);
    }
  }

  /**
   * Add a test user to the context
   */
  addUser(name: string, overrides: Partial<TestUser> = {}): TestUser {
    const user: TestUser = {
      id: overrides.id ?? `user-${name}-id`,
      email: overrides.email ?? `${name.toLowerCase()}@example.com`,
      name: overrides.name ?? name,
      accountID: overrides.accountID ?? `co_z${name.toLowerCase()}jazzaccount`,
      aliases: overrides.aliases ?? [],
    };

    this.users.set(name, user);

    // Insert into database
    this.db
      .prepare(
        `INSERT OR REPLACE INTO user (id, email, name, emailVerified, createdAt, updatedAt, accountID)
       VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), ?)`
      )
      .run(user.id, user.email, user.name, user.accountID);

    return user;
  }

  /**
   * Switch auth context to a specific user
   */
  asUser(name: string): this {
    const user = this.users.get(name);
    if (!user) {
      throw new Error(`User "${name}" not found. Add with addUser() first.`);
    }

    this.currentUser = user;

    // Update auth mock to return this user's session
    this.mocks.getSession.mockResolvedValue({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        accountID: user.accountID,
      },
      session: { id: `session-${user.id}` },
    });

    return this;
  }

  /**
   * Switch to unauthenticated state
   */
  asGuest(): this {
    this.currentUser = null;
    this.mocks.getSession.mockResolvedValue(null);
    return this;
  }

  /**
   * Get current user (throws if not authenticated)
   */
  getCurrentUser(): TestUser {
    if (!this.currentUser) {
      throw new Error('No user context. Call asUser() first.');
    }
    return this.currentUser;
  }

  /**
   * Get user by name
   */
  getUser(name: string): TestUser {
    const user = this.users.get(name);
    if (!user) {
      throw new Error(`User "${name}" not found`);
    }
    return user;
  }

  // === Folder Operations ===

  /**
   * Register a folder (simulates Jazz folder creation)
   */
  createFolder(name: string, folderId?: string): TestFolder {
    const user = this.getCurrentUser();
    const folder: TestFolder = {
      id: folderId ?? `co_z${name.toLowerCase().replace(/\s+/g, '')}folder`,
      name,
      ownerId: user.id,
    };
    this.folders.set(name, folder);

    // Add user to mock group members
    const currentMembers = this.mocks.getFolderGroupMembers.mock.results.slice(-1)[0]?.value ?? [];
    this.mocks.getFolderGroupMembers.mockResolvedValue([
      ...currentMembers,
      { id: user.accountID, role: 'admin' },
    ]);

    return folder;
  }

  /**
   * Get folder by name
   */
  getFolder(name: string): TestFolder {
    const folder = this.folders.get(name);
    if (!folder) {
      throw new Error(`Folder "${name}" not found`);
    }
    return folder;
  }

  // === Sharing Operations ===

  /**
   * Create a share invite
   */
  async createInvite(
    folderName: string,
    recipientEmail: string,
    options: { permission?: Permission; expiresInDays?: number } = {}
  ): Promise<InviteRecord> {
    const folder = this.getFolder(folderName);
    const user = this.getCurrentUser();

    const response = await request(this.app).post('/api/shares/invite').send({
      recipientEmail,
      folderCoValueId: folder.id,
      permission: options.permission ?? 'edit',
      expiresInDays: options.expiresInDays ?? 7,
    });

    if (response.status !== 200) {
      throw new Error(`Failed to create invite: ${response.status} ${JSON.stringify(response.body)}`);
    }

    const invite: InviteRecord = {
      token: response.body.token,
      senderEmail: user.email,
      recipientEmail,
      folderId: folder.id,
      permission: options.permission ?? 'edit',
    };

    this.invites.set(response.body.token, invite);
    this.pendingInviteToken = response.body.token;

    return invite;
  }

  /**
   * Share with another user by name
   */
  async shareWith(
    recipientName: string,
    folderName: string,
    options: { permission?: Permission; expiresInDays?: number } = {}
  ): Promise<InviteRecord> {
    const recipient = this.getUser(recipientName);
    return this.createInvite(folderName, recipient.email, options);
  }

  /**
   * Validate a share token
   */
  async validateInvite(token?: string): Promise<{
    valid: boolean;
    senderEmail?: string;
    recipientEmail?: string;
    permission?: string;
    error?: string;
  }> {
    const tokenToValidate = token ?? this.pendingInviteToken;
    if (!tokenToValidate) {
      throw new Error('No token to validate. Create an invite first.');
    }

    const response = await request(this.app).get(`/api/shares/validate/${tokenToValidate}`);

    return response.body;
  }

  /**
   * Accept a share invite
   */
  async acceptInvite(token?: string): Promise<{
    success: boolean;
    folderId?: string;
    error?: string;
    message?: string;
  }> {
    const tokenToAccept = token ?? this.pendingInviteToken;
    if (!tokenToAccept) {
      throw new Error('No token to accept. Create an invite first.');
    }

    const response = await request(this.app).post('/api/shares/accept').send({ token: tokenToAccept });

    if (response.status === 200) {
      return { success: true, folderId: response.body.folderId };
    } else {
      return {
        success: false,
        error: response.body.error,
        message: response.body.message,
      };
    }
  }

  /**
   * Get collaborators for a folder
   */
  async getCollaborators(folderName: string): Promise<any[]> {
    const folder = this.getFolder(folderName);
    const response = await request(this.app).get(`/api/shares/folders/${folder.id}/collaborators`);
    return response.body.collaborators ?? [];
  }

  /**
   * Get pending invites for a folder
   */
  async getPendingInvites(folderName: string): Promise<any[]> {
    const folder = this.getFolder(folderName);
    const response = await request(this.app).get(`/api/shares/folders/${folder.id}/invites`);
    return response.body.invites ?? [];
  }

  /**
   * Revoke an invite
   */
  async revokeInvite(token?: string): Promise<{ success: boolean; error?: string }> {
    const tokenToRevoke = token ?? this.pendingInviteToken;
    if (!tokenToRevoke) {
      throw new Error('No token to revoke');
    }

    const response = await request(this.app).delete(`/api/shares/invites/${tokenToRevoke}`);
    return response.status === 200 ? { success: true } : { success: false, error: response.body.error };
  }

  // === Email Alias Operations ===

  /**
   * Request email verification (add alias)
   */
  async requestEmailVerification(email: string): Promise<{ success: boolean; error?: string }> {
    const response = await request(this.app).post('/api/verified-emails/request').send({ email });

    return response.status === 200 ? { success: true } : { success: false, error: response.body.error };
  }

  /**
   * Directly add a verified email (bypasses email flow for testing)
   */
  addVerifiedEmail(userName: string, email: string): void {
    const user = this.getUser(userName);
    const id = `ve-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    this.db
      .prepare(
        `INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
       VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, user.id, email.toLowerCase(), Date.now(), Date.now());

    user.aliases.push(email.toLowerCase());
  }

  /**
   * Get verified emails for current user
   */
  async getVerifiedEmails(): Promise<string[]> {
    const response = await request(this.app).get('/api/verified-emails');
    return response.body.emails?.map((e: any) => e.email) ?? [];
  }

  // === Database Helpers ===

  /**
   * Get raw invite from database
   */
  getInviteFromDb(token: string): any {
    return this.db.prepare('SELECT * FROM share_invites WHERE token = ?').get(token);
  }

  /**
   * Set invite expiration (for testing expiration flows)
   * Note: expires_at is stored as unix timestamp in seconds
   */
  expireInvite(token: string): void {
    const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
    this.db.prepare('UPDATE share_invites SET expires_at = ? WHERE token = ?').run(pastTimestamp, token);
  }

  /**
   * Mark invite as already accepted
   */
  markInviteAccepted(token: string): void {
    this.db.prepare('UPDATE share_invites SET accepted_at = ? WHERE token = ?').run(Date.now(), token);
  }

  // === Cleanup ===

  /**
   * Reset state between tests
   */
  reset(): void {
    this.db.prepare("DELETE FROM share_invites WHERE recipient_email LIKE '%@example.com'").run();
    this.db.prepare("DELETE FROM verified_email WHERE email LIKE '%@example.com'").run();
    this.invites.clear();
    this.pendingInviteToken = null;
    vi.clearAllMocks();

    // Reset default mock behaviors
    this.mocks.validateSenderAccess.mockResolvedValue(true);
    this.mocks.addToFolderGroup.mockResolvedValue({ alreadyMember: false });
    this.mocks.getFolderGroupMembers.mockResolvedValue([]);
    this.mocks.shareInviteLimiter.check.mockReturnValue(true);
    this.mocks.tokenValidationLimiter.check.mockReturnValue(true);
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Scenario Builder - Fluent API for defining test scenarios
 */
export class ScenarioBuilder {
  private ctx: TestContext;
  private steps: Array<() => Promise<void>> = [];
  private setupFn?: (ctx: TestContext) => void | Promise<void>;

  constructor(ctx: TestContext) {
    this.ctx = ctx;
  }

  /**
   * Setup function runs before scenario steps
   */
  setup(fn: (ctx: TestContext) => void | Promise<void>): this {
    this.setupFn = fn;
    return this;
  }

  /**
   * Add users to the scenario
   */
  withUsers(names: string[]): this {
    this.steps.push(async () => {
      for (const name of names) {
        this.ctx.addUser(name);
      }
    });
    return this;
  }

  /**
   * Switch to user context
   */
  asUser(name: string): ScenarioUserContext {
    return new ScenarioUserContext(this, this.ctx, name);
  }

  /**
   * Add a custom step
   */
  step(name: string, fn: (ctx: TestContext) => Promise<void>): this {
    this.steps.push(async () => {
      await fn(this.ctx);
    });
    return this;
  }

  /**
   * Add verification step
   */
  verify(fn: (ctx: TestContext) => void | Promise<void>): this {
    this.steps.push(async () => {
      await fn(this.ctx);
    });
    return this;
  }

  /**
   * Add a step to the queue (internal use)
   */
  addStep(step: () => Promise<void>): void {
    this.steps.push(step);
  }

  /**
   * Execute all steps in sequence
   */
  async run(): Promise<void> {
    if (this.setupFn) {
      await this.setupFn(this.ctx);
    }
    for (const step of this.steps) {
      await step();
    }
  }
}

/**
 * Scenario User Context - Actions available to a specific user
 */
class ScenarioUserContext {
  constructor(
    private builder: ScenarioBuilder,
    private ctx: TestContext,
    private userName: string
  ) {}

  private addStep(fn: () => Promise<void>): ScenarioBuilder {
    this.builder.addStep(async () => {
      this.ctx.asUser(this.userName);
      await fn();
    });
    return this.builder;
  }

  /**
   * Create a folder
   */
  createFolder(name: string): ScenarioBuilder {
    return this.addStep(async () => {
      this.ctx.createFolder(name);
    });
  }

  /**
   * Share a folder with another user
   */
  shareWith(
    recipientName: string,
    folderName: string,
    options?: { permission?: Permission; expiresInDays?: number }
  ): ScenarioBuilder {
    return this.addStep(async () => {
      await this.ctx.shareWith(recipientName, folderName, options);
    });
  }

  /**
   * Accept pending invite
   */
  acceptInvite(token?: string): ScenarioBuilder {
    return this.addStep(async () => {
      const result = await this.ctx.acceptInvite(token);
      if (!result.success) {
        throw new Error(`Accept invite failed: ${result.error}`);
      }
    });
  }

  /**
   * Try to accept invite (captures result without throwing)
   */
  tryAcceptInvite(
    resultCapture: (result: { success: boolean; error?: string }) => void,
    token?: string
  ): ScenarioBuilder {
    return this.addStep(async () => {
      const result = await this.ctx.acceptInvite(token);
      resultCapture(result);
    });
  }

  /**
   * Add a verified email alias
   */
  addAlias(email: string): ScenarioBuilder {
    return this.addStep(async () => {
      this.ctx.addVerifiedEmail(this.userName, email);
    });
  }

  /**
   * Revoke an invite
   */
  revokeInvite(token?: string): ScenarioBuilder {
    return this.addStep(async () => {
      const result = await this.ctx.revokeInvite(token);
      if (!result.success) {
        throw new Error(`Revoke invite failed: ${result.error}`);
      }
    });
  }
}

/**
 * Create a new scenario builder
 */
export function scenario(ctx: TestContext): ScenarioBuilder {
  return new ScenarioBuilder(ctx);
}

/**
 * Create and initialize a test context
 */
export async function createTestContext(
  initDb: (db: Database.Database) => void,
  setupSharingRoutes: (app: Express, db: Database.Database) => void,
  setupVerifiedEmailRoutes?: (app: Express, db: Database.Database) => void
): Promise<TestContext> {
  const ctx = new TestContext();
  await ctx.initialize(initDb, setupSharingRoutes, setupVerifiedEmailRoutes);
  return ctx;
}
