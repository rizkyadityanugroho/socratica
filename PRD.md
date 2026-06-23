# PRD: Socratica

**Product:** Socratica — The chatbot that never answers. It only asks.
**Status:** Draft
**Date:** 2026-06-23

---

## 1. Elevator Pitch

A single-purpose web app where you walk in with a dilemma and a Socratic chatbot walks you through it by asking questions — no advice, no answers, just a deepening chain of questions until you arrive at your own conclusion.

---

## 2. Problem Statement

When people have tough decisions to make, they often seek advice when what they really need is clarity of thought. Existing AI chatbots are eager to *answer* — they give recommendations, pros/cons lists, and opinions. This creates a crutch where users outsource their thinking instead of sharpening it.

Socratica flips the dynamic: the AI only asks questions, forcing the user to articulate, examine, and refine their own reasoning.

---

## 3. Target Users

- **Solo decision-makers** — founders, freelancers, career-changers weighing a choice
- **Journalers & thinkers** — people who use writing to think
- **Tinkerers** — anyone curious about constraint-based AI interactions

---

## 4. User Flow

```
Landing page  →  Type your question/dilemma
                      ↓
            Socratic asks a question back
                      ↓
            User answers naturally
                      ↓
            Socratic asks a deeper question
                      ↓
              (repeat until clarity)
                      ↓
            User clicks "Conclude"
                      ↓
            Summary: the user's own conclusion,
            reflected back in one sentence
```

### States

| State | Description |
|-------|-------------|
| **Empty** | Centered input, no chat history, tagline visible |
| **Active** | Scrollable chat view, input at bottom, "Conclude" button visible |
| **Concluded** | Final summary displayed, button to "Start over" |

---

## 5. Functional Requirements

### F1. Chat Interface
- **F1.1** User types a message and hits Enter/Send
- **F1.2** Each message is rendered as a chat bubble (user right-aligned, bot left-aligned)
- **F1.3** Bot responses stream in character-by-character (like typical LLM chatbots)
- **F1.4** A loading indicator shows while waiting for the first token

### F2. The Socratic Constraint
- **F2.1** Every bot response must be a question
- **F2.2** Enforcement via system prompt + post-processing guard (backend retries if Gemini outputs a statement)
- **F2.3** No greetings, farewells, or small talk from the bot

### F3. Conversation Lifecycle
- **F3.1** Ephemeral sessions — no accounts, no database, no history
- **F3.2** Page refresh resets the conversation
- **F3.3** "Conclude" button triggers a single-summary response from Gemini
- **F3.4** "Start over" clears chat and returns to empty state

### F4. Backend API
- **F4.1** `POST /api/chat` — accepts `{ messages: [{ role, text }] }`, returns a streamed SSE response
- **F4.2** `POST /api/conclude` — accepts full conversation, returns a summary statement
- **F4.3** Backend validates that the response is a question before streaming

### F5. Rate Limiting
- **F5.1** Rate limiting applied per IP address using `express-rate-limit` (in-memory store)
- **F5.2** `POST /api/chat`: max 10 requests per 60-second sliding window
- **F5.3** `POST /api/conclude`: max 5 requests per 60-second sliding window
- **F5.4** Exceeded limit returns HTTP 429 with a plain JSON body `{ "error": "Too many requests. Please slow down." }`
- **F5.5** Rate limit state is ephemeral — resets on server restart (acceptable for single-instance deployment)

---

## 6. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Time to first token** | < 1.5s (Gemini is fast) |
| **Frontend bundle** | < 100KB JS (no React/Vue, vanilla JS in Astro) |
| **Mobile support** | Full-width responsive layout |
| **Zero persistence** | No cookies, no localStorage user data, no tracking |
| **API key config** | Via `.env` only, never hardcoded |
| **Rate limiting storage** | In-memory (no external dependency). Upgrade to Redis-backed when multi-instance deployment needed |

---

## 7. Tech Stack

| Layer | Tech | Version |
|-------|------|---------|
| Static pages | **AstroJS** | latest |
| CSS | **Tailwind CSS** (via Astro integration) | latest |
| Chat UI | **Vanilla JS** (client-side component in Astro) | — |
| Backend | **Node.js + Express** | 20+ / Express 4 |
| LLM | **Gemini** (`@google/generative-ai` SDK) | latest |
| Streaming | **SSE** (Server-Sent Events) | — |
| Env management | `dotenv` | — |

---

## 8. System Architecture

```
┌──────────────┐        POST /api/chat        ┌──────────────┐
│              │ ──── (SSE stream) ────────→  │              │
│   Astro      │                               │  Express     │
│   Frontend   │                               │  Backend     │
│   (tailwind) │ ←─── streamed tokens ──────  │  (NodeJS)    │
│              │                               │              │
└──────────────┘                               └──────┬───────┘
                                                      │
                                                      │ @google/generative-ai
                                                      ↓
                                              ┌──────────────┐
                                              │   Gemini      │
                                              │   API         │
                                              └──────────────┘
```

### Data flow (detailed)

1. User types message → frontend appends to local `messages[]`
2. Frontend sends `POST /api/chat` with the full message history as JSON
3. Backend calls Gemini with Socratic system prompt
4. Gemini returns a streamed response (token by token)
5. Backend buffers tokens, checks the completed response is a question
6. Backend streams tokens back to frontend via SSE
7. Frontend appends each token to the bot bubble as it arrives
8. If post-processing fails (not a question), backend retries once with reinforced prompt

---

## 9. File Structure

```
socratica/
├── PRD.md
├── README.md
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ChatApp.js        # Vanilla JS chat widget
│   │   ├── layouts/
│   │   │   └── Layout.astro      # Base layout with Tailwind
│   │   └── pages/
│   │       └── index.astro       # Landing page
│   ├── public/
│   │   └── favicon.svg           # (optional)
│   ├── .env                      # Public env vars (PUBLIC_*)
│   ├── .env.example
│   ├── astro.config.mjs
│   ├── tailwind.config.js
│   ├── package.json
│   └── tsconfig.json
├── backend/
│   ├── src/
│   │   ├── index.js              # Express server with chat + conclude routes
│   │   ├── helpers.js            # Retry, history builder, validation
│   │   └── __tests__/            # Unit test suite (vitest)
│   ├── .env
│   ├── .env.example
│   └── package.json
```

---

## 10. Edge Cases & Risks

| Risk | Mitigation |
|------|------------|
| Gemini still gives advice despite system prompt | Post-processing guard rejects non-questions; retry once with reinforced prompt |
| User asks "Why do you only ask questions?" | System prompt includes: "If asked about yourself, respond with a question about their question" |
| Streaming interrupted / connection drops | No persistence so it's fine — user just refreshes and starts over |
| Empty input submitted | Frontend validation: disable send button when input is blank |
| Very long conversation | No hard limit; Gemini context window handles it. If length becomes an issue, add a token counter warning |
| API key exposed in frontend | Key lives in backend `.env` only; never sent to the browser |
| User hits rate limit | Backend returns 429 with descriptive message. Frontend shows a non-blocking toast: "You're going deep — take a breath and try again in a moment." |

---

## 11. Future Ideas (out of scope for v1)

- Export conversation as text/image
- Multiple "personalities" (Stoic, Devil's Advocate, Zen Master)
- User-chosen depth level (surface vs. deep probing)
- PWA installable
