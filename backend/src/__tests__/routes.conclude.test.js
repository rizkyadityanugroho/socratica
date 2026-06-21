import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('POST /api/conclude — summary generation', () => {
  let _prevValue;

  beforeEach(() => {
    const envKey = ['GEMINI', 'API', 'KEY'].join('_');
    _prevValue = process.env[envKey];
    process.env[envKey]='***';
  });

  afterEach(() => {
    const envKey = ['GEMINI', 'API', 'KEY'].join('_');
    process.env[envKey] = _prevValue;
    globalThis.__geminiMock = {};
  });

  it('returns a summary from the conversation', async () => {
    globalThis.__geminiMock.modelGenerateContent = () =>
      Promise.resolve({ text: 'You learned something.' });

    const res = await request(app)
      .post('/api/conclude')
      .send({
        messages: [
          { role: 'user', text: 'I want to learn' },
          { role: 'assistant', text: 'What attracts you?' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('You learned something.');
  });

  it('returns JSON content type', async () => {
    globalThis.__geminiMock.modelGenerateContent = () =>
      Promise.resolve({ text: 'Summary.' });

    const res = await request(app)
      .post('/api/conclude')
      .send({
        messages: [{ role: 'user', text: 'Hi' }],
      });

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('formats conversation with user/assistant labels in prompt', async () => {
    let captured;

    globalThis.__geminiMock.modelGenerateContent = ({ contents }) => {
      captured = contents;
      return Promise.resolve({ text: 'Summary.' });
    };

    await request(app)
      .post('/api/conclude')
      .send({
        messages: [
          { role: 'user', text: 'Hello' },
          { role: 'assistant', text: 'What is your question?' },
        ],
      });

    expect(captured).toContain('User: Hello');
    expect(captured).toContain('Socratica: What is your question?');
  });

  it('returns 500 when Gemini API call fails', async () => {
    globalThis.__geminiMock.modelGenerateContent = () =>
      Promise.reject(new Error('API error'));

    const res = await request(app)
      .post('/api/conclude')
      .send({
        messages: [{ role: 'user', text: 'Hi' }],
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it('handles empty summary text', async () => {
    globalThis.__geminiMock.modelGenerateContent = () =>
      Promise.resolve({ text: '' });

    const res = await request(app)
      .post('/api/conclude')
      .send({
        messages: [{ role: 'user', text: 'Hi' }],
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('');
  });
});
