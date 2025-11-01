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

  // Base URL for OAuth callbacks
  baseURL: process.env.BASE_URL || 'http://localhost:3001',

  // Trust the frontend origin
  trustedOrigins: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
  ],

  // Advanced configuration for cross-origin auth
  advanced: {
    // Use secure cookies (false for localhost development)
    useSecureCookies: false,
  },

  // Jazz plugin to store Jazz account keys with users
  plugins: [
    jazzPlugin({
      peer: process.env.JAZZ_PEER || 'wss://cloud.jazz.tools',
    })
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
