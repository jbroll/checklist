import type { Express } from 'express';
import type Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { auth } from './auth.js';
import nodemailer from 'nodemailer';
import {
  createVerificationToken as createToken,
  verifyToken,
  TOKEN_EXPIRY_HOURS,
} from './lib/verification-token.js';
import { emailVerificationLimiter } from './lib/rate-limiter.js';

// Configure SMTP transporter (same as auth.ts)
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.purelymail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function createVerificationToken(userId: string, email: string): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET not configured');
  return createToken(userId, email, secret);
}

function verifyTokenWithSecret(token: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) return null;
  return verifyToken(token, secret);
}

async function sendVerificationEmail(to: string, token: string) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] SMTP credentials not configured, skipping email send');
    return;
  }

  const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;

  try {
    await smtpTransporter.sendMail({
      from: process.env.EMAIL_FROM || 'kjekit <invite@kjekit.com>',
      to,
      subject: 'Verify your additional email for kjekit',
      text: `Click to verify this email address: ${verifyUrl}

This link expires in ${TOKEN_EXPIRY_HOURS} hours.

If you didn't request this, you can ignore this email.

- kjekit`,
    });
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error);
    throw error;
  }
}


export function setupVerifiedEmailRoutes(app: Express, db: Database.Database) {
  // Request email verification
  app.post('/api/verified-emails/request', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
      if (!session?.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: 'Email is required' });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check rate limit
      if (!emailVerificationLimiter.check(session.user.id)) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }

      // Check if email is same as user's primary email
      if (session.user.email.toLowerCase() === normalizedEmail) {
        return res.status(400).json({ error: 'This is already your primary email' });
      }

      // Check if email is already a primary email for another user
      const existingUser = db.prepare('SELECT id FROM user WHERE LOWER(email) = ?').get(normalizedEmail) as any;
      if (existingUser) {
        // Don't reveal that email exists - generic error
        return res.status(400).json({ error: 'This email cannot be added' });
      }

      // Check if email is already verified for any user
      const existingVerified = db.prepare('SELECT id FROM verified_email WHERE LOWER(email) = ?').get(normalizedEmail) as any;
      if (existingVerified) {
        return res.status(400).json({ error: 'This email cannot be added' });
      }

      // Create signed token
      const token = createVerificationToken(session.user.id, normalizedEmail);

      // Send verification email
      await sendVerificationEmail(normalizedEmail, token);

      res.json({ success: true });
    } catch (error) {
      console.error('[verified-emails] Error requesting verification:', error);
      res.status(500).json({ error: 'Failed to send verification email' });
    }
  });

  // Confirm email verification
  app.post('/api/verified-emails/confirm', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
      if (!session?.user) {
        return res.status(401).json({ error: 'Please sign in to verify your email' });
      }

      const { token } = req.body;
      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Token is required' });
      }

      // Verify token
      const payload = verifyTokenWithSecret(token);
      if (!payload) {
        return res.status(400).json({ error: 'Invalid or expired verification link' });
      }

      // Check that logged-in user matches the token
      if (payload.userId !== session.user.id) {
        return res.status(403).json({
          error: 'Please sign in with the account that requested this verification'
        });
      }

      // Double-check email isn't taken (race condition protection)
      const existingUser = db.prepare('SELECT id FROM user WHERE LOWER(email) = ?').get(payload.email.toLowerCase()) as any;
      if (existingUser) {
        return res.status(400).json({ error: 'This email is no longer available' });
      }

      const existingVerified = db.prepare('SELECT id FROM verified_email WHERE LOWER(email) = ?').get(payload.email.toLowerCase()) as any;
      if (existingVerified) {
        return res.status(400).json({ error: 'This email is no longer available' });
      }

      // Create verified email entry
      const id = randomBytes(16).toString('hex');
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO verified_email (id, user_id, email, verified_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, session.user.id, payload.email, now, now);

      console.log(`[verified-emails] User ${session.user.email} verified additional email: ${payload.email}`);

      res.json({ success: true, email: payload.email });
    } catch (error) {
      console.error('[verified-emails] Error confirming verification:', error);
      res.status(500).json({ error: 'Failed to verify email' });
    }
  });

  // List verified emails for current user
  app.get('/api/verified-emails', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
      if (!session?.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const emails = db.prepare(`
        SELECT id, email, verified_at FROM verified_email WHERE user_id = ? ORDER BY created_at ASC
      `).all(session.user.id) as any[];

      res.json({
        emails: emails.map(e => ({
          id: e.id,
          email: e.email,
          verifiedAt: new Date(e.verified_at * 1000).toISOString(),
        }))
      });
    } catch (error) {
      console.error('[verified-emails] Error listing emails:', error);
      res.status(500).json({ error: 'Failed to get verified emails' });
    }
  });

  // Delete a verified email
  app.delete('/api/verified-emails/:id', async (req, res) => {
    try {
      const session = await auth.api.getSession({ headers: req.headers as Record<string, string> });
      if (!session?.user) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const { id } = req.params;

      // Verify ownership
      const email = db.prepare(`
        SELECT * FROM verified_email WHERE id = ? AND user_id = ?
      `).get(id, session.user.id) as any;

      if (!email) {
        return res.status(404).json({ error: 'Email not found' });
      }

      db.prepare('DELETE FROM verified_email WHERE id = ?').run(id);

      console.log(`[verified-emails] User ${session.user.email} removed verified email: ${email.email}`);

      res.json({ success: true });
    } catch (error) {
      console.error('[verified-emails] Error deleting email:', error);
      res.status(500).json({ error: 'Failed to remove email' });
    }
  });
}
