/**
 * Multi-User Sharing Scenarios
 *
 * Tests complex sharing flows across multiple accounts using the scenario framework.
 * These tests bypass UI entirely and test the API layer directly.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { TestContext, scenario, createTestContext } from './scenario-testing.js';
import { initDb } from '../src/db.js';
import { setupSharingRoutes } from '../src/shares.js';
import { setupVerifiedEmailRoutes } from '../src/verified-emails.js';

// Mock dependencies
vi.mock('../src/lib/rate-limiter.js', () => ({
  shareInviteLimiter: { check: vi.fn().mockReturnValue(true) },
  tokenValidationLimiter: { check: vi.fn().mockReturnValue(true) },
  emailVerificationLimiter: { check: vi.fn().mockReturnValue(true) },
}));

vi.mock('../src/auth.js', () => {
  const Database = require('better-sqlite3');
  return {
    sqliteDb: new Database(':memory:'),
    auth: { api: { getSession: vi.fn() } },
  };
});

vi.mock('../src/agent.js', () => ({
  addToGroup: vi.fn().mockResolvedValue({ alreadyMember: false }),
  validateSenderAccess: vi.fn().mockResolvedValue(true),
  getGroupMembers: vi.fn().mockResolvedValue([]),
  removeFromGroup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/email-sender.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

import { auth } from '../src/auth.js';
import {
  addToGroup,
  validateSenderAccess,
  getGroupMembers,
} from '../src/agent.js';
import { shareInviteLimiter } from '../src/lib/rate-limiter.js';

describe('Multi-User Sharing Scenarios', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext(initDb, setupSharingRoutes, setupVerifiedEmailRoutes);
  });

  afterAll(() => {
    ctx.close();
  });

  beforeEach(() => {
    ctx.reset();
    // Wire up the context mocks to the module mocks
    vi.mocked(auth.api.getSession).mockImplementation(() => ctx.mocks.getSession());
    vi.mocked(validateSenderAccess).mockImplementation(() => ctx.mocks.validateSenderAccess());
    vi.mocked(addToGroup).mockImplementation(() => ctx.mocks.addToGroup());
    vi.mocked(getGroupMembers).mockImplementation(() => ctx.mocks.getGroupMembers());
  });

  describe('Basic Sharing Flow', () => {
    it('should allow user to share folder and recipient to accept', async () => {
      // Setup
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      // Alice creates folder and shares with Bob
      ctx.asUser('Alice');
      ctx.createFolder('Groceries');
      const invite = await ctx.shareWith('Bob', 'Groceries', { permission: 'writer' });

      // Verify invite was created
      expect(invite.token).toBeDefined();
      expect(invite.recipientEmail).toBe('bob@example.com');

      // Bob accepts the invite
      ctx.asUser('Bob');
      const result = await ctx.acceptInvite(invite.token);

      expect(result.success).toBe(true);
      expect(result.folderId).toBe(ctx.getFolder('Groceries').id);

      // Verify Jazz group was updated
      expect(addToGroup).toHaveBeenCalledWith(
        ctx.getFolder('Groceries').id,
        ctx.getUser('Bob').accountID,
        'writer'
      );
    });

    it('should reject accept from wrong email', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');
      ctx.addUser('Charlie');

      // Alice shares with Bob
      ctx.asUser('Alice');
      ctx.createFolder('Private');
      const invite = await ctx.shareWith('Bob', 'Private');

      // Charlie tries to accept Bob's invite
      ctx.asUser('Charlie');
      const result = await ctx.acceptInvite(invite.token);

      expect(result.success).toBe(false);
      expect(result.error).toBe('forbidden');
    });
  });

  describe('Sharing with Email Aliases', () => {
    it('should allow accept via verified alias email', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      // Bob has a work email alias
      ctx.addVerifiedEmail('Bob', 'bob.work@company.com');

      // Alice shares with Bob's work email
      ctx.asUser('Alice');
      ctx.createFolder('Work Project');
      const invite = await ctx.createInvite('Work Project', 'bob.work@company.com');

      // Bob accepts (logged in with primary email, invite sent to alias)
      ctx.asUser('Bob');
      const result = await ctx.acceptInvite(invite.token);

      expect(result.success).toBe(true);
    });

    it('should reject accept when email is not a verified alias', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      // Alice shares with an email Bob hasn't verified
      ctx.asUser('Alice');
      ctx.createFolder('Secret');
      const invite = await ctx.createInvite('Secret', 'bob.other@unknown.com');

      // Bob tries to accept
      ctx.asUser('Bob');
      const result = await ctx.acceptInvite(invite.token);

      expect(result.success).toBe(false);
      expect(result.error).toBe('forbidden');
    });

    it('should handle case-insensitive alias matching', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      // Bob adds lowercase alias
      ctx.addVerifiedEmail('Bob', 'bob.alias@test.com');

      // Alice shares with mixed case
      ctx.asUser('Alice');
      ctx.createFolder('Shared');
      const invite = await ctx.createInvite('Shared', 'Bob.ALIAS@Test.com');

      // Bob accepts
      ctx.asUser('Bob');
      const result = await ctx.acceptInvite(invite.token);

      expect(result.success).toBe(true);
    });
  });

  describe('Invite Lifecycle', () => {
    it('should reject expired invites', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      ctx.asUser('Alice');
      ctx.createFolder('Folder');
      const invite = await ctx.shareWith('Bob', 'Folder');

      // Manually expire the invite
      ctx.expireInvite(invite.token);

      // Bob tries to accept expired invite
      ctx.asUser('Bob');
      const result = await ctx.acceptInvite(invite.token);

      expect(result.success).toBe(false);
      expect(result.error).toBe('bad_request');
      expect(result.message).toContain('expired');
    });

    it('should reject already-accepted invites', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      ctx.asUser('Alice');
      ctx.createFolder('Folder');
      const invite = await ctx.shareWith('Bob', 'Folder');

      // Bob accepts
      ctx.asUser('Bob');
      const firstResult = await ctx.acceptInvite(invite.token);
      expect(firstResult.success).toBe(true);

      // Bob tries to accept again - should fail because accepted_at is set
      const secondResult = await ctx.acceptInvite(invite.token);

      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toBe('bad_request');
    });

    it('should allow sender to revoke invite before acceptance', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      ctx.asUser('Alice');
      ctx.createFolder('Folder');
      const invite = await ctx.shareWith('Bob', 'Folder');

      // Alice revokes
      const revokeResult = await ctx.revokeInvite(invite.token);
      expect(revokeResult.success).toBe(true);

      // Bob tries to accept revoked invite
      ctx.asUser('Bob');
      const acceptResult = await ctx.acceptInvite(invite.token);

      expect(acceptResult.success).toBe(false);
    });

    it('should prevent non-sender from revoking', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');
      ctx.addUser('Charlie');

      ctx.asUser('Alice');
      ctx.createFolder('Folder');
      const invite = await ctx.shareWith('Bob', 'Folder');

      // Charlie tries to revoke Alice's invite
      ctx.asUser('Charlie');
      const result = await ctx.revokeInvite(invite.token);

      expect(result.success).toBe(false);
    });
  });

  describe('Permission Levels', () => {
    it('should share with view permission', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      ctx.asUser('Alice');
      ctx.createFolder('ReadOnly');
      await ctx.shareWith('Bob', 'ReadOnly', { permission: 'reader' });

      ctx.asUser('Bob');
      await ctx.acceptInvite();

      expect(addToGroup).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'reader');
    });

    it('should share with admin permission', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      ctx.asUser('Alice');
      ctx.createFolder('Collaborative');
      await ctx.shareWith('Bob', 'Collaborative', { permission: 'admin' });

      ctx.asUser('Bob');
      await ctx.acceptInvite();

      expect(addToGroup).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'admin');
    });
  });

  describe('Multi-User Scenarios (Declarative)', () => {
    it('team sharing workflow', async () => {
      let bobAcceptResult: any;
      let charlieAcceptResult: any;

      await scenario(ctx)
        .withUsers(['Alice', 'Bob', 'Charlie'])
        .asUser('Alice')
        .createFolder('Team Project')
        .asUser('Alice')
        .shareWith('Bob', 'Team Project', { permission: 'writer' })
        .asUser('Bob')
        .tryAcceptInvite((r) => (bobAcceptResult = r))
        .asUser('Alice')
        .shareWith('Charlie', 'Team Project', { permission: 'reader' })
        .asUser('Charlie')
        .tryAcceptInvite((r) => (charlieAcceptResult = r))
        .verify(() => {
          expect(bobAcceptResult.success).toBe(true);
          expect(charlieAcceptResult.success).toBe(true);
        })
        .run();
    });

    it('alias-based share acceptance', async () => {
      let acceptResult: any;

      await scenario(ctx)
        .withUsers(['Alice', 'Bob'])
        .asUser('Bob')
        .addAlias('bob.personal@gmail.com')
        .step('Alice shares with Bob alias', async (ctx) => {
          ctx.asUser('Alice');
          ctx.createFolder('Personal Shared');
          await ctx.createInvite('Personal Shared', 'bob.personal@gmail.com');
        })
        .asUser('Bob')
        .tryAcceptInvite((r) => (acceptResult = r))
        .verify(() => {
          expect(acceptResult.success).toBe(true);
        })
        .run();
    });
  });

  describe('Edge Cases', () => {
    it('should handle sharing with self (same email)', async () => {
      ctx.addUser('Alice');

      ctx.asUser('Alice');
      ctx.createFolder('MyFolder');

      // Alice tries to share with herself
      const invite = await ctx.createInvite('MyFolder', 'alice@example.com');

      // Alice accepts her own invite
      const result = await ctx.acceptInvite(invite.token);

      // This should work but Jazz agent might indicate already a member
      ctx.mocks.addToGroup.mockResolvedValue({ alreadyMember: true });
      expect(result.success).toBe(true);
    });

    it('should validate token format before database lookup', async () => {
      ctx.addUser('Alice');

      ctx.asUser('Alice');

      // Try to validate a malformed token
      const result = await ctx.validateInvite('not-a-valid-hex-token');

      expect(result.valid).toBe(false);
    });

    it('should handle concurrent invite creation', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      ctx.asUser('Alice');
      ctx.createFolder('Folder');

      // Create multiple invites concurrently
      const [invite1, invite2] = await Promise.all([
        ctx.shareWith('Bob', 'Folder'),
        ctx.shareWith('Bob', 'Folder'),
      ]);

      // Both should succeed with different tokens
      expect(invite1.token).not.toBe(invite2.token);

      // Bob can accept either one
      ctx.asUser('Bob');
      const result = await ctx.acceptInvite(invite1.token);
      expect(result.success).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should reject when rate limited', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');

      ctx.asUser('Alice');
      ctx.createFolder('Folder');

      // Simulate rate limit hit using the mocked module
      vi.mocked(shareInviteLimiter.check).mockReturnValue(false);

      try {
        await ctx.shareWith('Bob', 'Folder');
        expect.fail('Should have thrown due to rate limit');
      } catch (e: any) {
        expect(e.message).toContain('429');
      }

      // Restore for other tests
      vi.mocked(shareInviteLimiter.check).mockReturnValue(true);
    });
  });

  describe('Authorization Checks', () => {
    // Note: Backend no longer validates Jazz group membership at invite creation.
    // Access control is handled by the frontend through Jazz's permission model.
    // When the frontend adds the agent to the folder's group, Jazz enforces
    // whether the user actually has permission to do so.
    //
    // The invite database record can be created by any authenticated user,
    // but accepting the invite requires the agent to be in the target's group,
    // which only happens if the original user had permission to add it.

    it('should allow invite creation (access enforced by frontend Jazz operations)', async () => {
      ctx.addUser('Alice');
      ctx.addUser('Bob');
      ctx.addUser('Charlie');

      ctx.asUser('Alice');
      ctx.createFolder('AliceFolder');

      // Bob creates an invite for Alice's folder
      // The backend allows this - access control happens when frontend
      // tries to add the agent to the group (which would fail for Bob)
      ctx.asUser('Bob');
      const invite = await ctx.createInvite('AliceFolder', 'charlie@example.com');
      expect(invite.token).toBeDefined();
      expect(invite.recipientEmail).toBe('charlie@example.com');
    });
  });
});
