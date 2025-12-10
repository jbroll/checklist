// WebSocket polyfill for Node.js < 21 (Jazz requires WebSocket API)
import { WebSocket } from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error - Polyfilling WebSocket for Node < 21
  globalThis.WebSocket = WebSocket;
}

import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { auth, sqliteDb } from './auth.js';
import { initDb } from './db.js';
import { initAgent } from './agent.js';
import { setupSharingRoutes } from './shares.js';
import { setupVerifiedEmailRoutes } from './verified-emails.js';
import { setupBillingRoutes, setupStripeWebhook } from './billing/routes.js';

// Load environment variables from both root .env and backend .env
// Root .env first (shared config like JAZZ_API_KEY)
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
// Backend .env second (backend-specific overrides)
dotenv.config();

// Alias VITE_JAZZ_API_KEY to JAZZ_API_KEY for backend use
if (process.env.VITE_JAZZ_API_KEY && !process.env.JAZZ_API_KEY) {
  process.env.JAZZ_API_KEY = process.env.VITE_JAZZ_API_KEY;
}

// Initialize database - ensure BetterAuth tables exist first
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// BetterAuth will auto-create tables on first request
// No manual table creation needed - BetterAuth handles migrations
console.log('[startup] BetterAuth will auto-create tables on first use');

// Initialize sharing tables
initDb(sqliteDb);

// Initialize agent asynchronously in the background (non-blocking)
// Agent is optional - server will work without it, sharing features will be disabled
initAgent().catch((error) => {
  console.error('Failed to start Jazz agent:', error);
  console.log('Server will continue running, but sharing features will be unavailable');
});

// Express server
const app = express();

// Security headers (helmet.js)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: [
          "'self'",
          'wss://cloud.jazz.tools',
          'https://cloud.jazz.tools',
          process.env.FRONTEND_URL || 'http://localhost:5173',
        ].filter(Boolean) as string[],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'data:'],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    crossOriginEmbedderPolicy: false, // Required for some OAuth flows
  }),
);

// CORS configuration (MUST come before Better Auth handler)
// Allow multiple localhost ports for development + production domains
const allowedOrigins = [
  'http://localhost:8765',
  'http://localhost:8766',
  'http://localhost:5173',
  'https://app.kjekit.com',
  'https://kjekit.com',
  process.env.FRONTEND_URL,
  'https://appleid.apple.com',  // Apple OAuth callback
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests without origin header (mobile apps, server-to-server, curl)
      if (!origin) {
        return callback(null, true);
      }

      // Use exact match instead of startsWith to prevent subdomain attacks
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`[CORS] Rejected origin: ${origin}`);
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }),
);

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// BetterAuth handler - MUST come before express.json()
app.use('/api/auth', toNodeHandler(auth));

// Stripe webhook - MUST come before express.json() for raw body access
setupStripeWebhook(app, sqliteDb);

// Parse JSON bodies (AFTER Better Auth handler and Stripe webhook)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sharing routes
setupSharingRoutes(app, sqliteDb);

// Verified emails routes
setupVerifiedEmailRoutes(app, sqliteDb);

// Billing routes
setupBillingRoutes(app, sqliteDb, auth);

// Account deletion endpoint
// Deletes the user's BetterAuth account and all associated data
// Jazz data becomes inaccessible since account keys are deleted with the user
app.delete('/api/account', async (req, res) => {
  try {
    // Get session from BetterAuth
    const session = await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    });

    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    console.log(`[account-deletion] Deleting account for user ${userId} (${userEmail})`);

    // Delete any share invites sent by or to this user
    sqliteDb.prepare('DELETE FROM share_invites WHERE sender_email = ? OR recipient_email = ?').run(userEmail, userEmail);

    // Delete verified emails (should cascade, but be explicit)
    sqliteDb.prepare('DELETE FROM verified_email WHERE user_id = ?').run(userId);

    // Delete subscription and usage data (should cascade, but be explicit)
    sqliteDb.prepare('DELETE FROM usage_snapshot WHERE user_id = ?').run(userId);
    sqliteDb.prepare('DELETE FROM user_subscription WHERE user_id = ?').run(userId);

    // Delete the user - this cascades to sessions and OAuth accounts
    // The Jazz account keys (stored in user.accountID) are also deleted,
    // making the user's Jazz data inaccessible
    sqliteDb.prepare('DELETE FROM user WHERE id = ?').run(userId);

    console.log(`[account-deletion] Successfully deleted account for user ${userId}`);

    res.json({ success: true, message: 'Account deleted successfully' });
  } catch (error) {
    console.error('[account-deletion] Error deleting account:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🔐 BetterAuth server running on port ${PORT}`);
  console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});
