import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { auth } from './auth.js';
import { addToFolderGroup, validateSenderAccess, getFolderGroupMembers, removeFromFolderGroup } from './agent.js';
import { canUserAccessShareEmail } from './lib/email-matching.js';
import { shareInviteLimiter, tokenValidationLimiter } from './lib/rate-limiter.js';
import { validateBody, createInviteSchema, acceptInviteSchema, isValidCoValueId } from './lib/validation.js';

// Cleanup interval for expired share invites (1 hour)
const INVITE_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Cleanup expired share invites that haven't been accepted.
 * This prevents the database from growing indefinitely.
 */
function cleanupExpiredInvites(db: Database.Database) {
  try {
    const result = db.prepare(`
      DELETE FROM share_invites
      WHERE expires_at < ?
      AND accepted_at IS NULL
    `).run(Math.floor(Date.now() / 1000));

    if (result.changes > 0) {
      console.log(`[shares] Cleaned up ${result.changes} expired share invites`);
    }
  } catch (error) {
    console.error('[shares] Failed to cleanup expired invites:', error);
  }
}

export function setupSharingRoutes(app: Express, db: Database.Database) {
  // Run cleanup immediately on startup
  cleanupExpiredInvites(db);

  // Schedule periodic cleanup
  const cleanupInterval = setInterval(() => cleanupExpiredInvites(db), INVITE_CLEANUP_INTERVAL_MS);
  // Don't block process exit
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  // Generate invite link
  app.post('/api/shares/invite', validateBody(createInviteSchema), async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return res.status(401).json({ error: 'unauthorized' });

    // Rate limit by user email
    if (!shareInviteLimiter.check(session.user.email)) {
      return res.status(429).json({ error: 'rate_limited', message: 'Too many invite requests. Please try again later.' });
    }

    const { recipientEmail, folderCoValueId, permission, expiresInDays } = req.body;

    // Validate sender has access to the folder before creating invite
    const senderJazzAccountId = (session.user as any).accountID;
    if (!senderJazzAccountId) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'Jazz account ID is required to share folders'
      });
    }

    const hasAccess = await validateSenderAccess(folderCoValueId, senderJazzAccountId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'forbidden', message: 'You do not have access to share this folder' });
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60);

    db.prepare(`
      INSERT INTO share_invites (token, sender_email, sender_jazz_account_id,
        recipient_email, folder_covalue_id, permission, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      session.user.email,
      senderJazzAccountId,
      recipientEmail,
      folderCoValueId,
      permission,
      expiresAt,
      Math.floor(Date.now() / 1000)
    );

    // Return agent account ID so frontend can add it to the folder
    res.json({
      token,
      shareUrl: `${process.env.FRONTEND_URL}/invite/${token}`,
      agentAccountId: process.env.JAZZ_AGENT_ACCOUNT_ID
    });
  });

  // Validate token (for preview)
  app.get('/api/shares/validate/:token', (req, res) => {
    // Rate limit by IP to prevent brute-force attacks on tokens
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!tokenValidationLimiter.check(clientIp)) {
      return res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Please try again later.' });
    }

    const invite = db.prepare(`
      SELECT * FROM share_invites WHERE token = ? AND accepted_at IS NULL
    `).get(req.params.token) as any;

    if (!invite) return res.json({ valid: false, error: 'not_found' });

    const now = Math.floor(Date.now() / 1000);
    if (invite.expires_at < now) return res.json({ valid: false, error: 'expired' });

    res.json({
      valid: true,
      senderEmail: invite.sender_email,
      recipientEmail: invite.recipient_email,
      permission: invite.permission,
    });
  });

  // Accept invite
  app.post('/api/shares/accept', validateBody(acceptInviteSchema), async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return res.status(401).json({ error: 'unauthorized' });

    const { token } = req.body;

    const invite = db.prepare(`
      SELECT * FROM share_invites WHERE token = ? AND accepted_at IS NULL
    `).get(token) as any;

    if (!invite) return res.status(400).json({ error: 'invalid_token' });

    const now = Math.floor(Date.now() / 1000);
    if (invite.expires_at < now) return res.status(400).json({ error: 'expired' });

    // Validate: logged-in email matches invite (check primary + verified emails)
    const emailMatches = canUserAccessShareEmail(
      db,
      session.user.id,
      session.user.email,
      invite.recipient_email
    );

    if (!emailMatches) {
      return res.status(403).json({
        error: 'email_mismatch',
        message: 'This invite is not associated with your account',
      });
    }

    // Get recipient's Jazz account ID from BetterAuth
    const recipientJazzAccountId = (session.user as any).accountID;
    if (!recipientJazzAccountId) {
      return res.status(400).json({
        error: 'no_jazz_account',
        message: 'You do not have a Jazz account. Please try logging out and back in.'
      });
    }

    // Note: We trust that the invite was created by someone with access at creation time
    // The sender_jazz_account_id is stored for audit purposes
    // Validating current access would require the agent to be a member of all folders,
    // which isn't practical

    // Add recipient to Jazz group
    try {
      const result = await addToFolderGroup(
        invite.folder_covalue_id,
        recipientJazzAccountId,
        invite.permission
      );

      // Mark as accepted (even if already a member - the invite was still valid)
      db.prepare(`UPDATE share_invites SET accepted_at = ? WHERE token = ?`)
        .run(now, token);

      // Return success - if already a member, they still have access which is the goal
      res.json({
        success: true,
        folderId: invite.folder_covalue_id,
        alreadyMember: result?.alreadyMember || false
      });
    } catch (error) {
      console.error('Failed to add to group:', error);
      res.status(500).json({ error: 'failed_to_grant_access' });
    }
  });

  // Get pending invites for a folder
  app.get('/api/shares/folders/:folderId/invites', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return res.status(401).json({ error: 'unauthorized' });

    const { folderId } = req.params;

    // Validate folder ID format
    if (!isValidCoValueId(folderId)) {
      return res.status(400).json({ error: 'invalid_request', message: 'Invalid folder ID format' });
    }

    try {
      // Authorization check: verify user owns invites for this folder OR is a collaborator
      const userJazzAccountId = (session.user as any).accountID;

      // Check if user is the owner (has sent invites for this folder)
      const ownerInvite = db.prepare(`
        SELECT 1 FROM share_invites
        WHERE folder_covalue_id = ? AND sender_email = ?
        LIMIT 1
      `).get(folderId, session.user.email);

      let isAuthorized = !!ownerInvite;

      // If not owner, check if user is a collaborator
      if (!isAuthorized && userJazzAccountId) {
        const members = await getFolderGroupMembers(folderId);
        const isMember = members.some(m => m.id === userJazzAccountId);
        isAuthorized = isMember;
      }

      if (!isAuthorized) {
        return res.status(403).json({ error: 'forbidden', message: 'You do not have access to view invites for this folder' });
      }

      const invites = db.prepare(`
        SELECT token, recipient_email, permission, created_at, expires_at
        FROM share_invites
        WHERE folder_covalue_id = ? AND accepted_at IS NULL AND (expires_at > ? OR expires_at IS NULL)
        ORDER BY created_at DESC
      `).all(folderId, Math.floor(Date.now() / 1000)) as any[];

      res.json({
        invites: invites.map(invite => ({
          token: invite.token,
          recipientEmail: invite.recipient_email,
          permission: invite.permission,
          createdAt: new Date(invite.created_at * 1000).toISOString(),
          expiresAt: invite.expires_at ? new Date(invite.expires_at * 1000).toISOString() : null,
        }))
      });
    } catch (error) {
      console.error('Failed to get invites:', error);
      res.status(500).json({ error: 'failed_to_get_invites' });
    }
  });

  // Revoke an invite
  app.delete('/api/shares/invites/:token', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return res.status(401).json({ error: 'unauthorized' });

    const { token } = req.params;

    try {
      const invite = db.prepare(`
        SELECT * FROM share_invites WHERE token = ?
      `).get(token) as any;

      if (!invite) {
        return res.status(404).json({ error: 'not_found' });
      }

      // Only the sender can revoke their own invites
      if (invite.sender_email !== session.user.email) {
        return res.status(403).json({ error: 'forbidden' });
      }

      // Delete the invite (soft delete would be better, but this works)
      db.prepare(`DELETE FROM share_invites WHERE token = ?`).run(token);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to revoke invite:', error);
      res.status(500).json({ error: 'failed_to_revoke' });
    }
  });

  // Get collaborators for a folder
  app.get('/api/shares/folders/:folderId/collaborators', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return res.status(401).json({ error: 'unauthorized' });

    const { folderId } = req.params;

    // Validate folder ID format
    if (!isValidCoValueId(folderId)) {
      return res.status(400).json({ error: 'invalid_request', message: 'Invalid folder ID format' });
    }

    try {
      // Authorization check: verify user is a member of this folder's group
      const userJazzAccountId = (session.user as any).accountID;

      if (!userJazzAccountId) {
        return res.status(403).json({ error: 'forbidden', message: 'You do not have access to view collaborators for this folder' });
      }

      // Get Jazz group members
      const members = await getFolderGroupMembers(folderId);

      // Check if requesting user is a member
      const isMember = members.some(m => m.id === userJazzAccountId);
      if (!isMember) {
        return res.status(403).json({ error: 'forbidden', message: 'You do not have access to view collaborators for this folder' });
      }

      // Map Jazz account IDs to user info from BetterAuth
      const collaborators = [];

      for (const member of members) {
        // Query BetterAuth database for user with this Jazz account ID
        const user = db.prepare(`
          SELECT id, email, name FROM user WHERE accountID = ?
        `).get(member.id) as any;

        if (user) {
          // Map Jazz role back to permission level
          const permission =
            member.role === 'reader' ? 'view' :
            member.role === 'writer' ? 'edit' : 'admin';

          collaborators.push({
            userId: user.id,
            accountId: member.id,
            email: user.email,
            name: user.name || user.email,
            permission,
            role: member.role,
          });
        }
      }

      res.json({ collaborators });
    } catch (error) {
      console.error('Failed to get collaborators:', error);
      res.status(500).json({ error: 'failed_to_get_collaborators' });
    }
  });

  // Remove a collaborator
  app.delete('/api/shares/folders/:folderId/collaborators/:accountId', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return res.status(401).json({ error: 'unauthorized' });

    const { folderId, accountId } = req.params;

    // Validate folder ID format
    if (!isValidCoValueId(folderId)) {
      return res.status(400).json({ error: 'invalid_request', message: 'Invalid folder ID format' });
    }

    // Validate account ID format (Jazz account IDs also use co_ prefix)
    if (!isValidCoValueId(accountId)) {
      return res.status(400).json({ error: 'invalid_request', message: 'Invalid account ID format' });
    }

    try {
      // Verify the requesting user has admin permission on this folder
      const requesterJazzAccountId = (session.user as any).accountID;
      if (requesterJazzAccountId) {
        const members = await getFolderGroupMembers(folderId);
        const requesterMember = members.find(m => m.id === requesterJazzAccountId);
        if (!requesterMember || requesterMember.role !== 'admin') {
          return res.status(403).json({ error: 'forbidden', message: 'Only admins can remove collaborators' });
        }
      }

      // Remove from Jazz group
      await removeFromFolderGroup(folderId, accountId);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to remove collaborator:', error);
      res.status(500).json({ error: 'failed_to_remove_collaborator' });
    }
  });
}
