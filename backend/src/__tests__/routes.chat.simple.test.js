import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('POST /api/chat - validation only', () => {
  let originalApiKey;

  beforeEach(() => {
    originalApiKey = process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  describe('input validation', () => {
    it('returns 500 when GEMINI_API_KEY is not configured', async () => {
      delete process.env.GEMINI_API_KEY;

      const response = await request(app)
        .post('/api/chat')
        .send({ messages: [{ role: 'user', text: 'Hello' }] });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/API key not configured/i);
    });

    it('returns 500 when GEMINI_API_KEY is placeholder', async () => {
      process.env.GEMINI_API_KEY = 'your_key_here';

      const response = await request(app)
        .post('/api/chat')
        .send({ messages: [{ role: 'user', text: 'Hello' }] });

      expect(response.status).toBe(500);
      expect(response.body.error).toMatch(/API key not configured/i);
    });

    it('returns 400 when messages is missing', async () => {
      process.env.GEMINI_API_KEY = 'test-key-123';

      const response = await request(app)
        .post('/api/chat')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/messages array is required/i);
    });

    it('returns 400 when messages is not an array', async () => {
      process.env.GEMINI_API_KEY = 'test-key-123';

      const response = await request(app)
        .post('/api/chat')
        .send({ messages: 'not an array' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/messages array is required/i);
    });

    it('returns 400 when messages array is empty', async () => {
      process.env.GEMINI_API_KEY = 'test-key-123';

      const response = await request(app)
        .post('/api/chat')
        .send({ messages: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/messages array is required/i);
    });
  });

  describe('SSE headers', () => {
    it('sets correct content-type for SSE', async () => {
      process.env.GEMINI_API_KEY = 'test-key-123';

      // This will fail with Gemini error but we can check headers
      const response = await request(app)
        .post('/api/chat')
        .send({ messages: [{ role: 'user', text: 'Hello' }] })
        .timeout(2000);

      // Headers are set before streaming starts
      expect(response.headers['content-type']).toMatch(/text\/event-stream/);
    });
  });
});
