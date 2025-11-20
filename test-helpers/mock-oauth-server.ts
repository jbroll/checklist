/**
 * Mock OAuth Server for Testing
 *
 * This creates a simple OAuth server on localhost that mimics Google OAuth flow
 * without requiring real credentials or internet connectivity.
 *
 * Usage:
 *   const server = new MockOAuthServer(9999);
 *   await server.start();
 *   // Run tests
 *   await server.stop();
 */

import express from 'express';
import { type Server } from 'http';

export interface MockOAuthConfig {
  port?: number;
  baseURL?: string;
  users?: MockUser[];
}

export interface MockUser {
  email: string;
  name: string;
  id: string;
}

export class MockOAuthServer {
  private app: express.Application;
  private server: Server | null = null;
  private port: number;
  private baseURL: string;
  private users: MockUser[];
  private sessions: Map<string, MockUser> = new Map();

  constructor(config: MockOAuthConfig = {}) {
    this.port = config.port || 9999;
    this.baseURL = config.baseURL || 'http://localhost:5173';
    this.users = config.users || [
      {
        id: 'test-user-1',
        email: 'test@example.com',
        name: 'Test User',
      },
      {
        id: 'test-user-2',
        email: 'test2@example.com',
        name: 'Test User 2',
      },
    ];

    this.app = express();
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.setupRoutes();
  }

  private setupRoutes() {
    // OAuth authorization endpoint (Google-like)
    this.app.get('/oauth/authorize', (req, res) => {
      const { redirect_uri, state, client_id } = req.query;

      console.log('[MockOAuth] Authorization request:', { redirect_uri, state, client_id });

      // Auto-approve for testing (use first user)
      const user = this.users[0];
      const code = this.generateAuthCode(user);

      // Redirect back to app with authorization code
      const redirectUrl = `${redirect_uri}?code=${code}&state=${state}`;
      console.log('[MockOAuth] Redirecting to:', redirectUrl);

      res.redirect(redirectUrl);
    });

    // OAuth token endpoint
    this.app.post('/oauth/token', (req, res) => {
      const { code, grant_type } = req.body;

      console.log('[MockOAuth] Token request:', { code, grant_type });

      if (grant_type !== 'authorization_code') {
        return res.status(400).json({ error: 'unsupported_grant_type' });
      }

      // Decode the auth code to get user info
      const user = this.getUserFromCode(code);

      if (!user) {
        return res.status(400).json({ error: 'invalid_grant' });
      }

      // Generate tokens
      const accessToken = this.generateToken(user);
      const sessionId = this.generateSessionId();

      // Store session
      this.sessions.set(sessionId, user);

      console.log('[MockOAuth] Issued tokens for:', user.email);

      res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        scope: 'openid profile email',
        id_token: this.generateIdToken(user),
      });
    });

    // OAuth userinfo endpoint
    this.app.get('/oauth/userinfo', (req, res) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'unauthorized' });
      }

      const token = authHeader.substring(7);
      const user = this.getUserFromToken(token);

      if (!user) {
        return res.status(401).json({ error: 'invalid_token' });
      }

      console.log('[MockOAuth] Userinfo request for:', user.email);

      res.json({
        sub: user.id,
        email: user.email,
        email_verified: true,
        name: user.name,
        picture: 'https://via.placeholder.com/150',
      });
    });

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'mock-oauth-server' });
    });
  }

  private generateAuthCode(user: MockUser): string {
    // Simple encoding: base64(userId:timestamp)
    const data = `${user.id}:${Date.now()}`;
    return Buffer.from(data).toString('base64');
  }

  private getUserFromCode(code: string): MockUser | null {
    try {
      const decoded = Buffer.from(code, 'base64').toString('utf-8');
      const [userId] = decoded.split(':');
      return this.users.find((u) => u.id === userId) || null;
    } catch {
      return null;
    }
  }

  private generateToken(user: MockUser): string {
    // Simple token: base64(userId:email)
    const data = `${user.id}:${user.email}`;
    return Buffer.from(data).toString('base64');
  }

  private getUserFromToken(token: string): MockUser | null {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [userId] = decoded.split(':');
      return this.users.find((u) => u.id === userId) || null;
    } catch {
      return null;
    }
  }

  private generateIdToken(user: MockUser): string {
    // Simplified JWT-like structure (not a real JWT for simplicity)
    const header = { alg: 'none', typ: 'JWT' };
    const payload = {
      sub: user.id,
      email: user.email,
      email_verified: true,
      name: user.name,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

    return `${headerB64}.${payloadB64}.mock-signature`;
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.log(`\n🔐 Mock OAuth Server running on http://localhost:${this.port}`);
          console.log(`   Users available for testing:`);
          this.users.forEach((user) => {
            console.log(`   - ${user.email} (${user.name})`);
          });
          console.log('');
          resolve();
        });

        this.server.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Mock OAuth Server stopped');
          resolve();
        }
      });
    });
  }

  getPort(): number {
    return this.port;
  }

  getUsers(): MockUser[] {
    return [...this.users];
  }

  addUser(user: MockUser): void {
    this.users.push(user);
  }

  getSessions(): Map<string, MockUser> {
    return new Map(this.sessions);
  }
}

// Standalone usage (ES module compatible)
// This block is commented out since we use the dedicated script
// If you want to run this file directly, use: tsx test-helpers/mock-oauth-server.ts
