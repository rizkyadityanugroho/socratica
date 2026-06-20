# Socratica

> *The chatbot that never answers. It only asks.*

A philosophical Socratic-method chatbot built with Astro, Tailwind CSS, Node.js/Express, and Google's Gemini API. Walk in with a dilemma and let a chain of questions lead you to your own conclusion.

## Project Structure

```
socratica/
├── frontend/          # Astro + Tailwind static site
│   ├── src/
│   │   ├── components/ChatApp.js   # Vanilla JS chat widget
│   │   ├── layouts/Layout.astro    # Base HTML shell
│   │   └── pages/index.astro       # Main page (landing + chat UI)
│   ├── public/favicon.svg
│   ├── astro.config.mjs
│   ├── tailwind.config.js
│   ├── package.json
│   └── tsconfig.json
├── backend/           # Express + Gemini API server
│   ├── src/index.js
│   ├── .env.example
│   └── package.json
├── PRD.md
└── README.md
```

## Quick Start

### Prerequisites

- **Node.js 20+**
- **A Gemini API key** from [Google AI Studio](https://aistudio.google.com/)

### 1. Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env and add your Gemini API key:
# GEMINI_API_KEY=your_actual_key_here
npm install
npm run dev
```

The backend runs on `http://localhost:3001`.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on `http://localhost:4321` and proxies `/api/*` requests to the backend.

### 3. Open the App

Visit **[http://localhost:4321](http://localhost:4321)** in your browser.

## API Endpoints

| Method | Path           | Description                                    |
|--------|----------------|------------------------------------------------|
| POST   | `/api/chat`    | Send messages, get SSE-streamed Socratic reply |
| POST   | `/api/conclude`| Generate a one-sentence conclusion summary     |
| GET    | `/api/health`  | Health check + Gemini config status            |

### POST /api/chat

Request body:
```json
{
  "messages": [
    { "role": "user", "text": "I'm considering a career change..." },
    { "role": "assistant", "text": "What draws you to this new path?" }
  ]
}
```

Response: SSE stream with events:
- `{"type":"token","text":"char"}` — streamed characters
- `{"type":"retry","text":"..."}` — retrying with reinforced prompt
- `{"type":"done","text":"full response"}` — completion
- `{"type":"error","text":"..."}` — error message

### POST /api/conclude

Request body:
```json
{
  "messages": [
    { "role": "user", "text": "..." },
    { "role": "assistant", "text": "..." }
  ]
}
```

Response:
```json
{
  "summary": "You realized that fear of the unknown was the real barrier."
}
```

## How It Works

1. The landing page invites you to type a question or dilemma
2. Your message is sent to the backend, which calls Gemini with a strict Socratic system prompt
3. Gemini's response is streamed back character-by-character via SSE
4. **Every bot response must be a question** — enforced by system prompt + post-processing guard
5. If Gemini outputs a statement, the backend retries once with a reinforced prompt
6. Click "Conclude" to get a one-sentence summary reflecting your own conclusion
7. Refresh the page to reset — no accounts, no database, no persistence

## Tech Stack

- **Frontend**: Astro 5 + Tailwind CSS 3 + Vanilla JS
- **Backend**: Node.js + Express 4
- **AI**: Google Gemini API (`@google/generative-ai`)
- **Streaming**: Server-Sent Events (SSE)
- **Bundle**: < 100KB JS (no React/Vue) — just vanilla JS

## Design

Philosophical, academic, contemplative — zero imagery, all typography. Classic serif fonts for quotes and headings, refined sans-serif for body text. Monochrome palette with warm brown/tan accents.

## License

MIT
