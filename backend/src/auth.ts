import { betterAuth } from 'better-auth';
import { jazzPlugin } from 'jazz-tools/better-auth/auth/server';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import nodemailer from 'nodemailer';

dotenv.config();

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
      from: process.env.EMAIL_FROM || 'Kjekit <invite@kjekit.com>',
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
    ? './data/auth.db'  // Production: /var/lib/bubblelist-api/data/auth.db
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

// Create BetterAuth instance with SQLite
export const auth = betterAuth({
  // Use better-sqlite3 directly (recommended pattern)
  database: sqliteDb,

  // Base URL for OAuth callbacks - must be the full path to the auth API
  // This tells BetterAuth where OAuth providers should redirect back to
  baseURL: process.env.BASE_URL ? `${process.env.BASE_URL}/api/auth` : 'http://localhost:5173/api/auth',

  // Trust the frontend origin and Apple's domain for Sign In with Apple
  trustedOrigins: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    "https://appleid.apple.com",
  ],

  // Session configuration
  session: {
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
    // Configure cookie attributes for OAuth redirects
    // Note: Apple OAuth uses POST callbacks which require sameSite: "none"
    // See: https://github.com/better-auth/better-auth/issues/5227
    defaultCookieAttributes: {
      // Must use 'none' for Apple OAuth (POST-based callbacks don't receive 'lax' cookies)
      sameSite: "none",
      httpOnly: true,
      // secure: true is required when sameSite is "none"
      secure: true,
      path: "/",
    },
  },

  // Email verification for resending verification emails
  emailVerification: {
    // Don't auto-sign in - user must sign in manually after verification
    autoSignInAfterVerification: false,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
      await sendEmail(
        user.email,
        'Verify your Kjekit email',
        `Hi${user.name ? ` ${user.name}` : ''},

Click to verify your email: ${url}

This link expires in 24 hours.

- Kjekit`
      );
    },
  },

  // Email/Password authentication
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    sendVerificationEmail: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
      await sendEmail(
        user.email,
        'Verify your Kjekit email',
        `Hi${user.name ? ` ${user.name}` : ''},

Click to verify your email: ${url}

This link expires in 24 hours.

- Kjekit`
      );
    },
    sendResetPassword: async ({ user, url }: { user: { email: string; name?: string | null }; url: string }) => {
      await sendEmail(
        user.email,
        'Reset your Kjekit password',
        `Hi${user.name ? ` ${user.name}` : ''},

Click to reset your password: ${url}

This link expires in 1 hour.
If you didn't request this, you can ignore this email.

- Kjekit`
      );
    },
  },

  // Account linking - auto-link when same email used across providers
  accountLinking: {
    enabled: true,
    trustedProviders: ["google", "apple"],
  },

  // Jazz plugin to store Jazz account keys with users
  plugins: [
    jazzPlugin()
  ],

  // OAuth providers
  // Privacy: Only request email scope, not profile (name/image)
  // This way user's name and profile photo never hit our servers
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      prompt: "select_account",
      // Only request email, not profile data (name/image)
      scope: ["openid", "email"],
      disableDefaultScopes: true,
    },
    apple: {
      clientId: process.env.APPLE_CLIENT_ID!,
      clientSecret: process.env.APPLE_CLIENT_SECRET!,
    },
  },

  // Secret for signing tokens
  secret: process.env.BETTER_AUTH_SECRET!,
});
