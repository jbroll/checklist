import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { auth } from './auth.js';
import { addToFolderGroup } from './agent.js';

export function setupSharingRoutes(app: Express, db: Database.Database) {
  // Generate invite link
  app.post('/api/shares/invite', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return res.status(401).json({ error: 'unauthorized' });

    const { toEmail, folderCoValueId, recipientJazzAccountId, permission, expiresInDays } = req.body;

    const token = randomBytes(32).toString('hex');
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60);

    db.prepare(`
      INSERT INTO share_invites (token, from_email, to_email, folder_covalue_id,
        recipient_jazz_account_id, permission, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(token, session.user.email, toEmail, folderCoValueId,
      recipientJazzAccountId, permission, expiresAt, Math.floor(Date.now() / 1000));

    res.json({ token, shareUrl: `${process.env.FRONTEND_URL}/invite/${token}` });
  });

  // Validate token (for preview)
  app.get('/api/shares/validate/:token', (req, res) => {
    const invite = db.prepare(`
      SELECT * FROM share_invites WHERE token = ? AND accepted_at IS NULL
    `).get(req.params.token);

    if (!invite) return res.json({ valid: false, error: 'not_found' });

    const now = Math.floor(Date.now() / 1000);
    if (invite.expires_at < now) return res.json({ valid: false, error: 'expired' });

    res.json({
      valid: true,
      fromEmail: invite.from_email,
      toEmail: invite.to_email,
      permission: invite.permission,
    });
  });

  // Accept invite
  app.post('/api/shares/accept', async (req, res) => {
    const session = await auth.api.getSession({ headers: req.headers });
    if (!session?.user) return res.status(401).json({ error: 'unauthorized' });

    const { token } = req.body;

    const invite = db.prepare(`
      SELECT * FROM share_invites WHERE token = ? AND accepted_at IS NULL
    `).get(token);

    if (!invite) return res.status(400).json({ error: 'invalid_token' });

    const now = Math.floor(Date.now() / 1000);
    if (invite.expires_at < now) return res.status(400).json({ error: 'expired' });

    // Validate: logged-in email matches invite
    if (session.user.email !== invite.to_email) {
      return res.status(403).json({
        error: 'email_mismatch',
        message: `This invite is for ${invite.to_email}`
      });
    }

    // Add to Jazz group
    try {
      await addToFolderGroup(invite.folder_covalue_id, invite.recipient_jazz_account_id, invite.permission);

      // Mark as accepted
      db.prepare(`UPDATE share_invites SET accepted_at = ? WHERE token = ?`)
        .run(now, token);

      res.json({ success: true, folderId: invite.folder_covalue_id });
    } catch (error) {
      console.error('Failed to add to group:', error);
      res.status(500).json({ error: 'failed_to_grant_access' });
    }
  });
}
