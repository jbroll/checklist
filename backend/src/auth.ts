import { betterAuth } from 'better-auth';
import { jazzPlugin } from 'jazz-tools/better-auth/auth/server';
import dotenv from 'dotenv';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

dotenv.config();

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
    // Use secure cookies in production (HTTPS), disable for local development (HTTP)
    useSecureCookies: process.env.NODE_ENV === 'production',
    // Disable CSRF check for development only
    disableCSRFCheck: process.env.NODE_ENV !== 'production',
    // Configure cookie attributes for OAuth redirects
    defaultCookieAttributes: {
      // Use 'lax' for both dev and production (frontend/backend on same origin via proxy)
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: "/",
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
      prompt: "select_account",
    },
  },

  // Secret for signing tokens
  secret: process.env.BETTER_AUTH_SECRET!,
});
