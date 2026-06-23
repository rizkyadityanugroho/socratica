import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { rateLimit } from 'express-rate-limit';
import { retryWithBackoff, logGeminiError, buildHistory, isQuestion } from './helpers.js';
import { createProxiedFetch } from './proxy.js';

const app = express();
const PORT = process.env.PORT || 3001;
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

// ── Rate limiters ──────────────────────────────────────────────────
// Skip rate limiting in test environment to allow rapid test requests
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const chatLimiter = isTestEnv
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000, // 60 seconds
      max: 10, // 10 requests per window
      message: { error: 'Too many requests. Please slow down.' },
      standardHeaders: true,
      legacyHeaders: false,
    });

const concludeLimiter = isTestEnv
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 60 * 1000, // 60 seconds
      max: 5, // 5 requests per window
      message: { error: 'Too many requests. Please slow down.' },
      standardHeaders: true,
      legacyHeaders: false,
    });

// ── Gemini client ──────────────────────────────────────────────────
let ai;

function initGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') return false;

  // Monkey-patch global fetch to route Gemini API calls through proxy
  // (@google/genai SDK uses global fetch directly, ignores httpOptions)
  const proxyUrl = process.env.GEMINI_PROXY;
  if (proxyUrl) {
    const proxiedFetch = createProxiedFetch(proxyUrl);
    if (proxiedFetch) globalThis.fetch = proxiedFetch;
  }

  ai = new GoogleGenAI({ apiKey });
  return true;
}

const SYSTEM_PROMPT = `You are Socratica, a Socratic chatbot. You NEVER answer questions — you ONLY ask questions.

Rules:
1. Every response you give MUST be a question. No exceptions.
2. Do NOT greet the user, do NOT say hello, do NOT introduce yourself.
3. Do NOT give advice, opinions, or suggestions.
4. Do NOT make statements about the user's situation.
5. Do NOT use phrases like "That's a great question" or "I see" or "I understand".
6. If the user asks about you or why you only ask questions, respond with a question about their question (e.g., "What makes you curious about my approach?").
7. Your questions should be thought-provoking, pushing the user to examine their own reasoning more deeply.
8. Keep questions concise — one question at a time.
9. Do NOT end with anything other than a question mark.

Remember: Every single response must end with "?". If your response does not end with "?", you have failed.`;

const REINFORCED_PROMPT = `You are Socratica, a Socratic chatbot. You NEVER answer questions — you ONLY ask questions.

CRITICAL: Your previous response was rejected because it was NOT a question. Every single response MUST be a question ending with "?".

Rules:
1. EVERY response MUST be a question. No exceptions.
2. Do NOT greet, introduce, or make small talk.
3. Do NOT give advice, opinions, or suggestions.
4. Do NOT make any statements at all.
5. Your entire output must be ONE question — nothing else.
6. The question must end with "?".

Respond NOW with ONLY a question.`;

// ── POST /api/chat (SSE stream) ────────────────────────────────────

app.post('/api/chat', chatLimiter, async (req, res) => {
  if (!initGemini()) {
    return res.status(500).json({ error: 'Gemini API key not configured. Set GEMINI_API_KEY in .env' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const sendError = (msg) => {
    sendEvent({ type: 'error', text: msg });
    res.end();
  };

  try {
    const userMessage = messages[messages.length - 1];
    const history = buildHistory(messages);

    // ── Attempt 1 ──────────────────────────────────────────────
    let chat = await ai.chats.create({
      model: MODEL,
      config: { systemInstruction: SYSTEM_PROMPT },
    });
    
    // Set history if available
    if (history.length > 0) {
      chat.history = history;
    }

    let result = await retryWithBackoff(
      () => chat.sendMessageStream({ message: userMessage.text }),
      'Chat.sendMessageStream',
    );
    let buffer = '';
    let fullResponse = '';

    for await (const chunk of result) {
      const text = chunk.text;
      if (text) {
        buffer += text;
        // Send tokens character by character for smooth streaming
        for (const char of text) {
          fullResponse += char;
          sendEvent({ type: 'token', text: char });
        }
      }
    }

    // Check if the completed response is a question
    if (!isQuestion(fullResponse)) {
      // ── Attempt 2 (retry with reinforced prompt) ─────────────
      // Send a retry signal
      sendEvent({ type: 'retry', text: 'Reinforcing Socratic constraint...' });

      chat = await ai.chats.create({
        model: MODEL,
        config: { systemInstruction: SYSTEM_PROMPT },
      });
      
      if (history.length > 0) {
        chat.history = history;
      }

      const reinforcedMessage = `[IMPORTANT: The previous response was rejected because it was not a question. Respond ONLY with a single question.] ${userMessage.text}`;
      result = await retryWithBackoff(
        () => chat.sendMessageStream({ message: reinforcedMessage }),
        'Chat.sendMessageStream (reinforced)',
      );
      buffer = '';
      fullResponse = '';

      for await (const chunk of result) {
        const text = chunk.text;
        if (text) {
          buffer += text;
          for (const char of text) {
            fullResponse += char;
            sendEvent({ type: 'token', text: char });
          }
        }
      }

      // If still not a question, send fallback
      if (!isQuestion(fullResponse)) {
        const fallback = fullResponse.trim() + '?';
        sendEvent({ type: 'token', text: '?' });
        fullResponse = fallback;
      }
    }

    sendEvent({ type: 'done', text: fullResponse });
    res.end();
  } catch (err) {
    logGeminiError('POST /api/chat', err);
    sendError(err.message || 'Internal server error');
  }
});

// ── POST /api/conclude (summary) ───────────────────────────────────

app.post('/api/conclude', concludeLimiter, async (req, res) => {
  if (!initGemini()) {
    return res.status(500).json({ error: 'Gemini API key not configured' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  try {
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Socratica'}: ${m.text}`)
      .join('\n');

    const summaryPrompt = `You are a philosophical reflection engine. Below is a Socratic dialogue between a user and Socratica (an AI that only asks questions).

Read the conversation and write a SINGLE sentence that reflects back the user's own conclusion or insight that emerged from the dialogue. Write it as if the user discovered this themselves.

Do NOT add advice, recommendations, or further questions. Just one sentence that captures the essence of what the user worked through.

Conversation:
${conversationText}

Summary sentence:`;

    const result = await retryWithBackoff(
      () => ai.models.generateContent({
        model: MODEL,
        contents: summaryPrompt,
        config: {},
      }),
      'Conclude.generateContent',
    );
    const summary = result.text.trim();

    res.json({ summary });
  } catch (err) {
    logGeminiError('POST /api/conclude', err);
    res.status(500).json({ error: err.message || 'Failed to generate summary' });
  }
});

// ── Health check ────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', geminiConfigured: initGemini() });
});

// Export app for testing
export { app, initGemini };

// Only start server if this file is run directly
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(__filename) === path.resolve(process.argv[1])) {
  app.listen(PORT, () => {
    const configured = initGemini();
    console.log(`Socratica backend running on http://localhost:${PORT}`);
    console.log(`Gemini API: ${configured ? 'configured' : 'NOT configured (set GEMINI_API_KEY in .env)'}`);
  });
}
