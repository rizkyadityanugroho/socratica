import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('GET /api/health', () => {
  let originalApiKey;

  beforeEach(() => {
    originalApiKey = process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalApiKey;
  });

  it('returns 200 with status ok', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
  });

  it('returns geminiConfigured true when API key is set', async () => {
    process.env.GEMINI_API_KEY = 'test-api-key-123';

    const response = await request(app).get('/api/health');

    expect(response.body).toHaveProperty('geminiConfigured', true);
  });

  it('returns geminiConfigured false when API key is missing', async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await request(app).get('/api/health');

    expect(response.body).toHaveProperty('geminiConfigured', false);
  });

  it('returns geminiConfigured false when API key is placeholder', async () => {
    process.env.GEMINI_API_KEY = 'your_key_here';

    const response = await request(app).get('/api/health');

    expect(response.body).toHaveProperty('geminiConfigured', false);
  });

  it('returns JSON content type', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});
