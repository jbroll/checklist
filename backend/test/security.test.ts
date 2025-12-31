/**
 * Backend Security Tests
 *
 * Tests for security-related middleware and functionality.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';

// Create a minimal test app with CSRF middleware
function createTestApp(): Express {
  const app = express();

  // CSRF protection middleware (copy from index.ts)
  app.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      // Skip CSRF check for auth routes
      if (req.url.startsWith('/api/auth')) {
        return next();
      }
      // Skip CSRF check for Stripe webhook
      if (req.url === '/api/webhooks/stripe') {
        return next();
      }
      // Require X-Requested-With header
      if (!req.headers['x-requested-with']) {
        return res.status(403).json({ error: 'forbidden', message: 'Missing required header' });
      }
    }
    next();
  });

  app.use(express.json());

  // Test endpoints
  app.get('/api/test', (req, res) => res.json({ ok: true }));
  app.post('/api/test', (req, res) => res.json({ ok: true }));
  app.put('/api/test', (req, res) => res.json({ ok: true }));
  app.delete('/api/test', (req, res) => res.json({ ok: true }));
  app.patch('/api/test', (req, res) => res.json({ ok: true }));

  // Auth routes (should bypass CSRF)
  app.post('/api/auth/login', (req, res) => res.json({ ok: true }));

  // Webhook routes (should bypass CSRF)
  app.post('/api/webhooks/stripe', (req, res) => res.json({ ok: true }));

  return app;
}

describe('CSRF Protection Middleware', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('GET requests', () => {
    it('should allow GET requests without X-Requested-With header', async () => {
      const response = await request(app).get('/api/test');
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });
  });

  describe('POST requests', () => {
    it('should reject POST without X-Requested-With header', async () => {
      const response = await request(app)
        .post('/api/test')
        .send({ data: 'test' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('forbidden');
    });

    it('should allow POST with X-Requested-With header', async () => {
      const response = await request(app)
        .post('/api/test')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ data: 'test' });

      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });
  });

  describe('PUT requests', () => {
    it('should reject PUT without X-Requested-With header', async () => {
      const response = await request(app)
        .put('/api/test')
        .send({ data: 'test' });

      expect(response.status).toBe(403);
    });

    it('should allow PUT with X-Requested-With header', async () => {
      const response = await request(app)
        .put('/api/test')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ data: 'test' });

      expect(response.status).toBe(200);
    });
  });

  describe('DELETE requests', () => {
    it('should reject DELETE without X-Requested-With header', async () => {
      const response = await request(app).delete('/api/test');
      expect(response.status).toBe(403);
    });

    it('should allow DELETE with X-Requested-With header', async () => {
      const response = await request(app)
        .delete('/api/test')
        .set('X-Requested-With', 'XMLHttpRequest');

      expect(response.status).toBe(200);
    });
  });

  describe('PATCH requests', () => {
    it('should reject PATCH without X-Requested-With header', async () => {
      const response = await request(app)
        .patch('/api/test')
        .send({ data: 'test' });

      expect(response.status).toBe(403);
    });

    it('should allow PATCH with X-Requested-With header', async () => {
      const response = await request(app)
        .patch('/api/test')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ data: 'test' });

      expect(response.status).toBe(200);
    });
  });

  describe('Bypass routes', () => {
    it('should bypass CSRF for /api/auth routes', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@example.com' });

      expect(response.status).toBe(200);
    });

    it('should bypass CSRF for Stripe webhook', async () => {
      const response = await request(app)
        .post('/api/webhooks/stripe')
        .send({ type: 'test' });

      expect(response.status).toBe(200);
    });
  });
});
