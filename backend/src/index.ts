import { toNodeHandler } from 'better-auth/node';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { auth } from './auth.js';

dotenv.config();

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

// BetterAuth handler - MUST come before express.json()
app.all('/api/auth/*', toNodeHandler(auth));

// Parse JSON bodies (AFTER Better Auth handler)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🔐 BetterAuth server running on port ${PORT}`);
  console.log(`📡 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});
