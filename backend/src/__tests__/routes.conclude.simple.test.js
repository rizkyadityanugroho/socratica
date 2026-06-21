import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('POST /api/conclude - validation', () => {
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
        .post('/api/conclude')
        .send({ messages: [{ role: 'user', text: 'Hello' }] });

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/API key not configured/i);
    });

    it('returns 400 when messages is missing', async () => {
      process.env.GEMINI_API_KEY='valid-key-123';

      const response = await request(app)
        .post('/api/conclude')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toMatch(/messages array is required/i);
    });

    it('returns 400 when messages is not an array', async () => {
      process.env.GEMINI_API_KEY='valid-key-123';

      const response = await request(app)
        .post('/api/conclude')
        .send({ messages: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/messages array is required/i);
    });

    it('returns 400 when messages array is empty', async () => {
      process.env.GEMINI_API_KEY='valid-key-123';

      const response = await request(app)
        .post('/api/conclude')
        .send({ messages: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/messages array is required/i);
    });
  });
});
