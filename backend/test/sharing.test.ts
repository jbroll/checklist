/**
 * Backend Integration Tests for Folder Sharing
 *
 * Tests the sharing API endpoints directly without browser/UI.
 * Mocks BetterAuth for fast, reliable tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initDb } from '../src/db.js';
import { setupSharingRoutes } from '../src/shares.js';
import request from 'supertest';
import express from 'express';

// Mock the rate limiter
vi.mock('../src/lib/rate-limiter.js', () => ({
  shareInviteLimiter: {
    check: vi.fn().mockReturnValue(true),
  },
  tokenValidationLimiter: {
    check: vi.fn().mockReturnValue(true),
  },
}));

// Mock the auth module completely to avoid BetterAuth initialization
vi.mock('../src/auth.js', () => {
  // Create database instance inside the factory to avoid hoisting issues
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');

  return {
    sqliteDb: db,
    auth: {
      api: {
        getSession: vi.fn(),
      },
    },
  };
});

// Mock the agent module (sharing routes use it)
vi.mock('../src/agent.js', () => ({
  addToGroup: vi.fn().mockResolvedValue(undefined),
  validateSenderAccess: vi.fn().mockResolvedValue(true),
  getGroupMembers: vi.fn().mockResolvedValue([]),
  removeFromGroup: vi.fn().mockResolvedValue(undefined),
}));

import { auth, sqliteDb } from '../src/auth.js';
import { shareInviteLimiter, tokenValidationLimiter } from '../src/lib/rate-limiter.js';

// Test app setup
const app = express();
app.use(express.json());

// Initialize database tables
initDb(sqliteDb);

// Setup sharing routes
setupSharingRoutes(app, sqliteDb);

// Test users
const testUser1 = {
  id: 'test-user-1-id',
  email: 'test1@example.com',
  name: 'Test User 1',
  accountID: 'co_ztestjazzaccount1',
};

const testUser2 = {
  id: 'test-user-2-id',
  email: 'test2@example.com',
  name: 'Test User 2',
  accountID: 'co_ztestjazzaccount2',
};

describe('Folder Sharing API', () => {
  beforeAll(async () => {
    // Create BetterAuth user table for testing
    sqliteDb.exec(`
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

    // Create test users in BetterAuth database
    sqliteDb.prepare(`
      INSERT OR REPLACE INTO user (id, email, name, emailVerified, createdAt, updatedAt, accountID)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), ?)
    `).run(testUser1.id, testUser1.email, testUser1.name, testUser1.accountID);

    sqliteDb.prepare(`
      INSERT OR REPLACE INTO user (id, email, name, emailVerified, createdAt, updatedAt, accountID)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'), ?)
    `).run(testUser2.id, testUser2.email, testUser2.name, testUser2.accountID);
  });

  afterAll(async () => {
    // Clean up test data
    sqliteDb.prepare('DELETE FROM user WHERE email LIKE ?').run('%@example.com');
    sqliteDb.prepare('DELETE FROM share_invites WHERE recipient_email LIKE ?').run('%@example.com');
  });

  beforeEach(async () => {
    // Clean up invites before each test
    sqliteDb.prepare('DELETE FROM share_invites WHERE recipient_email LIKE ?').run('%@example.com');

    // Reset mocks
    vi.clearAllMocks();
    vi.mocked(shareInviteLimiter.check).mockReturnValue(true);
    vi.mocked(tokenValidationLimiter.check).mockReturnValue(true);
  });

  describe('POST /api/shares/invite', () => {
    it('should create an invite with valid session', async () => {
      // Mock successful auth
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztestfolder123',
          permission: 'writer',
          expiresInDays: 7,
        });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.shareUrl).toContain('/invite/');

      // Check database
      const invite = sqliteDb.prepare('SELECT * FROM share_invites WHERE token = ?').get(response.body.token) as any;
      expect(invite).toBeDefined();
      expect(invite.recipient_email).toBe(testUser2.email);
      expect(invite.target_covalue_id).toBe('co_ztestfolder123');
      expect(invite.permission).toBe('writer');
      expect(invite.sender_email).toBe(testUser1.email);
    });

    it('should reject request without session', async () => {
      // Mock no session
      vi.mocked(auth.api.getSession).mockResolvedValue(null as any);

      const response = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztest123',
          permission: 'writer',
          expiresInDays: 7,
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('unauthorized');
    });

    it('should reject when rate limited', async () => {
      // Mock rate limiter to reject
      vi.mocked(shareInviteLimiter.check).mockReturnValue(false);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztest123',
          permission: 'writer',
          expiresInDays: 7,
        });

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('rate_limited');
      expect(response.body.message).toContain('Too many requests');
    });
  });

  describe('GET /api/shares/validate/:token', () => {
    it('should validate a valid invite token', async () => {
      // Mock auth for invite creation
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      // Create an invite first
      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztest123',
          permission: 'writer',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // Validate doesn't require auth
      const response = await request(app)
        .get(`/api/shares/validate/${token}`);

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(true);
      expect(response.body.recipientEmail).toBe(testUser2.email);
      expect(response.body.senderEmail).toBe(testUser1.email);
      expect(response.body.permission).toBe('writer');
    });

    it('should reject invalid token', async () => {
      const response = await request(app)
        .get('/api/shares/validate/invalid-token-12345');

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBe('not_found');
    });

    it('should reject expired token', async () => {
      // Create an invite that's already expired
      const expiredToken = 'expired-token-test-123';
      const now = Math.floor(Date.now() / 1000);
      const yesterday = now - (24 * 60 * 60);
      const twoDaysAgo = now - (2 * 24 * 60 * 60);

      sqliteDb.prepare(`
        INSERT INTO share_invites (
          token, sender_email, sender_jazz_account_id, recipient_email,
          target_covalue_id, permission, created_at, expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        expiredToken,
        testUser1.email,
        testUser1.accountID,
        testUser2.email,
        'co_ztest123',
        'writer',
        twoDaysAgo,
        yesterday
      );

      const response = await request(app)
        .get(`/api/shares/validate/${expiredToken}`);

      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
      expect(response.body.error).toBe('expired');
    });
  });

  describe('POST /api/shares/accept', () => {
    it('should reject invite with email mismatch', async () => {
      // User 1 creates invite for user 2
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztest123',
          permission: 'writer',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // User 1 tries to accept (wrong user!)
      const response = await request(app)
        .post('/api/shares/accept')
        .send({ token });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
      expect(response.body.message).toBe('This invite is not associated with your account');
    });

    it('should accept invite with matching email', async () => {
      // User 1 creates invite
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztest123',
          permission: 'writer',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // User 2 accepts
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser2,
        session: { id: 'session-2' },
      } as any);

      const response = await request(app)
        .post('/api/shares/accept')
        .send({ token });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.targetId).toBe('co_ztest123');

      // Check database - invite should be marked as accepted
      const invite = sqliteDb.prepare('SELECT * FROM share_invites WHERE token = ?').get(token) as any;
      expect(invite.accepted_at).toBeDefined();
      expect(invite.accepted_at).toBeGreaterThan(0);
    });

    it('should reject already accepted invite', async () => {
      // Create and mark as accepted
      const token = 'already-accepted-token';
      const now = Math.floor(Date.now() / 1000);

      sqliteDb.prepare(`
        INSERT INTO share_invites (
          token, sender_email, sender_jazz_account_id, recipient_email,
          target_covalue_id, permission, created_at, expires_at, accepted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        token,
        testUser1.email,
        testUser1.accountID,
        testUser2.email,
        'co_ztest123',
        'writer',
        now,
        now + 7 * 24 * 60 * 60,
        now - 3600 // Accepted 1 hour ago
      );

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser2,
        session: { id: 'session-2' },
      } as any);

      const response = await request(app)
        .post('/api/shares/accept')
        .send({ token });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('bad_request');
    });
  });

  describe('GET /api/shares/targets/:folderId/invites', () => {
    it('should list pending invites for a folder', async () => {
      const folderId = 'co_ztestfolderinvites';

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      // Create multiple invites
      await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: 'user1@example.com',
          targetId: folderId,
          permission: 'reader',
          expiresInDays: 7,
        });

      await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: 'user2@example.com',
          targetId: folderId,
          permission: 'writer',
          expiresInDays: 30,
        });

      // Get invites
      const response = await request(app)
        .get(`/api/shares/targets/${folderId}/invites`);

      expect(response.status).toBe(200);
      expect(response.body.invites).toHaveLength(2);
      expect(response.body.invites.map((i: any) => i.recipientEmail)).toContain('user1@example.com');
      expect(response.body.invites.map((i: any) => i.recipientEmail)).toContain('user2@example.com');

      // Check that response has proper date formats
      expect(response.body.invites[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(response.body.invites[0].expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should not show expired invites', async () => {
      const folderId = 'co_ztestexpiredinvites';
      const now = Math.floor(Date.now() / 1000);

      // Create expired invite
      sqliteDb.prepare(`
        INSERT INTO share_invites (
          token, sender_email, sender_jazz_account_id, recipient_email,
          target_covalue_id, permission, created_at, expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'expired-invite',
        testUser1.email,
        testUser1.accountID,
        'expired@example.com',
        folderId,
        'reader',
        now - 10 * 24 * 60 * 60,
        now - 3 * 24 * 60 * 60 // Expired 3 days ago
      );

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get(`/api/shares/targets/${folderId}/invites`);

      expect(response.status).toBe(200);
      expect(response.body.invites).toHaveLength(0);
    });
  });

  describe('DELETE /api/shares/invites/:token', () => {
    it('should revoke an invite', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      // Create invite
      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztest123',
          permission: 'writer',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // Revoke it
      const response = await request(app)
        .delete(`/api/shares/invites/${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify it's deleted from DB
      const invite = sqliteDb.prepare('SELECT * FROM share_invites WHERE token = ?').get(token);
      expect(invite).toBeUndefined();
    });

    it('should only allow sender to revoke their own invites', async () => {
      // User 1 creates invite
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztest123',
          permission: 'writer',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // User 2 tries to revoke it
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser2,
        session: { id: 'session-2' },
      } as any);

      const response = await request(app)
        .delete(`/api/shares/invites/${token}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');

      // Verify invite still exists
      const invite = sqliteDb.prepare('SELECT * FROM share_invites WHERE token = ?').get(token);
      expect(invite).toBeDefined();
    });
  });

  describe('POST /api/shares/accept with verified emails', () => {
    it('should accept invite when recipient uses verified alias email', async () => {
      // Create verified_email table if not exists
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS verified_email (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          verified_at INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );
      `);

      // Add a verified email alias for user 2
      sqliteDb.prepare(`
        INSERT OR REPLACE INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', testUser2.id, 'user2-work@company.com', Date.now(), Date.now());

      // User 1 creates invite for user2's work email
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: 'user2-work@company.com',
          targetId: 'co_ztestalias',
          permission: 'writer',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // User 2 accepts (logged in with primary email, invite sent to alias)
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser2,
        session: { id: 'session-2' },
      } as any);

      const response = await request(app)
        .post('/api/shares/accept')
        .send({ token });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Clean up
      sqliteDb.prepare('DELETE FROM verified_email WHERE id = ?').run('ve-1');
    });
  });

  describe('POST /api/shares/accept edge cases', () => {
    it('should reject when user has no Jazz account', async () => {
      // User 1 creates invite
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztestnojazz',
          permission: 'reader',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // User 2 tries to accept but has no Jazz accountID
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { ...testUser2, accountID: undefined },
        session: { id: 'session-2' },
      } as any);

      const response = await request(app)
        .post('/api/shares/accept')
        .send({ token });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('bad_request');
    });

    it('should reject expired invite on accept', async () => {
      // Create an expired invite directly
      const expiredToken = 'expired-accept-test';
      const now = Math.floor(Date.now() / 1000);

      sqliteDb.prepare(`
        INSERT INTO share_invites (
          token, sender_email, sender_jazz_account_id, recipient_email,
          target_covalue_id, permission, created_at, expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        expiredToken,
        testUser1.email,
        testUser1.accountID,
        testUser2.email,
        'co_ztestexpired',
        'writer',
        now - (10 * 24 * 60 * 60),
        now - (3 * 24 * 60 * 60) // Expired 3 days ago
      );

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser2,
        session: { id: 'session-2' },
      } as any);

      const response = await request(app)
        .post('/api/shares/accept')
        .send({ token: expiredToken });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('bad_request');
      expect(response.body.message).toContain('expired');
    });

    it('should handle Jazz addToGroup failure gracefully', async () => {
      const { addToGroup } = await import('../src/agent.js');

      // Mock addToGroup to throw
      vi.mocked(addToGroup).mockRejectedValueOnce(new Error('Jazz sync failed'));

      // User 1 creates invite
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztestjazzfail',
          permission: 'writer',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // User 2 accepts
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser2,
        session: { id: 'session-2' },
      } as any);

      const response = await request(app)
        .post('/api/shares/accept')
        .send({ token });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('server_error');

      // Invite should NOT be marked as accepted
      const invite = sqliteDb.prepare('SELECT * FROM share_invites WHERE token = ?').get(token) as any;
      expect(invite.accepted_at).toBeNull();
    });

    it('should return alreadyMember when user is already in group', async () => {
      const { addToGroup } = await import('../src/agent.js');

      // Mock addToGroup to return alreadyMember
      vi.mocked(addToGroup).mockResolvedValueOnce({ alreadyMember: true });

      // User 1 creates invite
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const createResponse = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztestalreadymember',
          permission: 'writer',
          expiresInDays: 7,
        });

      const token = createResponse.body.token;

      // User 2 accepts
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser2,
        session: { id: 'session-2' },
      } as any);

      const response = await request(app)
        .post('/api/shares/accept')
        .send({ token });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.alreadyMember).toBe(true);
    });
  });

  describe('POST /api/shares/invite with sender validation', () => {
    // Note: Backend no longer validates Jazz group membership at invite creation.
    // Access control is handled by the frontend through Jazz's permission model.
    // When the frontend adds the agent to the folder's group, Jazz enforces
    // whether the user actually has permission to do so.

    it('should reject invite when sender has no Jazz account ID', async () => {
      // User with no accountID
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: { ...testUser1, accountID: undefined },
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/shares/invite')
        .send({
          recipientEmail: testUser2.email,
          targetId: 'co_ztest123',
          permission: 'writer',
          expiresInDays: 7,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('bad_request');
      expect(response.body.message).toContain('Jazz account ID is required');
    });
  });

  describe('GET /api/shares/validate/:token - rate limiting', () => {
    it('should reject when rate limited', async () => {
      // Mock rate limiter to reject
      vi.mocked(tokenValidationLimiter.check).mockReturnValue(false);

      const response = await request(app)
        .get('/api/shares/validate/some-token');

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('rate_limited');
    });

    it('should allow when not rate limited', async () => {
      vi.mocked(tokenValidationLimiter.check).mockReturnValue(true);

      const response = await request(app)
        .get('/api/shares/validate/invalid-token');

      // Should return 200 with valid: false (token doesn't exist, but not rate limited)
      expect(response.status).toBe(200);
      expect(response.body.valid).toBe(false);
    });
  });

  describe('Folder ID validation', () => {
    it('should reject invalid folder ID format in GET invites', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/shares/targets/invalid-id-format/invites');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('bad_request');
      expect(response.body.message).toContain('Invalid target ID');
    });

    it('should reject invalid folder ID format in GET collaborators', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/shares/targets/not-a-coid/collaborators');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('bad_request');
    });

    it('should reject invalid folder ID format in DELETE collaborator', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete('/api/shares/targets/bad-folder/collaborators/co_zvalidaccount');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('bad_request');
    });

    it('should reject invalid account ID format in DELETE collaborator', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete('/api/shares/targets/co_zvalidfolder/collaborators/bad-account');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('bad_request');
    });

    it('should accept valid Jazz CoValue ID format', async () => {
      const { getGroupMembers } = await import('../src/agent.js');

      vi.mocked(getGroupMembers).mockResolvedValueOnce([
        { id: testUser1.accountID, role: 'admin' },
      ]);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      // Valid format: co_z followed by alphanumeric
      const response = await request(app)
        .get('/api/shares/targets/co_zABC123def456/collaborators');

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/shares/targets/:folderId/collaborators', () => {
    it('should return collaborators mapped from Jazz group members', async () => {
      const { getGroupMembers } = await import('../src/agent.js');

      // Mock Jazz group members
      vi.mocked(getGroupMembers).mockResolvedValueOnce([
        { id: testUser1.accountID, role: 'admin' },
        { id: testUser2.accountID, role: 'writer' },
      ]);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/shares/targets/co_ztestcollab/collaborators');

      expect(response.status).toBe(200);
      expect(response.body.collaborators).toHaveLength(2);

      const admin = response.body.collaborators.find((c: any) => c.permission === 'admin');
      expect(admin).toBeDefined();
      expect(admin.email).toBe(testUser1.email);

      const editor = response.body.collaborators.find((c: any) => c.permission === 'writer');
      expect(editor).toBeDefined();
      expect(editor.email).toBe(testUser2.email);
    });

    it('should handle Jazz members not in BetterAuth database', async () => {
      const { getGroupMembers } = await import('../src/agent.js');

      // Mock Jazz group with unknown member
      vi.mocked(getGroupMembers).mockResolvedValueOnce([
        { id: testUser1.accountID, role: 'admin' },
        { id: 'co_zunknownuser', role: 'reader' },
      ]);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/shares/targets/co_ztestunknown/collaborators');

      expect(response.status).toBe(200);
      // Should only return the known user
      expect(response.body.collaborators).toHaveLength(1);
      expect(response.body.collaborators[0].email).toBe(testUser1.email);
    });

    it('should require authentication', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null as any);

      const response = await request(app)
        .get('/api/shares/targets/co_ztest/collaborators');

      expect(response.status).toBe(401);
    });

    it('should handle Jazz error gracefully', async () => {
      const { getGroupMembers } = await import('../src/agent.js');

      vi.mocked(getGroupMembers).mockRejectedValueOnce(new Error('Jazz error'));

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/shares/targets/co_ztesterror/collaborators');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('server_error');
    });
  });

  describe('DELETE /api/shares/targets/:folderId/collaborators/:accountId', () => {
    it('should remove collaborator when requester is admin', async () => {
      const { getGroupMembers, removeFromGroup } = await import('../src/agent.js');

      // Mock: testUser1 is admin
      vi.mocked(getGroupMembers).mockResolvedValueOnce([
        { id: testUser1.accountID, role: 'admin' },
        { id: testUser2.accountID, role: 'writer' },
      ]);

      vi.mocked(removeFromGroup).mockResolvedValueOnce(undefined);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete(`/api/shares/targets/co_ztestremove/collaborators/${testUser2.accountID}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(removeFromGroup).toHaveBeenCalledWith('co_ztestremove', testUser2.accountID);
    });

    it('should reject when requester is not admin', async () => {
      const { getGroupMembers, removeFromGroup } = await import('../src/agent.js');

      // Mock: testUser1 is only a writer
      vi.mocked(getGroupMembers).mockResolvedValueOnce([
        { id: testUser1.accountID, role: 'writer' },
        { id: testUser2.accountID, role: 'writer' },
      ]);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete(`/api/shares/targets/co_ztestnoadmin/collaborators/${testUser2.accountID}`);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
      expect(removeFromGroup).not.toHaveBeenCalled();
    });

    it('should reject when requester is reader', async () => {
      const { getGroupMembers, removeFromGroup } = await import('../src/agent.js');

      vi.mocked(getGroupMembers).mockResolvedValueOnce([
        { id: testUser1.accountID, role: 'reader' },
        { id: testUser2.accountID, role: 'writer' },
      ]);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete(`/api/shares/targets/co_ztestreader/collaborators/${testUser2.accountID}`);

      expect(response.status).toBe(403);
      expect(removeFromGroup).not.toHaveBeenCalled();
    });

    it('should handle Jazz removeFromGroup error', async () => {
      const { getGroupMembers, removeFromGroup } = await import('../src/agent.js');

      vi.mocked(getGroupMembers).mockResolvedValueOnce([
        { id: testUser1.accountID, role: 'admin' },
      ]);

      vi.mocked(removeFromGroup).mockRejectedValueOnce(new Error('Cannot remove owner'));

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser1,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete(`/api/shares/targets/co_ztestowner/collaborators/${testUser2.accountID}`);

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('server_error');
    });

    it('should require authentication', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null as any);

      const response = await request(app)
        .delete('/api/shares/targets/co_ztest/collaborators/co_zuser');

      expect(response.status).toBe(401);
    });
  });
});
