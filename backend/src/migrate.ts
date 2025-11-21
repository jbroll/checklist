// Database migration script - creates BetterAuth tables
import { betterAuth } from 'better-auth';
import { jazzPlugin } from 'jazz-tools/better-auth/auth/server';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

dotenv.config();

const dbPath = process.env.AUTH_DB_PATH || (
  process.env.NODE_ENV === 'production'
    ? './data/auth.db'
    : './auth.db'
)

// Ensure directory exists
const dir = dirname(dbPath);
if (dir !== '.') {
  mkdirSync(dir, { recursive: true });
}

const db = new Database(dbPath);

console.log(`Initializing BetterAuth database at: ${dbPath}`);

// Initialize BetterAuth to trigger auto-migration
const auth = betterAuth({
  database: db,
  baseURL: process.env.BASE_URL || 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET || 'temp-secret-for-migration',
  plugins: [jazzPlugin()],
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || 'temp',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'temp',
    },
  },
});

console.log('BetterAuth initialized - database schema created');
console.log('Migration complete!');

process.exit(0);
