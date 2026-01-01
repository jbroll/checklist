import { betterAuth } from 'better-auth';
import { jazzPlugin } from 'jazz-tools/better-auth/auth/server';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import nodemailer from 'nodemailer';

dotenv.config();

// =============================================================================
// Environment Variable Validation
// =============================================================================

const requiredEnvVars = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'APPLE_CLIENT_ID',
  'APPLE_CLIENT_SECRET',
  'BETTER_AUTH_SECRET',
] as const;

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// =============================================================================
// Email Templates
// =============================================================================

function verificationEmailBody(user: { name?: string | null }, url: string): string {
  return `Hi${user.name ? ` ${user.name}` : ''},

Click to verify your email: ${url}

This link expires in 24 hours.

- kjekit`;
}

function resetPasswordEmailBody(user: { name?: string | null }, url: string): string {
  return `Hi${user.name ? ` ${user.name}` : ''},

Click to reset your password: ${url}

This link expires in 1 hour.
If you didn't request this, you can ignore this email.

- kjekit`;
}

// Configure SMTP transporter for sending emails
const smtpTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.purelymail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Email sending helper
async function sendEmail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn('[Email] SMTP credentials not configured, skipping email send');
    return;
  }

  try {
    await smtpTransporter.sendMail({
      from: process.env.EMAIL_FROM || 'CheckList <invite@checklist.rkroll.com>',
      to,
      subject,
      text,
    });
  } catch (error) {
    console.error('[Email] Failed to send email:', error);
  }
}

// Create SQLite database instance
// Store in data directory to persist across deployments
// Use AUTH_DB_PATH environment variable if set, otherwise default to ./data/auth.db
const dbPath = process.env.AUTH_DB_PATH || (
  process.env.NODE_ENV === 'production'
    ? './data/auth.db'  // Production: /var/lib/checklist-api/data/auth.db
    : './auth.db'       // Development: ./auth.db
)

// Ensure directory exists
const dir = dirname(dbPath);
if (dir !== '.') {
  mkdirSync(dir, { recursive: true });
}

const sqliteDb = new Database(dbPath);

// Export database for sharing functionality
export { sqliteDb };

// Allowed origins for multi-domain OAuth
// Only include localhost origins in development
const allowedOrigins = [
  'https://checklist-app.rkroll.com',
  ...(process.env.NODE_ENV !== 'production' ? [
    'http://localhost:5173',
    'http://localhost:8765',
  ] : []),
];

// Shared auth configuration (everything except baseURL)
function createAuthConfig(baseURL: string) {
  return {
    database: sqliteDb,
    baseURL,

    // Trust all allowed origins plus Apple's domain
    trustedOrigins: [
      ...allowedOrigins,
      'https://appleid.apple.com',
    ],

    // Session configuration
    session: {
      // Session expires after 30 days of inactivity
      expiresIn: 30 * 24 * 60 * 60, // 30 days in seconds
      // Session must be refreshed within 7 days of last activity
      updateAge: 7 * 24 * 60 * 60, // 7 days in seconds
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60, // 5 minutes
      },
    },

    // Advanced configuration
    advanced: {
      // Use secure cookies in production (HTTPS), disable for local development (HTTP)
      useSecureCookies: process.env.NODE_ENV === 'production',
      // Disable CSRF check for development only
      disableCSRFCheck: process.env.NODE_ENV !== 'production',
      // Apple OAuth uses POST-based callbacks which require sameSite: "none"
      defaultCookieAttributes: {
        sameSite: 'none' as const,
        secure: true,
      },
    },

    // Email verification
    emailVerification: {
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
        await sendEmail(user.email, 'Verify your kjekit email', verificationEmailBody(user, url));
      },
    },

    // Email/Password authentication
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
        await sendEmail(user.email, 'Verify your kjekit email', verificationEmailBody(user, url));
      },
      sendResetPassword: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
        await sendEmail(user.email, 'Reset your kjekit password', resetPasswordEmailBody(user, url));
      },
    },

    // Account linking
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "apple"],
    },

    // Jazz plugin
    plugins: [
      jazzPlugin()
    ],

    // OAuth providers
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        prompt: "select_account" as const,
        scope: ["openid", "email"],
        disableDefaultScopes: true,
      },
      apple: {
        clientId: process.env.APPLE_CLIENT_ID!,
        clientSecret: process.env.APPLE_CLIENT_SECRET!,
      },
    },

    secret: process.env.BETTER_AUTH_SECRET!,
  };
}

// Cache of auth instances per origin
const authInstances = new Map<string, ReturnType<typeof betterAuth>>();

/**
 * Get BetterAuth instance for a specific origin.
 * Each origin gets its own instance with the correct baseURL for OAuth callbacks.
 */
export function getAuthForOrigin(origin: string): ReturnType<typeof betterAuth> {
  // Normalize origin
  const normalizedOrigin = origin.replace(/\/$/, '');

  if (!authInstances.has(normalizedOrigin)) {
    authInstances.set(normalizedOrigin, betterAuth(createAuthConfig(normalizedOrigin)));
  }

  return authInstances.get(normalizedOrigin)!;
}

/**
 * Extract origin from request headers.
 * Prefers X-Forwarded-Host (set by Apache proxy), falls back to Host header.
 * Handles comma-separated values in forwarded headers.
 */
export function getOriginFromRequest(headers: Record<string, string | string[] | undefined>): string {
  const forwardedHost = headers['x-forwarded-host'];
  let host: string | undefined;

  if (typeof forwardedHost === 'string') {
    // Handle comma-separated values from X-Forwarded-Host header
    host = forwardedHost.split(',')[0].trim();
  } else if (Array.isArray(forwardedHost)) {
    host = forwardedHost[0];
  } else {
    const hostHeader = headers['host'];
    host = typeof hostHeader === 'string' ? hostHeader : undefined;
  }

  // Default to http for local development, https for production
  const defaultProto = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const proto = headers['x-forwarded-proto'] || defaultProto;
  const protocol = typeof proto === 'string' ? proto.split(',')[0].trim() : defaultProto;

  return `${protocol}://${host}`;
}

// Default auth instance (for backwards compatibility with non-HTTP contexts)
export const auth = getAuthForOrigin('https://checklist-app.rkroll.com');
