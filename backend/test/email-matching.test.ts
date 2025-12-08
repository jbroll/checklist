import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { canUserAccessShareEmail, getAllUserEmails } from '../src/lib/email-matching.js';

describe('email-matching', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');

    // Create verified_email table
    db.exec(`
      CREATE TABLE verified_email (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        verified_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX idx_verified_email_user_id ON verified_email(user_id);
      CREATE INDEX idx_verified_email_email ON verified_email(email);
    `);
  });

  afterEach(() => {
    db.close();
  });

  describe('canUserAccessShareEmail', () => {
    it('should return true when share email matches primary email', () => {
      const result = canUserAccessShareEmail(
        db,
        'user-123',
        'alice@example.com',
        'alice@example.com'
      );
      expect(result).toBe(true);
    });

    it('should match primary email case-insensitively', () => {
      expect(
        canUserAccessShareEmail(db, 'user-123', 'Alice@Example.COM', 'alice@example.com')
      ).toBe(true);

      expect(
        canUserAccessShareEmail(db, 'user-123', 'alice@example.com', 'ALICE@EXAMPLE.COM')
      ).toBe(true);
    });

    it('should return false when email does not match and no verified emails', () => {
      const result = canUserAccessShareEmail(
        db,
        'user-123',
        'alice@example.com',
        'bob@example.com'
      );
      expect(result).toBe(false);
    });

    it('should return true when share email matches a verified email', () => {
      // Add verified email
      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', 'user-123', 'alice-work@company.com', Date.now(), Date.now());

      const result = canUserAccessShareEmail(
        db,
        'user-123',
        'alice@example.com',
        'alice-work@company.com'
      );
      expect(result).toBe(true);
    });

    it('should match verified email case-insensitively', () => {
      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', 'user-123', 'Alice-Work@Company.COM', Date.now(), Date.now());

      expect(
        canUserAccessShareEmail(db, 'user-123', 'alice@example.com', 'alice-work@company.com')
      ).toBe(true);

      expect(
        canUserAccessShareEmail(db, 'user-123', 'alice@example.com', 'ALICE-WORK@COMPANY.COM')
      ).toBe(true);
    });

    it('should return false for verified email belonging to different user', () => {
      // Add verified email for user-456
      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', 'user-456', 'bob-work@company.com', Date.now(), Date.now());

      // user-123 should not be able to access share to bob-work@company.com
      const result = canUserAccessShareEmail(
        db,
        'user-123',
        'alice@example.com',
        'bob-work@company.com'
      );
      expect(result).toBe(false);
    });

    it('should handle multiple verified emails', () => {
      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', 'user-123', 'alice-work@company.com', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-2', 'user-123', 'alice-personal@gmail.com', Date.now(), Date.now());

      // All three emails should work
      expect(
        canUserAccessShareEmail(db, 'user-123', 'alice@example.com', 'alice@example.com')
      ).toBe(true);

      expect(
        canUserAccessShareEmail(db, 'user-123', 'alice@example.com', 'alice-work@company.com')
      ).toBe(true);

      expect(
        canUserAccessShareEmail(db, 'user-123', 'alice@example.com', 'alice-personal@gmail.com')
      ).toBe(true);

      // Unknown email should not work
      expect(
        canUserAccessShareEmail(db, 'user-123', 'alice@example.com', 'unknown@other.com')
      ).toBe(false);
    });
  });

  describe('getAllUserEmails', () => {
    it('should return only primary email when no verified emails', () => {
      const emails = getAllUserEmails(db, 'user-123', 'alice@example.com');
      expect(emails).toEqual(['alice@example.com']);
    });

    it('should return primary and all verified emails', () => {
      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', 'user-123', 'alice-work@company.com', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-2', 'user-123', 'alice-personal@gmail.com', Date.now(), Date.now());

      const emails = getAllUserEmails(db, 'user-123', 'alice@example.com');

      expect(emails).toContain('alice@example.com');
      expect(emails).toContain('alice-work@company.com');
      expect(emails).toContain('alice-personal@gmail.com');
      expect(emails).toHaveLength(3);
    });

    it('should not include emails from other users', () => {
      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', 'user-123', 'alice-work@company.com', Date.now(), Date.now());

      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-2', 'user-456', 'bob-work@company.com', Date.now(), Date.now());

      const aliceEmails = getAllUserEmails(db, 'user-123', 'alice@example.com');
      expect(aliceEmails).toContain('alice@example.com');
      expect(aliceEmails).toContain('alice-work@company.com');
      expect(aliceEmails).not.toContain('bob-work@company.com');
      expect(aliceEmails).toHaveLength(2);

      const bobEmails = getAllUserEmails(db, 'user-456', 'bob@example.com');
      expect(bobEmails).toContain('bob@example.com');
      expect(bobEmails).toContain('bob-work@company.com');
      expect(bobEmails).not.toContain('alice-work@company.com');
      expect(bobEmails).toHaveLength(2);
    });

    it('should return primary email first', () => {
      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('ve-1', 'user-123', 'zzz@example.com', Date.now(), Date.now());

      const emails = getAllUserEmails(db, 'user-123', 'alice@example.com');
      expect(emails[0]).toBe('alice@example.com');
    });
  });
});
