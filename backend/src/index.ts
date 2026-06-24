// WebSocket polyfill for Node.js < 21 (Jazz requires WebSocket API)
import { WebSocket } from 'ws';
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error - Polyfilling WebSocket for Node < 21
  globalThis.WebSocket = WebSocket;
}

import path from 'node:path';
import dotenv from 'dotenv';
import type { BackendConfig } from '@jbr-jazz/hierarchy-shared';
import { createHierarchyServer } from '@jbr-jazz/hierarchy-backend';
import { setupLimitCheckRoute } from '@jbr-jazz/billing-backend';
import { initBillingDb } from './db.js';
import { ensureAuthTables } from './migrate-auth.js';
import { setupBillingRoutes, setupStripeWebhook } from './billing/routes.js';

// Root .env first (shared config like JAZZ_API_KEY), then backend .env
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();
if (process.env.VITE_JAZZ_API_KEY && !process.env.JAZZ_API_KEY) {
  process.env.JAZZ_API_KEY = process.env.VITE_JAZZ_API_KEY;
}

const isProd = process.env.NODE_ENV === 'production';
const dbPath = process.env.AUTH_DB_PATH || (isProd ? './data/auth.db' : './auth.db');
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

const config: BackendConfig = {
  port: Number(process.env.PORT) || 3001,
  frontendUrl,
  baseUrl: frontendUrl,
  dbPath,
  authSecret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-me',
  appName: 'CheckList',
  jazzApiKey: process.env.JAZZ_API_KEY,
  jazzAgentAccountId: process.env.JAZZ_AGENT_ACCOUNT_ID,
  jazzAgentSecret: process.env.JAZZ_AGENT_SECRET,
  trustedOrigins: [
    'http://localhost:8765',
    'http://localhost:8766',
    'http://localhost:5173',
    'https://checklist-app.rkroll.com',
    'https://appleid.apple.com',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [{
          name: 'google',
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          scopes: ['openid', 'email'],
          options: { prompt: 'select_account', disableDefaultScopes: true },
        }]
      : []),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? [{
          name: 'apple',
          clientId: process.env.APPLE_CLIENT_ID,
          clientSecret: process.env.APPLE_CLIENT_SECRET,
          scopes: ['name', 'email'],
        }]
      : []),
  ],
  smtp: process.env.SMTP_HOST
    ? {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASS || '',
        from: process.env.EMAIL_FROM || 'CheckList <invite@checklist.rkroll.com>',
      }
    : undefined,
  emailAuth: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  accountLinking: { enabled: true, trustedProviders: ['google', 'apple'] },
  // Stripe webhook needs the raw body before express.json() (registered via this hook).
  registerRawRoutes: (app, db) => {
    setupStripeWebhook(app, db);
  },
  // Account deletion is mounted by createHierarchyServer; this cleans checklist's
  // billing tables inside the same deletion transaction.
  accountDeletionCleanup: (db, userId, _email) => {
    db.prepare('DELETE FROM usage_snapshot WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_subscription WHERE user_id = ?').run(userId);
  },
};

const server = createHierarchyServer(config);
server.app.set('trust proxy', true);

// Ensure BetterAuth tables exist before any request is served. The Jazz backend
// does not create them, and the systemd unit launches dist/index.js directly
// (bypassing the migrate-auth CLI) and is regenerated on each deploy, so this
// must run here. Idempotent.
ensureAuthTables(server.db);

// Checklist-specific billing tables + Stripe price sync.
initBillingDb(server.db);

// Billing routes (JSON body already mounted by the package).
setupBillingRoutes(server.app, server.db, server.auth);
setupLimitCheckRoute(server.app, server.db, server.auth, {
  getUsage: (db, userId, _tier, _status) => {
    const result = db
      .prepare('SELECT item_count FROM usage_snapshot WHERE user_id = ? ORDER BY recorded_at DESC LIMIT 1')
      .get(userId) as { item_count: number } | undefined;
    return { currentCount: result?.item_count ?? 0, resourceName: 'lists' };
  },
  formatMessage: (response) => {
    if (response.status === 'beta') return `Beta: ${response.currentCount} of ${response.maxAllowed} lists (Plus tier limits during beta)`;
    if (response.atLimit) return `You've reached your limit of ${response.maxAllowed} lists. Upgrade your plan to create more.`;
    if (response.approachingLimit) return `${response.remaining} lists remaining. Consider upgrading for more.`;
    if (response.maxAllowed === -1) return `${response.currentCount} lists (unlimited)`;
    return `${response.currentCount} of ${response.maxAllowed} lists`;
  },
});

server.start();
