/**
 * Backend Integration Tests for Verified Emails (Account Aliasing)
 *
 * Tests the verified email API endpoints for adding/removing email aliases.
 * Mocks BetterAuth and email sending for fast, reliable tests.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { initDb } from '../src/db.js';
import { setupVerifiedEmailRoutes } from '../src/verified-emails.js';
import request from 'supertest';
import express from 'express';

// Mock the auth module
vi.mock('../src/auth.js', () => {
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

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockResolvedValue({ messageId: 'test-123' }),
    }),
  },
}));

// Mock the verification token module
vi.mock('../src/lib/verification-token.js', () => ({
  createVerificationToken: vi.fn((userId: string, email: string) => `token_${userId}_${email}`),
  verifyToken: vi.fn((token: string) => {
    if (token.startsWith('token_')) {
      const parts = token.split('_');
      return { userId: parts[1], email: parts.slice(2).join('_') };
    }
    if (token === 'expired_token') return null;
    if (token === 'wrong_user_token') return { userId: 'other-user', email: 'other@example.com' };
    return null;
  }),
  TOKEN_EXPIRY_HOURS: 24,
}));

// Mock rate limiter
vi.mock('../src/lib/rate-limiter.js', () => ({
  emailVerificationLimiter: {
    check: vi.fn().mockReturnValue(true),
  },
}));

import { auth, sqliteDb } from '../src/auth.js';
import { emailVerificationLimiter } from '../src/lib/rate-limiter.js';

// Set required env
process.env.BETTER_AUTH_SECRET = 'test-secret-key-for-testing';
process.env.FRONTEND_URL = 'http://localhost:5173';

// Test app setup
const app = express();
app.use(express.json());

// Initialize database tables
initDb(sqliteDb);

// Setup verified email routes
setupVerifiedEmailRoutes(app, sqliteDb);

// Test user
const testUser = {
  id: 'test-user-id',
  email: 'primary@example.com',
  name: 'Test User',
};

const testUser2 = {
  id: 'test-user-2-id',
  email: 'other@example.com',
  name: 'Other User',
};

describe('Verified Emails API', () => {
  beforeAll(async () => {
    // Create user table
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        emailVerified INTEGER DEFAULT 0,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `);

    // Create test users
    sqliteDb.prepare(`
      INSERT OR REPLACE INTO user (id, email, name, emailVerified, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(testUser.id, testUser.email, testUser.name);

    sqliteDb.prepare(`
      INSERT OR REPLACE INTO user (id, email, name, emailVerified, createdAt, updatedAt)
      VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(testUser2.id, testUser2.email, testUser2.name);
  });

  afterAll(async () => {
    sqliteDb.prepare('DELETE FROM user WHERE email LIKE ?').run('%@example.com');
    sqliteDb.prepare('DELETE FROM verified_email WHERE email LIKE ?').run('%@example.com');
  });

  beforeEach(async () => {
    // Clean all verified emails for test users
    sqliteDb.prepare('DELETE FROM verified_email WHERE user_id IN (?, ?)').run(testUser.id, testUser2.id);
    // Also clean any test emails by pattern
    sqliteDb.prepare('DELETE FROM verified_email WHERE email LIKE ?').run('%@company.com');
    sqliteDb.prepare('DELETE FROM verified_email WHERE email LIKE ?').run('%@gmail.com');
    vi.clearAllMocks();
    vi.mocked(emailVerificationLimiter.check).mockReturnValue(true);
  });

  describe('POST /api/verified-emails/request', () => {
    it('should send verification email for valid request', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'work@company.com' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject without authentication', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'work@company.com' });

      expect(response.status).toBe(401);
    });

    it('should reject missing email', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Email is required');
    });

    it('should reject primary email as alias', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'primary@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('This is already your primary email');
    });

    it('should reject primary email case-insensitively', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'PRIMARY@EXAMPLE.COM' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('This is already your primary email');
    });

    it('should reject email already used as primary by another user', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: testUser2.email });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('This email cannot be added');
    });

    it('should reject email already verified by another user', async () => {
      // Add verified email for testUser2
      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-other', testUser2.id, 'taken@company.com', Date.now(), Date.now());

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'taken@company.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('This email cannot be added');
    });

    it('should enforce rate limiting', async () => {
      vi.mocked(emailVerificationLimiter.check).mockReturnValue(false);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'work@company.com' });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('Too many requests');
    });

    it('should normalize email to lowercase', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'WORK@Company.COM' });

      expect(response.status).toBe(200);
      // The token should be created with lowercase email
    });

    it('should reject when user has reached max verified emails limit', async () => {
      // Add 10 verified emails (the max limit)
      for (let i = 0; i < 10; i++) {
        sqliteDb.prepare(`
          INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(`ve-limit-${i}`, testUser.id, `limit${i}@company.com`, Date.now(), Date.now());
      }

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'one-more@company.com' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('limit_exceeded');
      expect(response.body.message).toContain('Maximum of 10');
    });

    it('should allow adding email when under the limit', async () => {
      // Add 9 verified emails (under the limit)
      for (let i = 0; i < 9; i++) {
        sqliteDb.prepare(`
          INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(`ve-under-${i}`, testUser.id, `under${i}@company.com`, Date.now(), Date.now());
      }

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/request')
        .send({ email: 'tenth@company.com' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/verified-emails/confirm', () => {
    it('should confirm valid token and create verified email', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/confirm')
        .send({ token: `token_${testUser.id}_new@company.com` });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.email).toBe('new@company.com');

      // Verify database entry
      const entry = sqliteDb.prepare(
        'SELECT * FROM verified_email WHERE email = ?'
      ).get('new@company.com') as any;
      expect(entry).toBeDefined();
      expect(entry.user_id).toBe(testUser.id);
    });

    it('should reject without authentication', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null as any);

      const response = await request(app)
        .post('/api/verified-emails/confirm')
        .send({ token: 'some-token' });

      expect(response.status).toBe(401);
    });

    it('should reject missing token', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/confirm')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Token is required');
    });

    it('should reject invalid token', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/confirm')
        .send({ token: 'invalid-token' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid or expired verification link');
    });

    it('should reject expired token', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/confirm')
        .send({ token: 'expired_token' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid or expired verification link');
    });

    it('should reject token belonging to different user', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/confirm')
        .send({ token: 'wrong_user_token' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('sign in with the account');
    });

    it('should reject if email was taken during verification window', async () => {
      // Simulate race condition: email added by another user after token was generated
      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-race', testUser2.id, 'race@company.com', Date.now(), Date.now());

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .post('/api/verified-emails/confirm')
        .send({ token: `token_${testUser.id}_race@company.com` });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('This email is no longer available');
    });
  });

  describe('GET /api/verified-emails', () => {
    it('should list all verified emails for user', async () => {
      // Add verified emails
      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', testUser.id, 'work@company.com', Date.now(), Date.now());

      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-2', testUser.id, 'personal@gmail.com', Date.now(), Date.now());

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/verified-emails');

      expect(response.status).toBe(200);
      expect(response.body.emails).toHaveLength(2);
      expect(response.body.emails.map((e: any) => e.email)).toContain('work@company.com');
      expect(response.body.emails.map((e: any) => e.email)).toContain('personal@gmail.com');
    });

    it('should return empty list if no verified emails', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/verified-emails');

      expect(response.status).toBe(200);
      expect(response.body.emails).toHaveLength(0);
    });

    it('should not include other users emails', async () => {
      // Add verified email for other user
      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-other-user-email', testUser2.id, 'other-work@company.com', Date.now(), Date.now());

      // Add verified email for test user
      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-my-email', testUser.id, 'my-work@company.com', Date.now(), Date.now());

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/verified-emails');

      expect(response.status).toBe(200);
      expect(response.body.emails).toHaveLength(1);
      expect(response.body.emails[0].email).toBe('my-work@company.com');
    });

    it('should require authentication', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null as any);

      const response = await request(app)
        .get('/api/verified-emails');

      expect(response.status).toBe(401);
    });

    it('should include verifiedAt timestamp in response', async () => {
      const verifiedAt = Math.floor(Date.now() / 1000);
      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-ts', testUser.id, 'timestamp@company.com', verifiedAt, verifiedAt);

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .get('/api/verified-emails');

      expect(response.status).toBe(200);
      expect(response.body.emails[0].verifiedAt).toBeDefined();
      expect(response.body.emails[0].verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('DELETE /api/verified-emails/:id', () => {
    it('should delete verified email belonging to user', async () => {
      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-delete', testUser.id, 'todelete@company.com', Date.now(), Date.now());

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete('/api/verified-emails/ve-delete');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deleted from database
      const entry = sqliteDb.prepare(
        'SELECT * FROM verified_email WHERE id = ?'
      ).get('ve-delete');
      expect(entry).toBeUndefined();
    });

    it('should reject deleting email belonging to another user', async () => {
      sqliteDb.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-other-del', testUser2.id, 'other@company.com', Date.now(), Date.now());

      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete('/api/verified-emails/ve-other-del');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Email not found');

      // Verify not deleted
      const entry = sqliteDb.prepare(
        'SELECT * FROM verified_email WHERE id = ?'
      ).get('ve-other-del');
      expect(entry).toBeDefined();
    });

    it('should return 404 for non-existent email', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue({
        user: testUser,
        session: { id: 'session-1' },
      } as any);

      const response = await request(app)
        .delete('/api/verified-emails/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Email not found');
    });

    it('should require authentication', async () => {
      vi.mocked(auth.api.getSession).mockResolvedValue(null as any);

      const response = await request(app)
        .delete('/api/verified-emails/some-id');

      expect(response.status).toBe(401);
    });
  });
});
