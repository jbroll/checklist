/**
 * Folder Permissions Tests
 *
 * Tests for hierarchical folder permissions using Jazz testing utilities.
 * These tests verify the permission structure for sharing folders.
 *
 * Permission hierarchy:
 * - admin: Full control (read, write, manage members)
 * - writer: Can read and write, cannot manage members
 * - reader: Can only read
 *
 * By default uses mock backend (fast). Run with JAZZ_TEST_BACKEND=jazz for real Jazz.
 *
 * Note: Uses ctx.waitForSync() after sharing operations to ensure data is
 * synced across accounts before assertions. This is reliable for both backends.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { JazzTestContext } from '../test/jazz-testing';

describe('Folder Permissions', () => {
  let ctx: JazzTestContext;

  beforeEach(async () => {
    // Uses JAZZ_TEST_BACKEND env var, defaults to mock (fast)
    ctx = await JazzTestContext.create('Owner');
  });

  describe('Folder Creation', () => {
    it('should create a folder with owner as admin', async () => {
      const folder = await ctx.createFolder('My List');

      expect(folder.node.name).toBe('My List');
      expect(folder.group).toBeDefined();
      expect(ctx.canAdmin(folder, ctx.account)).toBe(true);
    });

    it('should create template and organizational folders', async () => {
      const template = await ctx.createFolder('Shopping', { isTemplate: true });
      const orgFolder = await ctx.createFolder('Projects', { isTemplate: false });

      // Template has items/sessions
      expect(template.node.items).toBeDefined();
      expect(template.node.sessions).toBeDefined();

      // Org folder has children
      expect(orgFolder.node.children).toBeDefined();
    });
  });

  describe('Sharing with Collaborators', () => {
    it('should allow sharing folder with another user as writer', async () => {
      const folder = await ctx.createFolder('Shared List');
      const collaborator = await ctx.createAccount('Collaborator');

      ctx.shareFolder(folder, collaborator, 'writer');
      await ctx.waitForSync();

      expect(ctx.canRead(folder, collaborator)).toBe(true);
      expect(ctx.canWrite(folder, collaborator)).toBe(true);
      expect(ctx.canAdmin(folder, collaborator)).toBe(false);
    });

    it('should allow sharing folder as reader (view only)', async () => {
      const folder = await ctx.createFolder('View Only List');
      const viewer = await ctx.createAccount('Viewer');

      ctx.shareFolder(folder, viewer, 'reader');
      await ctx.waitForSync();

      expect(ctx.canRead(folder, viewer)).toBe(true);
      expect(ctx.canWrite(folder, viewer)).toBe(false);
      expect(ctx.canAdmin(folder, viewer)).toBe(false);
    });

    it('should allow sharing folder as admin', async () => {
      const folder = await ctx.createFolder('Admin Shared');
      const admin = await ctx.createAccount('Admin');

      ctx.shareFolder(folder, admin, 'admin');
      await ctx.waitForSync();

      expect(ctx.canRead(folder, admin)).toBe(true);
      expect(ctx.canWrite(folder, admin)).toBe(true);
      expect(ctx.canAdmin(folder, admin)).toBe(true);
    });
  });

  describe('Nested Folder Permissions', () => {
    it('should inherit permissions when using same group', async () => {
      const parent = await ctx.createFolder('Parent', { isTemplate: false });
      const child = await ctx.createFolder('Child', {
        parent,
        inheritGroup: true, // Same group = same permissions
      });

      const collaborator = await ctx.createAccount('Collaborator');
      ctx.shareFolder(parent, collaborator, 'writer');
      await ctx.waitForSync();

      // Child should have same permissions since it uses parent's group
      expect(ctx.canWrite(child, collaborator)).toBe(true);
      // Verify child inherits parent's permissions (collaborator gets access via shared group)
      expect(ctx.canRead(child, collaborator)).toBe(true);
    });

    it('should have separate permissions when using independent groups', async () => {
      // Create folders with completely independent groups (no inheritance)
      const parent = await ctx.createFolder('Parent', { isTemplate: false });

      // Create child without parent reference to avoid group inheritance
      const child = await ctx.createFolder('Child', { isTemplate: true });

      const collaborator = await ctx.createAccount('Collaborator');
      ctx.shareFolder(parent, collaborator, 'writer');
      await ctx.waitForSync();

      // Child has independent group, collaborator has no access
      expect(ctx.canWrite(parent, collaborator)).toBe(true);
      expect(ctx.canRead(child, collaborator)).toBe(false);
    });

    it('should allow different permission levels with independent groups', async () => {
      // Create independent folders (not parent-child to avoid group inheritance)
      const folder1 = await ctx.createFolder('Folder 1', { isTemplate: true });
      const folder2 = await ctx.createFolder('Folder 2', { isTemplate: true });

      const collaborator = await ctx.createAccount('Collaborator');

      // Writer on folder1, reader on folder2
      ctx.shareFolder(folder1, collaborator, 'writer');
      ctx.shareFolder(folder2, collaborator, 'reader');
      await ctx.waitForSync();

      expect(ctx.canWrite(folder1, collaborator)).toBe(true);
      expect(ctx.canWrite(folder2, collaborator)).toBe(false);
      expect(ctx.canRead(folder2, collaborator)).toBe(true);
    });
  });

  describe('Multi-User Scenarios', () => {
    it('should support multiple collaborators with different roles', async () => {
      const folder = await ctx.createFolder('Team Folder');

      const alice = await ctx.createAccount('Alice');
      const bob = await ctx.createAccount('Bob');
      const charlie = await ctx.createAccount('Charlie');

      ctx.shareFolder(folder, alice, 'admin');
      ctx.shareFolder(folder, bob, 'writer');
      ctx.shareFolder(folder, charlie, 'reader');
      await ctx.waitForSync();

      expect(ctx.canAdmin(folder, alice)).toBe(true);
      expect(ctx.canWrite(folder, bob)).toBe(true);
      expect(ctx.canAdmin(folder, bob)).toBe(false);
      expect(ctx.canRead(folder, charlie)).toBe(true);
      expect(ctx.canWrite(folder, charlie)).toBe(false);
    });

    it('should allow switching active account context', async () => {
      const folder = await ctx.createFolder('Shared');
      const collaborator = await ctx.createAccount('Collaborator');
      ctx.shareFolder(folder, collaborator, 'writer');
      await ctx.waitForSync();

      // Owner can edit (Jazz requires $jazz.set for CoMap updates)
      folder.node.$jazz.set('name', 'Renamed by Owner');
      await ctx.waitForSync();
      expect(folder.node.name).toBe('Renamed by Owner');

      // Switch to collaborator
      ctx.setActiveAccount(collaborator);

      // Collaborator can also edit (as writer)
      folder.node.$jazz.set('name', 'Renamed by Collaborator');
      await ctx.waitForSync();
      expect(folder.node.name).toBe('Renamed by Collaborator');
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with no access', async () => {
      const folder = await ctx.createFolder('Private');
      const outsider = await ctx.createAccount('Outsider');
      await ctx.waitForSync();

      // Outsider was never added to the group
      expect(ctx.canRead(folder, outsider)).toBe(false);
      expect(ctx.canWrite(folder, outsider)).toBe(false);
      expect(ctx.canAdmin(folder, outsider)).toBe(false);
    });

    it('should handle deeply nested folder hierarchy', async () => {
      const root = await ctx.createFolder('Root', { isTemplate: false });
      let current = root;

      // Create 5 levels deep, all inheriting parent group
      for (let i = 1; i <= 5; i++) {
        current = await ctx.createFolder(`Level ${i}`, {
          parent: current,
          inheritGroup: true,
        });
      }

      const collaborator = await ctx.createAccount('Deep Collaborator');
      ctx.shareFolder(root, collaborator, 'writer');
      await ctx.waitForSync();

      // Collaborator should have access at all levels (permissions inherited via shared group)
      expect(ctx.canWrite(current, collaborator)).toBe(true);
      expect(ctx.canRead(current, collaborator)).toBe(true);
    });
  });
});
