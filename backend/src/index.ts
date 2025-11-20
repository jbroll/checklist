import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
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

// Initialize database and agent
initDb(sqliteDb);
initAgent();

// Express server
const app = express();

// CORS configuration (MUST come before Better Auth handler)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }),
);

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);

  if (req.url.includes('/auth/')) {
    console.log('  Headers:', {
      cookie: req.headers.cookie || '(none)',
      origin: req.headers.origin,
      referer: req.headers.referer,
      'x-jazz-auth': req.headers['x-jazz-auth'] || '(none)',
    });
  }

  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    if (req.url.includes('/auth/sign-out')) {
      console.log('  Sign-out response:', {
        statusCode: res.statusCode,
        headers: res.getHeaders(),
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
