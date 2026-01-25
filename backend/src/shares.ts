import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { auth } from './auth.js';
import { addToGroup, getGroupMembers, removeFromGroup } from './agent.js';
import { ApiErrors } from './lib/api-error.js';
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
    if (!session?.user) return ApiErrors.unauthorized(res);

    // Rate limit by user email
    if (!shareInviteLimiter.check(session.user.email)) {
      return ApiErrors.rateLimited(res);
    }

    const { recipientEmail, targetId, permission, expiresInDays } = req.body;

    // Get sender's Jazz account ID for audit purposes
    const senderJazzAccountId = (session.user as any).accountID;
    if (!senderJazzAccountId) {
      return ApiErrors.badRequest(res, 'Jazz account ID is required to share');
    }

    // Note: We don't validate Jazz group membership here. The frontend runs as the
    // authenticated user and will add the agent to the folder's group after this
    // call succeeds. If the user doesn't have permission, the frontend group
    // manipulation will fail. Jazz's permission model handles access control.

    const token = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60);

    db.prepare(`
      INSERT INTO share_invites (token, sender_email, sender_jazz_account_id,
        recipient_email, target_covalue_id, permission, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      token,
      session.user.email,
      senderJazzAccountId,
      recipientEmail,
      targetId,
      permission,
      expiresAt,
      Math.floor(Date.now() / 1000)
    );

    // Return agent account ID so frontend can add it to the target
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
      return ApiErrors.rateLimited(res);
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
    if (!session?.user) return ApiErrors.unauthorized(res);

    const { token } = req.body;

    const invite = db.prepare(`
      SELECT * FROM share_invites WHERE token = ? AND accepted_at IS NULL
    `).get(token) as any;

    if (!invite) return ApiErrors.badRequest(res, 'Invalid or expired invite token');

    const now = Math.floor(Date.now() / 1000);
    if (invite.expires_at < now) return ApiErrors.badRequest(res, 'This invite has expired');

    // Validate: logged-in email matches invite (check primary + verified emails)
    const emailMatches = canUserAccessShareEmail(
      db,
      session.user.id,
      session.user.email,
      invite.recipient_email
    );

    if (!emailMatches) {
      return ApiErrors.forbidden(res, 'This invite is not associated with your account');
    }

    // Get recipient's Jazz account ID from BetterAuth
    const recipientJazzAccountId = (session.user as any).accountID;
    if (!recipientJazzAccountId) {
      return ApiErrors.badRequest(res, 'You do not have a Jazz account. Please try logging out and back in.');
    }

    // Note: We trust that the invite was created by someone with access at creation time
    // The sender_jazz_account_id is stored for audit purposes
    // Validating current access would require the agent to be a member of all targets,
    // which isn't practical

    // Add recipient to Jazz group
    try {
      const result = await addToGroup(
        invite.target_covalue_id,
        recipientJazzAccountId,
        invite.permission
      );

      // Mark as accepted (even if already a member - the invite was still valid)
      db.prepare(`UPDATE share_invites SET accepted_at = ? WHERE token = ?`)
        .run(now, token);

      // Return success - if already a member, they still have access which is the goal
      res.json({
        success: true,
        targetId: invite.target_covalue_id,
        alreadyMember: result?.alreadyMember || false
      });
    } catch (error) {
      console.error('Failed to add to group:', error);
      return ApiErrors.serverError(res, 'Failed to grant access');
    }
  });

  // Get pending invites for a target
  app.get('/api/shares/targets/:targetId/invites', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return ApiErrors.unauthorized(res);

    const { targetId } = req.params;

    // Validate target ID format
    if (!isValidCoValueId(targetId)) {
      return ApiErrors.badRequest(res, 'Invalid target ID format');
    }

    try {
      // Authorization check: verify user owns invites for this target OR is a collaborator
      const userJazzAccountId = (session.user as any).accountID;

      // Check if user is the owner (has sent invites for this target)
      const ownerInvite = db.prepare(`
        SELECT 1 FROM share_invites
        WHERE target_covalue_id = ? AND sender_email = ?
        LIMIT 1
      `).get(targetId, session.user.email);

      let isAuthorized = !!ownerInvite;

      // If not owner, check if user is a collaborator
      if (!isAuthorized && userJazzAccountId) {
        const members = await getGroupMembers(targetId);
        const isMember = members.some(m => m.id === userJazzAccountId);
        isAuthorized = isMember;
      }

      if (!isAuthorized) {
        return ApiErrors.forbidden(res, 'You do not have access to view invites for this item');
      }

      const invites = db.prepare(`
        SELECT token, recipient_email, permission, created_at, expires_at
        FROM share_invites
        WHERE target_covalue_id = ? AND accepted_at IS NULL AND (expires_at > ? OR expires_at IS NULL)
        ORDER BY created_at DESC
      `).all(targetId, Math.floor(Date.now() / 1000)) as any[];

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
      return ApiErrors.serverError(res, 'Failed to get invites');
    }
  });

  // Revoke an invite
  app.delete('/api/shares/invites/:token', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return ApiErrors.unauthorized(res);

    const { token } = req.params;

    try {
      const invite = db.prepare(`
        SELECT * FROM share_invites WHERE token = ?
      `).get(token) as any;

      if (!invite) {
        return ApiErrors.notFound(res, 'Invite');
      }

      // Only the sender can revoke their own invites
      if (invite.sender_email !== session.user.email) {
        return ApiErrors.forbidden(res);
      }

      // Delete the invite (soft delete would be better, but this works)
      db.prepare(`DELETE FROM share_invites WHERE token = ?`).run(token);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to revoke invite:', error);
      return ApiErrors.serverError(res, 'Failed to revoke invite');
    }
  });

  // Get collaborators for a target
  app.get('/api/shares/targets/:targetId/collaborators', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return ApiErrors.unauthorized(res);

    const { targetId } = req.params;

    // Validate target ID format
    if (!isValidCoValueId(targetId)) {
      return ApiErrors.badRequest(res, 'Invalid target ID format');
    }

    try {
      // Authorization check: verify user is a member of this target's group
      const userJazzAccountId = (session.user as any).accountID;

      if (!userJazzAccountId) {
        return ApiErrors.forbidden(res, 'You do not have access to view collaborators for this item');
      }

      // Get Jazz group members
      const members = await getGroupMembers(targetId);

      // Check if requesting user is a member
      const isMember = members.some(m => m.id === userJazzAccountId);
      if (!isMember) {
        return ApiErrors.forbidden(res, 'You do not have access to view collaborators for this item');
      }

      // Map Jazz account IDs to user info from BetterAuth
      const collaborators = [];

      for (const member of members) {
        // Query BetterAuth database for user with this Jazz account ID
        const user = db.prepare(`
          SELECT id, email, name FROM user WHERE accountID = ?
        `).get(member.id) as any;

        if (user) {
          collaborators.push({
            userId: user.id,
            accountId: member.id,
            email: user.email,
            name: user.name || user.email,
            permission: member.role,
            role: member.role,
          });
        }
      }

      res.json({ collaborators });
    } catch (error) {
      console.error('Failed to get collaborators:', error);
      return ApiErrors.serverError(res, 'Failed to get collaborators');
    }
  });

  // Remove a collaborator
  app.delete('/api/shares/targets/:targetId/collaborators/:accountId', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers as any });
    if (!session?.user) return ApiErrors.unauthorized(res);

    const { targetId, accountId } = req.params;

    // Validate target ID format
    if (!isValidCoValueId(targetId)) {
      return ApiErrors.badRequest(res, 'Invalid target ID format');
    }

    // Validate account ID format (Jazz account IDs also use co_ prefix)
    if (!isValidCoValueId(accountId)) {
      return ApiErrors.badRequest(res, 'Invalid account ID format');
    }

    try {
      // Verify the requesting user has admin permission on this target
      const requesterJazzAccountId = (session.user as any).accountID;
      if (requesterJazzAccountId) {
        const members = await getGroupMembers(targetId);
        const requesterMember = members.find(m => m.id === requesterJazzAccountId);
        if (!requesterMember || requesterMember.role !== 'admin') {
          return ApiErrors.forbidden(res, 'Only admins can remove collaborators');
        }
      }

      // Remove from Jazz group
      await removeFromGroup(targetId, accountId);

      res.json({ success: true });
    } catch (error) {
      console.error('Failed to remove collaborator:', error);
      return ApiErrors.serverError(res, 'Failed to remove collaborator');
    }
  });
}
