/**
 * Global setup: mock @google/genai to avoid real API calls and
 * provide consistent mock controllers across all test files.
 *
 * Each test file accesses the controller via globalThis.__geminiMock
 * to set up per-test behavior.
 */

globalThis.__geminiMock = {};

vi.mock('@google/genai', () => {
  function createFn(name) {
    return function (...args) {
      const ctrl = globalThis.__geminiMock;
      if (ctrl && typeof ctrl[name] === 'function') return ctrl[name](...args);
      if (name === 'chatCreate') {
        return Promise.resolve({
          history: [],
          sendMessageStream: function () {
            return Promise.resolve({
              stream: { async *[Symbol.asyncIterator]() {} },
            });
          },
        });
      }
      return Promise.resolve({ text: '' });
    };
  }

  return {
    ApiError: class extends Error {
      constructor(message, options) {
        super(message || '');
        this.name = 'ApiError';
        this.status = options?.status;
        this.errorDetails = options?.errorDetails;
      }
    },
    GoogleGenAI: function () {
      return {
        chats: { create: createFn('chatCreate') },
        models: { generateContent: createFn('modelGenerateContent') },
      };
    },
  };
});
