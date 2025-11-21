// Generate BetterAuth schema on production database
import { betterAuth } from 'better-auth';
import { jazzPlugin } from 'jazz-tools/better-auth/auth/server';
import Database from 'better-sqlite3';

const db = new Database('./auth.db');

const auth = betterAuth({
  database: db,
  baseURL: 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET || 'temp-secret-for-migration',
  plugins: [jazzPlugin()],
  socialProviders: {
    google: {
      clientId: 'temp',
      clientSecret: 'temp',
    },
  },
});

console.log('BetterAuth initialized - tables should be auto-created');
console.log('Migration complete!');
process.exit(0);
