import path from 'node:path';
import type { Server } from 'node:http';
import dotenv from 'dotenv';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import Database from 'better-sqlite3';
import nodemailer from 'nodemailer';
import {
  createIdentity,
  type Identity,
  type EmailAuthConfig,
  type OAuthProviderConfig,
  type SendEmail,
} from '@jbroll/rowboat-auth-betterauth';
import { mountShareRoutes, registerShareTables, remoteGroupBackend } from '@jbroll/rowboat-sharing';

// Root .env first (shared config), then backend .env — mirrors the pre-port load order.
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface ServerConfig {
  port: number;
  dbPath: string;
  frontendUrl: string;
  baseUrl: string;
  authSecret: string;
  appName: string;
  trustedOrigins: string[];
  providers: OAuthProviderConfig[];
  /** The provisioned rowboat `databaseId` — the audience every data-plane JWT is bound to. */
  rowboatDatabaseId: string;
  /** Origin of the hosted rowboat that serves this tenant's data plane and group API. */
  rowboatUrl: string;
  /** The standing principal that performs invite grants when the inviter is offline. */
  rowboatAgentId: string;
  emailAuth: EmailAuthConfig;
  smtp?: SmtpConfig;
}

// Builds a nodemailer-backed SendEmail port when SMTP is configured; undefined otherwise. Mirrors
// the pre-port behaviour (jbr-jazz hierarchy-backend's lib/email.ts): email capability — including
// better-auth's own email-verification send — is gated on SMTP being present, not faked with a
// console.log stand-in that would silently pretend mail was sent.
function buildSendEmail(smtp: SmtpConfig | undefined): SendEmail | undefined {
  if (!smtp) return undefined;
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user && smtp.pass ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
  });
  return async (to: string, subject: string, body: string) => {
    await transporter.sendMail({ from: smtp.from, to, subject, text: body });
  };
}

// Minimal allow-list CORS middleware — replaces the `cors` package with the same trusted-origin
// behaviour the pre-port config carried, without pulling in an extra dependency.
function corsMiddleware(trustedOrigins: string[]) {
  const allowed = new Set(trustedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        req.headers['access-control-request-headers'] ?? 'Content-Type,Authorization',
      );
      res.status(204).end();
      return;
    }
    next();
  };
}

export interface RowboatServer {
  app: Express;
  db: Database.Database;
  signJWT: Identity['signJWT'];
  start(): Server;
}

// Stands up the express app on ONE better-sqlite3 db: auth (RBAC groups) + identity (better-auth
// via rowboat-auth-betterauth) + sharing (invite/accept) + account routes. Sync, RBAC enforcement
// and the folder-scope-group mint live in hosted rowboat now — the browser carries a data-plane
// JWT straight there (see src/lib/rowboat.tsx). Replaces createHierarchyServer (Jazz cloud +
// agent) — no Jazz, no billing/Stripe wiring (out of slice-1; see docs/superpowers/d-t3-report.md).
export async function createServer(config: ServerConfig): Promise<RowboatServer> {
  const db = new Database(config.dbPath);

  // No registerAuthTables: the RBAC group tables live in hosted rowboat now. share_invites and
  // account_merge (identity state) stay local, created by registerShareTables / registerIdentityTables.
  registerShareTables(db);

  const sendEmail = buildSendEmail(config.smtp);
  const identity = createIdentity({
    db,
    authSecret: config.authSecret,
    baseUrl: `${config.baseUrl}/api/auth`,
    // Short-lived per-user tokens for the hosted-rowboat data plane. iss/aud must match what
    // `npm run provision:*` registered for this database, or every sync 401s with no other symptom.
    jwt: {
      issuer: `${config.baseUrl}/api/auth`,
      audience: config.rowboatDatabaseId,
      expirationTime: '15m',
    },
    // Root groups are provisioned lazily by hosted rowboat on a user's first verified sync — this
    // backend has no group tables, so the local user.create.after provisioning hook must not run.
    provisionRootGroup: false,
    providers: config.providers,
    emailAuth: config.emailAuth,
    sendEmail,
    // Gated on SMTP exactly like sendEmail itself — an unconfigured mail transport must not
    // silently disable the verification requirement (that would be a fallback); it simply means
    // the emailVerification block isn't wired, matching the pre-port design 1:1.
    sendVerificationEmail: sendEmail
      ? async ({ user, url }) => {
          await sendEmail(
            user.email,
            `Verify your ${config.appName} email`,
            `Hi${user.name ? ` ${user.name}` : ''},\n\nVerify your email: ${url}`,
          );
        }
      : undefined,
  });
  await identity.registerIdentityTables();

  const app = express();
  app.set('trust proxy', true);
  app.use(corsMiddleware(config.trustedOrigins));

  // One backend for BOTH sharing and account-merge: group reads/writes go to hosted rowboat,
  // authenticated AS THE ACTING USER — so rowboat's own requireAdmin decides every grant/link,
  // exactly as it does for the browser. The agent is just another actor: invite-create installs it
  // as admin (authorized by the inviter's real admin), and accept grants as the agent because the
  // inviter may be long gone by then.
  const groupBackend = remoteGroupBackend({
    baseUrl: `${config.rowboatUrl}/db/${config.rowboatDatabaseId}/api/sync`,
    token: (actor) => identity.signJWT(actor),
  });

  // better-auth reads the raw request body — must mount before express.json(). mountAuthRoutes also
  // mounts the account delete + merge routes; merge's group link/grant ride this same groupBackend.
  identity.mountAuthRoutes(app, { groupBackend });

  app.use(express.json());

  const provider = identity.provider;
  mountShareRoutes(app, db, {
    provider,
    sendEmail,
    groupBackend,
    agent: config.rowboatAgentId,
    shareUrl: (token) => `${config.frontendUrl}/invite/${token}`,
  });

  return {
    app,
    db,
    signJWT: identity.signJWT,
    start: () =>
      app.listen(config.port, () => {
        console.log(`[server] listening on :${config.port}`);
      }),
  };
}

