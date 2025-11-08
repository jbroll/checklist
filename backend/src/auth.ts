import { betterAuth } from 'better-auth';
import { jazzPlugin } from 'jazz-tools/better-auth/auth/server';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';

dotenv.config();

// Create SQLite database instance
const sqliteDb = new Database('./auth.db');

// Create BetterAuth instance with SQLite
export const auth = betterAuth({
  // Use better-sqlite3 directly (recommended pattern)
  database: sqliteDb,

  // Base URL for OAuth callbacks - must match frontend URL for same-origin cookies
  baseURL: process.env.BASE_URL || 'http://localhost:5173',

  // Trust the frontend origin
  trustedOrigins: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
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
    // Use secure cookies (false for localhost HTTP)
    useSecureCookies: false,
    // Disable CSRF check for development
    disableCSRFCheck: true,
    // Configure cookie attributes for OAuth redirects
    defaultCookieAttributes: {
      sameSite: "lax", // Lax for development (None requires HTTPS)
      httpOnly: true,
      secure: false,
    },
  },

  // Jazz plugin to store Jazz account keys with users
  plugins: [
    jazzPlugin()
  ],

  // OAuth providers
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  // Secret for signing tokens
  secret: process.env.BETTER_AUTH_SECRET!,
});
