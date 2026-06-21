import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApiError } from '@google/genai';
import {
  retryWithBackoff,
  logGeminiError,
  buildHistory,
  isQuestion,
  MAX_RETRIES_EXPORT,
  BASE_DELAY_MS_EXPORT,
} from '../helpers.js';

describe('isQuestion', () => {
  it('returns true for text ending with question mark', () => {
    expect(isQuestion('What is this?')).toBe(true);
  });

  it('returns true for text with trailing whitespace', () => {
    expect(isQuestion('What is this?  ')).toBe(true);
  });

  it('returns false for text without question mark', () => {
    expect(isQuestion('This is a statement')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isQuestion('')).toBe(false);
  });

  it('returns false for text ending with period', () => {
    expect(isQuestion('This is a statement.')).toBe(false);
  });

  it('handles text with question mark in middle', () => {
    expect(isQuestion('What? This is not a question')).toBe(false);
  });
});

describe('buildHistory', () => {
  it('converts frontend messages to Gemini format', () => {
    const messages = [
      { role: 'user', text: 'First message' },
      { role: 'assistant', text: 'First response' },
      { role: 'user', text: 'Second message' },
    ];

    const result = buildHistory(messages);

    expect(result).toEqual([
      { role: 'model', parts: [{ text: 'First response' }] },
      { role: 'user', parts: [{ text: 'Second message' }] },
    ]);
  });

  it('skips the first user message', () => {
    const messages = [
      { role: 'user', text: 'Initial prompt' },
    ];

    const result = buildHistory(messages);

    expect(result).toEqual([]);
  });

  it('handles single message (no history)', () => {
    const messages = [
      { role: 'user', text: 'Only message' },
    ];

    const result = buildHistory(messages);

    expect(result).toEqual([]);
  });

  it('converts assistant role to model role', () => {
    const messages = [
      { role: 'user', text: 'First' },
      { role: 'assistant', text: 'Response' },
    ];

    const result = buildHistory(messages);

    expect(result[0].role).toBe('model');
  });

  it('handles complex conversation', () => {
    const messages = [
      { role: 'user', text: 'Msg 1' },
      { role: 'assistant', text: 'Resp 1' },
      { role: 'user', text: 'Msg 2' },
      { role: 'assistant', text: 'Resp 2' },
      { role: 'user', text: 'Msg 3' },
    ];

    const result = buildHistory(messages);

    expect(result).toHaveLength(4);
    expect(result[0].role).toBe('model');
    expect(result[1].role).toBe('user');
    expect(result[2].role).toBe('model');
    expect(result[3].role).toBe('user');
  });
});

describe('logGeminiError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  it('logs ApiError with structured details', () => {
    const apiError = new ApiError('Test error', {
      status: 429,
      errorDetails: { reason: 'quota exceeded' },
    });

    logGeminiError('test-context', apiError);

    expect(console.error).toHaveBeenCalledWith(
      '[test-context] Gemini fetch error (HTTP 429):',
      expect.objectContaining({
        status: 429,
        errorDetails: { reason: 'quota exceeded' },
      })
    );
  });

  it('logs generic errors', () => {
    const genericError = new Error('Something went wrong');

    logGeminiError('test-context', genericError);

    expect(console.error).toHaveBeenCalledWith(
      '[test-context] Gemini error:',
      genericError
    );
  });
});

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers();
  });

  it('succeeds on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await retryWithBackoff(fn, 'test');

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 ApiError', async () => {
    const apiError = new ApiError('Rate limited', { status: 429 });
    apiError.status = 429;

    const fn = vi.fn()
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(fn, 'test');

    // Fast-forward through the retry delay
    await vi.advanceTimersByTimeAsync(BASE_DELAY_MS_EXPORT);

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('429 rate limited (attempt 1/3)')
    );
  });

  it('throws after max retries exhausted', async () => {
    const apiError = new ApiError('Rate limited', { status: 429 });
    apiError.status = 429;

    const fn = vi.fn().mockRejectedValue(apiError);

    const promise = retryWithBackoff(fn, 'test');

    // Attach rejection handler FIRST so it's ready when the promise rejects
    const rejection = expect(promise).rejects.toThrow();

    // Then fast-forward through all retry delays
    for (let i = 0; i < MAX_RETRIES_EXPORT; i++) {
      await vi.advanceTimersByTimeAsync(BASE_DELAY_MS_EXPORT * Math.pow(2, i));
    }

    await rejection;
    expect(fn).toHaveBeenCalledTimes(MAX_RETRIES_EXPORT);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('429 rate limit exhausted after 3 attempts')
    );
  });

  it('throws immediately on non-429 errors', async () => {
    const otherError = new Error('Network error');

    const fn = vi.fn().mockRejectedValue(otherError);

    await expect(retryWithBackoff(fn, 'test')).rejects.toThrow(otherError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff delays', async () => {
    const apiError = new ApiError('Rate limited', { status: 429 });
    apiError.status = 429;

    const fn = vi.fn()
      .mockRejectedValueOnce(apiError)
      .mockRejectedValueOnce(apiError)
      .mockResolvedValueOnce('success');

    const promise = retryWithBackoff(fn, 'test');

    // First retry: 1s
    await vi.advanceTimersByTimeAsync(BASE_DELAY_MS_EXPORT);
    // Second retry: 2s
    await vi.advanceTimersByTimeAsync(BASE_DELAY_MS_EXPORT * 2);

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