function configFromEnv(): ServerConfig {
  const isProd = process.env.NODE_ENV === 'production';
  // Explicit, named test-only switch (never a silent default): with no SMTP configured, the
  // pre-port design already requires an admin/manual verification path in prod (see
  // buildSendEmail above), so e2e cannot go through real email delivery. CHECKLIST_TEST_AUTH=1
  // is the one narrow escape hatch — it disables the verification REQUIREMENT (not the feature)
  // so Playwright can sign up + immediately use an email/password account. Unset in prod/dev,
  // verification stays on exactly as before.
  const isTestAuth = process.env.CHECKLIST_TEST_AUTH === '1';
  const dbPath = process.env.AUTH_DB_PATH || (isProd ? './data/auth.db' : './auth.db');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const providers: OAuthProviderConfig[] = [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          {
            name: 'google',
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            scopes: ['openid', 'email'],
            options: { prompt: 'select_account', disableDefaultScopes: true },
          },
        ]
      : []),
    ...(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ? [
          {
            name: 'apple',
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: process.env.APPLE_CLIENT_SECRET,
            scopes: ['name', 'email'],
          },
        ]
      : []),
  ];

  // No default: an unset id would mint tokens with an audience rowboat rejects, surfacing only as
  // a blanket 401 on every sync. Fail at boot instead. Lives here, not in createServer, so tests
  // that build their own ServerConfig stay independent of the process environment.
  const rowboatDatabaseId = process.env.ROWBOAT_DATABASE_ID;
  if (!rowboatDatabaseId) {
    throw new Error('ROWBOAT_DATABASE_ID is required (see rowboat-tenant.<env>.json)');
  }

  const rowboatUrl = process.env.ROWBOAT_URL;
  if (!rowboatUrl) {
    throw new Error(
      'ROWBOAT_URL is required (the hosted rowboat origin, e.g. http://localhost:3020)',
    );
  }

  return {
    port: Number(process.env.PORT) || 3001,
    dbPath,
    frontendUrl,
    baseUrl: frontendUrl,
    authSecret: process.env.BETTER_AUTH_SECRET || 'dev-secret-change-me',
    appName: 'CheckList',
    trustedOrigins: [
      'http://localhost:8765',
      'http://localhost:8766',
      'http://localhost:5173',
      'https://checklist-app.rkroll.com',
      'https://appleid.apple.com',
      ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
    ],
    providers,
    rowboatDatabaseId,
    rowboatUrl,
    // A colon cannot occur in a better-auth user id, so this can never collide with a real account.
    rowboatAgentId: process.env.ROWBOAT_AGENT_ID || 'agent:checklist',
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
      requireEmailVerification: !isTestAuth,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
  };
}

// Only run as the process entrypoint (`node dist/index.js` / `tsx watch src/index.ts`) — importing
// this module (e.g. from host.test.ts, to call createServer with a test config) must not also open
// the production db or bind the production port.
const isMainModule =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const server = await createServer(configFromEnv());
  server.start();
}
