import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { auth, sqliteDb } from './auth.js';
import { initDb } from './db.js';
import { initAgent } from './agent.js';
import { setupSharingRoutes } from './shares.js';

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

// CORS configuration (MUST come before Better Auth handler)
// Allow multiple localhost ports for development
const allowedOrigins = [
  'http://localhost:8765',
  'http://localhost:8766',
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.some(allowed => origin.startsWith(allowed as string))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
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

  if (req.url.includes('/auth/')) {
    console.log('  Auth request details:', {
      url: req.url,
      method: req.method,
      cookie: req.headers.cookie || '(none)',
      origin: req.headers.origin,
      referer: req.headers.referer,
      'x-jazz-auth': req.headers['x-jazz-auth'] || '(none)',
      query: req.query,
    });
  }

  // Log response for all auth endpoints
  const originalSend = res.send;
  res.send = function(data) {
    if (req.url.includes('/auth/')) {
      console.log(`  Auth response for ${req.url}:`, {
        statusCode: res.statusCode,
        headers: res.getHeaders(),
        bodyPreview: typeof data === 'string' ? data.substring(0, 200) : '(binary data)',
      });
    }
    return originalSend.call(this, data);
  };

  next();
});

// BetterAuth handler - MUST come before express.json()
app.use('/api/auth', toNodeHandler(auth));

// Parse JSON bodies (AFTER Better Auth handler)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Sharing routes
setupSharingRoutes(app, sqliteDb);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🔐 BetterAuth server running on port ${PORT}`);
  console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});
