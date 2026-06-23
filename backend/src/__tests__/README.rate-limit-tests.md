# Rate Limit Tests

## Overview
Rate-limit-specific tests that exercise the actual `express-rate-limit` middleware by bypassing the `isTestEnv` guard.

## Running the Tests

### Run rate-limit tests only:
```bash
npx vitest run src/__tests__/routes.rate-limit.test.js
```

### Note:
`npm test` runs the main suite (44 tests). Rate-limit tests must be run separately since they manipulate env vars to bypass the `isTestEnv` guard.

## Test Scenarios

1. **POST /api/chat - rate limit exceeded**
   - Sends 11 requests within 60s
   - First 10 succeed, 11th returns 429 with error message
   - Verifies `RateLimit-*` headers are present

2. **POST /api/conclude - rate limit exceeded**
   - Sends 6 requests within 60s
   - First 5 succeed, 6th returns 429

3. **GET /api/health - not rate limited**
   - Sends 20 rapid requests
   - All return 200, no rate limit headers

4. **Rate limit headers**
   - Verifies `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on chat/conclude endpoints

## Implementation Details

The test file manipulates `process.env.NODE_ENV` and `process.env.VITEST` in a `beforeAll` hook before dynamically importing the app. This ensures the `isTestEnv` guard evaluates to `false`, activating rate limiting.

The tests use the existing Gemini mock from `setup.js` and set `globalThis.__geminiMock` to provide consistent responses.
