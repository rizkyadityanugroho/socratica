import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

function streamFrom(...chunks) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield { text: c };
    },
  };
}

function parseSSE(text) {
  return text
    .split('\n\n')
    .filter((l) => l.startsWith('data: '))
    .map((l) => JSON.parse(l.replace('data: ', '')));
}

describe('POST /api/chat — streaming', () => {
  let origKey;

  beforeEach(() => {
    origKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key';
  });

  afterEach(() => {
    process.env.GEMINI_API_KEY = origKey;
    globalThis.__geminiMock = {};
  });

  it('streams tokens and sends done with full text', async () => {
    globalThis.__geminiMock.chatCreate = () =>
      Promise.resolve({
        history: [],
        sendMessageStream: () =>
          Promise.resolve(streamFrom('What ', 'do ', 'you\nthink?')),
      });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', text: 'Hello' }] });

    expect(res.status).toBe(200);
    const events = parseSSE(res.text);
    const done = events.find((e) => e.type === 'done');
    expect(done.text).toBe('What do you\nthink?');
  });

  it('sets SSE headers', async () => {
    globalThis.__geminiMock.chatCreate = () =>
      Promise.resolve({
        history: [],
        sendMessageStream: () =>
          Promise.resolve(streamFrom('What?')),
      });

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', text: 'Hi' }] });

    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['connection']).toBe('keep-alive');
  });

  it('sets conversation history from previous messages', async () => {
    let captured;

    globalThis.__geminiMock.chatCreate = () => {
      const chat = {
        _history: [],
        sendMessageStream: vi.fn().mockResolvedValue(streamFrom('Why?')),
        get history() { return this._history; },
        set history(v) { captured = v; this._history = v; },
      };
      return Promise.resolve(chat);
    };

    const messages = [
      { role: 'user', text: 'Start' },
      { role: 'assistant', text: 'What brings you?' },
      { role: 'user', text: 'Curiosity' },
    ];

    await request(app).post('/api/chat').send({ messages });

    expect(captured).toEqual([
      { role: 'model', parts: [{ text: 'What brings you?' }] },
      { role: 'user', parts: [{ text: 'Curiosity' }] },
    ]);
  });

  it('retries with reinforced prompt when response is not a question', async () => {
    const calls = [];

    globalThis.__geminiMock.chatCreate = () => {
      const idx = calls.length;
      calls.push(idx);
      const reply = idx === 0 ? 'That is a statement.' : 'What makes you say that?';
      return Promise.resolve({
        history: [],
        sendMessageStream: () =>
          Promise.resolve(streamFrom(reply)),
      });
    };

    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [
          { role: 'user', text: 'Hello' },
          { role: 'assistant', text: 'What do you want to discuss?' },
          { role: 'user', text: 'Tell me' },
        ],
      });

    const events = parseSSE(res.text);
    expect(events.some((e) => e.type === 'retry')).toBe(true);
    const done = events.find((e) => e.type === 'done');
    expect(done.text).toBe('What makes you say that?');
  });

  it('appends "?" when both attempts produce statements', async () => {
    globalThis.__geminiMock.chatCreate = () =>
      Promise.resolve({
        history: [],
        sendMessageStream: () =>
          Promise.resolve(streamFrom('Not a question')),
      });

    const res = await request(app)
      .post('/api/chat')
      .send({
        messages: [
          { role: 'user', text: 'First' },
          { role: 'assistant', text: 'What brings you?' },
          { role: 'user', text: 'Hey' },
        ],
      });

    const events = parseSSE(res.text);
    const done = events.find((e) => e.type === 'done');
    expect(done.text).toBe('Not a question?');
  });

  it('sends error event when Gemini API fails', async () => {
    globalThis.__geminiMock.chatCreate = () =>
      Promise.reject(new Error('API unavailable'));

    const res = await request(app)
      .post('/api/chat')
      .send({ messages: [{ role: 'user', text: 'Hi' }] });

    const events = parseSSE(res.text);
    expect(events.some((e) => e.type === 'error')).toBe(true);
  });
});
