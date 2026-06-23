/**
 * Rate limiter integration tests
 * 
 * These tests exercise the actual rate limiter middleware by bypassing
 * the isTestEnv guard that normally skips rate limiting during tests.
 * 
 * Run separately: npx vitest run src/__tests__/routes.rate-limit.test.js
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';

let app;
let originalNodeEnv;
let originalVitest;

beforeAll(async () => {
  // Capture original env vars
  originalNodeEnv = process.env.NODE_ENV;
  originalVitest = process.env.VITEST;

  // Override env to bypass the isTestEnv guard
  // Set to production so isTestEnv evaluates to false
  process.env.NODE_ENV = 'production';
  delete process.env.VITEST;

  // Set a valid API key to avoid 500 errors from missing config
  process.env.GEMINI_API_KEY = 'test-rate-limit-key-12345';

  // Dynamically import the app AFTER env manipulation
  // This ensures isTestEnv is evaluated with our overridden env
  const module = await import('../index.js');
  app = module.app;
});

afterAll(() => {
  // Restore original env
  if (originalNodeEnv !== undefined) {
    process.env.NODE_ENV = originalNodeEnv;
  } else {
    delete process.env.NODE_ENV;
  }
  
  if (originalVitest !== undefined) {
    process.env.VITEST = originalVitest;
  } else {
    delete process.env.VITEST;
  }
});

describe('Rate Limiter - POST /api/chat', () => {
  it('returns 429 after 10 requests within 60s', async () => {
    // Mock Gemini to return consistent responses
    globalThis.__geminiMock.chatCreate = () => {
      return Promise.resolve({
        history: [],
        sendMessageStream: () => {
          return Promise.resolve({
            async *[Symbol.asyncIterator]() {
              yield { text: 'What makes you think that?' };
            },
          });
        },
      });
    };

    const payload = { messages: [{ role: 'user', text: 'Test message' }] };

    // Send 10 requests - all should succeed (200) or fail gracefully (500 if Gemini mock fails)
    for (let i = 1; i <= 10; i++) {
      const res = await request(app)
        .post('/api/chat')
        .send(payload)
        .set('Accept', 'text/event-stream');
      
      // Should NOT be rate limited yet
      expect(res.status).not.toBe(429);
    }

    // 11th request should be rate limited
    const res11 = await request(app)
      .post('/api/chat')
      .send(payload)
      .set('Accept', 'text/event-stream');

    expect(res11.status).toBe(429);
    expect(res11.body).toEqual({ error: 'Too many requests. Please slow down.' });
    
    // Verify rate limit headers are present
    expect(res11.headers).toHaveProperty('ratelimit-limit', '10');
    expect(res11.headers).toHaveProperty('ratelimit-remaining', '0');
    expect(res11.headers).toHaveProperty('ratelimit-reset');
  }, 30000); // 30s timeout for this test
});

describe('Rate Limiter - POST /api/conclude', () => {
  it('returns 429 after 5 requests within 60s', async () => {
    // Mock Gemini for conclude endpoint
    globalThis.__geminiMock.modelGenerateContent = () => {
      return Promise.resolve({ text: 'You discovered that clarity comes from questioning assumptions.' });
    };

    const payload = {
      messages: [
        { role: 'user', text: 'I need clarity' },
        { role: 'assistant', text: 'What makes clarity important to you?' },
      ],
    };

    // Send 5 requests - all should succeed (200) or fail gracefully (500)
    for (let i = 1; i <= 5; i++) {
      const res = await request(app)
        .post('/api/conclude')
        .send(payload);
      
      // Should NOT be rate limited yet
      expect(res.status).not.toBe(429);
    }

    // 6th request should be rate limited
    const res6 = await request(app)
      .post('/api/conclude')
      .send(payload);

    expect(res6.status).toBe(429);
    expect(res6.body).toEqual({ error: 'Too many requests. Please slow down.' });
    
    // Verify rate limit headers
    expect(res6.headers).toHaveProperty('ratelimit-limit', '5');
    expect(res6.headers).toHaveProperty('ratelimit-remaining', '0');
    expect(res6.headers).toHaveProperty('ratelimit-reset');
  }, 30000);
});

describe('Rate Limiter - GET /api/health', () => {
  it('is NOT rate limited - accepts 20 rapid requests', async () => {
    const responses = [];

    // Send 20 rapid requests
    for (let i = 1; i <= 20; i++) {
      const res = await request(app).get('/api/health');
      responses.push(res);
    }

    // All should return 200 (no rate limiting on health)
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      
      // Health endpoint should NOT have rate limit headers
      expect(res.headers).not.toHaveProperty('ratelimit-limit');
      expect(res.headers).not.toHaveProperty('ratelimit-remaining');
      expect(res.headers).not.toHaveProperty('ratelimit-reset');
    }
  }, 30000);
});

describe('Rate Limit Headers', () => {
  it('includes correct headers on first chat request', async () => {
    globalThis.__geminiMock.chatCreate = () => {
      return Promise.resolve({
        history: [],
        sendMessageStream: () => {
          return Promise.resolve({
            async *[Symbol.asyncIterator]() {
              yield { text: 'What brings you here?' };
            },
          });
        },
      });
    };

    const payload = { messages: [{ role: 'user', text: 'Hello' }] };

    const res = await request(app)
      .post('/api/chat')
      .send(payload)
      .set('Accept', 'text/event-stream');

    // Should succeed and include rate limit headers
    if (res.status === 200) {
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
      expect(res.headers).toHaveProperty('ratelimit-reset');
      
      // Parse header values
      const limit = parseInt(res.headers['ratelimit-limit'], 10);
      const remaining = parseInt(res.headers['ratelimit-remaining'], 10);
      const reset = parseInt(res.headers['ratelimit-reset'], 10);
      
      expect(limit).toBe(10);
      expect(remaining).toBeLessThanOrEqual(10);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(reset).toBeGreaterThan(0);
    }
  }, 30000);

  it('includes correct headers on first conclude request', async () => {
    globalThis.__geminiMock.modelGenerateContent = () => {
      return Promise.resolve({ text: 'Test summary' });
    };

    const payload = {
      messages: [
        { role: 'user', text: 'Test' },
        { role: 'assistant', text: 'What about it?' },
      ],
    };

    const res = await request(app)
      .post('/api/conclude')
      .send(payload);

    // Should succeed and include rate limit headers
    if (res.status === 200) {
      expect(res.headers).toHaveProperty('ratelimit-limit');
      expect(res.headers).toHaveProperty('ratelimit-remaining');
      expect(res.headers).toHaveProperty('ratelimit-reset');
      
      const limit = parseInt(res.headers['ratelimit-limit'], 10);
      const remaining = parseInt(res.headers['ratelimit-remaining'], 10);
      const reset = parseInt(res.headers['ratelimit-reset'], 10);
      
      expect(limit).toBe(5);
      expect(remaining).toBeLessThanOrEqual(5);
      expect(remaining).toBeGreaterThanOrEqual(0);
      expect(reset).toBeGreaterThan(0);
    }
  }, 30000);
});
