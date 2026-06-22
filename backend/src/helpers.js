import { ApiError } from '@google/genai';

// ── Retry helper for 429 (rate limit) ───────────────────────────────
const MAX_RETRIES = parseInt(process.env.GEMINI_MAX_RETRIES || '3', 10);
const BASE_DELAY_MS = parseInt(process.env.GEMINI_RETRY_DELAY_MS || '1000', 10);

export async function retryWithBackoff(fn, context = 'API call') {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      // Only retry on 429 from the Gemini SDK
      if (err instanceof ApiError && err.status === 429) {
        if (attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(
            `[${context}] 429 rate limited (attempt ${attempt}/${MAX_RETRIES}). ` +
            `Retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        console.error(
          `[${context}] 429 rate limit exhausted after ${MAX_RETRIES} attempts.`,
        );
      }

      // Non-retryable or out of retries — rethrow
      throw err;
    }
  }
  throw lastError; // Shouldn't reach here, but keeps TS happy
}

/**
 * Log the full details of a Gemini API error for debugging.
 */
export function logGeminiError(context, err) {
  if (err instanceof ApiError) {
    console.error(`[${context}] Gemini fetch error (HTTP ${err.status}):`, {
      message: err.message,
      status: err.status,
      errorDetails: err.errorDetails,
    });
  } else {
    console.error(`[${context}] Gemini error:`, err);
  }
}

/**
 * Build Gemini history format from frontend messages array.
 * Skips the first user message (used as initial prompt).
 */
export function buildHistory(messages) {
  const history = [];
  // Skip the first user message — it becomes the initial prompt
  for (let i = 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user') {
      history.push({ role: 'user', parts: [{ text: msg.text }] });
    } else if (msg.role === 'assistant') {
      history.push({ role: 'model', parts: [{ text: msg.text }] });
    }
  }
  return history;
}

/**
 * Check if text ends with a question mark.
 */
export function isQuestion(text) {
  const trimmed = text.trim();
  return trimmed.endsWith('?');
}

export const MAX_RETRIES_EXPORT = MAX_RETRIES;
export const BASE_DELAY_MS_EXPORT = BASE_DELAY_MS;
