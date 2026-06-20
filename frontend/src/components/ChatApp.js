/**
 * ChatApp.js — Vanilla JS Socratica chat widget
 *
 * Manages three states: LANDING, ACTIVE, CONCLUDED
 * Handles SSE streaming from /api/chat
 * Renders messages, handles send/conclude actions
 */
(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────
  const state = {
    messages: [],           // { role: 'user'|'assistant', text: string }
    isStreaming: false,
    currentBotMessage: '',  // buffer for in-progress bot response
    sessionStart: null,
  };

  // ── DOM References ─────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const dom = {};

  function cacheDom() {
    dom.landingView = $('landing-view');
    dom.chatView = $('chat-view');
    dom.concludedView = $('concluded-view');
    dom.landingInput = $('landing-input');
    dom.btnBeginDialogue = $('btn-begin-dialogue');
    dom.btnEnterLanding = $('btn-enter-landing');
    dom.chatInput = $('chat-input');
    dom.btnSend = $('btn-send');
    dom.btnConclude = $('btn-conclude');
    dom.btnConcludeSidebar = $('btn-conclude-sidebar');
    dom.btnStartOver = $('btn-start-over');
    dom.btnNotebook = $('btn-notebook');
    dom.btnExport = $('btn-export');
    dom.messagesContainer = $('messages-container');
    dom.loadingIndicator = $('loading-indicator');
    dom.sessionTitle = $('session-title');
    dom.sessionTime = $('session-time');
    dom.conclusionSummary = $('conclusion-summary');
  }

  // ── View Switching ─────────────────────────────────────────────────
  function showView(viewName) {
    dom.landingView.classList.add('hidden');
    dom.chatView.classList.add('hidden');
    dom.concludedView.classList.add('hidden');

    if (viewName === 'landing') dom.landingView.classList.remove('hidden');
    else if (viewName === 'chat') dom.chatView.classList.remove('hidden');
    else if (viewName === 'concluded') dom.concludedView.classList.remove('hidden');
  }

  // ── Session ────────────────────────────────────────────────────────
  function startSession(initialQuery) {
    state.messages = [{ role: 'user', text: initialQuery }];
    state.sessionStart = new Date();

    // Update session header
    dom.sessionTime.textContent = `Session opened at ${state.sessionStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    // Truncate query for title
    const title = initialQuery.length > 40
      ? initialQuery.slice(0, 40) + '…'
      : initialQuery;
    dom.sessionTitle.textContent = `Exploring: "${title}"`;

    showView('chat');
    renderMessages();

    // Auto-send the initial query
    sendToBackend();
  }

  // ── Rendering ──────────────────────────────────────────────────────
  function renderMessages() {
    dom.messagesContainer.innerHTML = '';

    // Show relevant themes header if there are messages
    if (state.messages.length > 0) {
      const themesEl = document.createElement('div');
      themesEl.className = 'text-center mb-8';
      themesEl.innerHTML = `
        <p class="text-[10px] uppercase tracking-[0.2em] text-gray-400">Relevant Themes</p>
      `;
      dom.messagesContainer.appendChild(themesEl);
    }

    state.messages.forEach((msg, idx) => {
      const el = document.createElement('div');
      if (msg.role === 'user') {
        el.className = 'flex justify-start';
        el.innerHTML = `
          <div class="max-w-[70%] bg-white rounded-lg px-5 py-3 shadow-sm border border-gray-100">
            <p class="text-sm text-charcoal leading-relaxed">${escapeHtml(msg.text)}</p>
          </div>
        `;
      } else {
        el.className = 'flex justify-center';
        el.id = `bot-msg-${idx}`;
        el.innerHTML = `
          <div class="max-w-[80%] text-center">
            <p class="font-serif italic text-lg md:text-xl text-charcoal leading-relaxed">${escapeHtml(msg.text)}</p>
          </div>
        `;
      }
      dom.messagesContainer.appendChild(el);
    });

    // Scroll to bottom
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
  }

  function appendUserMessage(text) {
    state.messages.push({ role: 'user', text });
    const el = document.createElement('div');
    el.className = 'flex justify-start animate-fadeIn';
    el.innerHTML = `
      <div class="max-w-[70%] bg-white rounded-lg px-5 py-3 shadow-sm border border-gray-100">
        <p class="text-sm text-charcoal leading-relaxed">${escapeHtml(text)}</p>
      </div>
    `;
    dom.messagesContainer.appendChild(el);
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
  }

  function createBotMessageElement() {
    const el = document.createElement('div');
    el.className = 'flex justify-center animate-fadeIn';
    el.innerHTML = `
      <div class="max-w-[80%] text-center">
        <p class="font-serif italic text-lg md:text-xl text-charcoal leading-relaxed"></p>
      </div>
    `;
    dom.messagesContainer.appendChild(el);
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
    return el.querySelector('p');
  }

  function showLoading() {
    dom.loadingIndicator.classList.remove('hidden');
  }

  function hideLoading() {
    dom.loadingIndicator.classList.add('hidden');
  }

  // ── SSE / API calls ───────────────────────────────────────────────
  function sendToBackend() {
    if (state.isStreaming) return;
    state.isStreaming = true;
    state.currentBotMessage = '';

    dom.btnSend.disabled = true;
    dom.chatInput.disabled = true;
    showLoading();

    const botEl = createBotMessageElement();
    const messagePayload = state.messages.map(m => ({ role: m.role, text: m.text }));

    const apiBase = window.API_BASE_URL || 'http://localhost:3001';
    const eventSource = new EventSourcePolyfill(apiBase + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: messagePayload }),
    });

    let fullText = '';

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        switch (data.type) {
          case 'token':
            fullText += data.text;
            botEl.textContent = fullText;
            dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
            // Check if it ends with '?'
            if (fullText.trim().endsWith('?')) {
              // This is a complete question — good
            }
            break;
          case 'retry':
            // Show retry notice briefly — we could show it but let's just continue
            break;
          case 'done':
            state.messages.push({ role: 'assistant', text: data.text });
            state.isStreaming = false;
            dom.btnSend.disabled = false;
            dom.chatInput.disabled = false;
            hideLoading();
            dom.chatInput.focus();
            eventSource.close();
            break;
          case 'error':
            console.error('Chat error:', data.text);
            botEl.textContent = 'An error occurred. Please try again.';
            state.isStreaming = false;
            dom.btnSend.disabled = false;
            dom.chatInput.disabled = false;
            hideLoading();
            eventSource.close();
            break;
        }
      } catch (err) {
        // partial JSON — skip
      }
    };

    eventSource.onerror = () => {
      // Only handle if not already done
      if (state.isStreaming) {
        // If we got some text, save it
        if (fullText.trim()) {
          state.messages.push({ role: 'assistant', text: fullText });
        }
        state.isStreaming = false;
        dom.btnSend.disabled = false;
        dom.chatInput.disabled = false;
        hideLoading();
        eventSource.close();
      }
    };
  }

  // ── Conclude ───────────────────────────────────────────────────────
  async function concludeSession() {
    if (state.messages.length === 0) return;

    dom.btnConclude.disabled = true;
    dom.btnConcludeSidebar.disabled = true;
    dom.btnConclude.textContent = 'Concluding…';
    dom.btnConcludeSidebar.textContent = 'Concluding…';

    try {
      const apiBase = window.API_BASE_URL || 'http://localhost:3001';
      const res = await fetch(apiBase + '/api/conclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: state.messages }),
      });

      if (!res.ok) throw new Error('Conclude request failed');

      const data = await res.json();
      dom.conclusionSummary.textContent = data.summary || 'The dialogue revealed no clear conclusion.';
      showView('concluded');
    } catch (err) {
      console.error('Conclude error:', err);
      dom.conclusionSummary.textContent = 'Unable to generate a conclusion. The dialogue remains open.';
      showView('concluded');
    }
  }

  // ── Reset ──────────────────────────────────────────────────────────
  function resetSession() {
    state.messages = [];
    state.isStreaming = false;
    state.currentBotMessage = '';
    state.sessionStart = null;
    dom.chatInput.value = '';
    dom.landingInput.value = '';
    dom.btnConclude.disabled = false;
    dom.btnConcludeSidebar.disabled = false;
    dom.btnConclude.textContent = 'Conclude';
    dom.btnConcludeSidebar.textContent = 'Conclude Session';
    showView('landing');
  }

  // ── SSE Polyfill (POST-based SSE via fetch) ───────────────────────
  function EventSourcePolyfill(url, options) {
    const listeners = {};
    let closed = false;

    this.addEventListener = (type, cb) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(cb);
    };

    this.close = () => {
      closed = true;
    };

    this.onmessage = null;
    this.onerror = null;

    (async () => {
      try {
        const response = await fetch(url, {
          method: options.method || 'POST',
          headers: options.headers || {},
          body: options.body || null,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => 'Unknown error');
          if (this.onerror) this.onerror(new Error(errText));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // keep incomplete line

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              const event = { data };
              if (this.onmessage) this.onmessage(event);
              if (listeners.message) {
                listeners.message.forEach(cb => cb(event));
              }
            }
          }
        }
      } catch (err) {
        if (!closed && this.onerror) this.onerror(err);
      }

      // Signal end
      if (!closed && this.onerror) {
        // Don't call onerror for normal completion — only errors
      }
    })();

    return this;
  }

  // ── Utilities ──────────────────────────────────────────────────────
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ── Event Binding ──────────────────────────────────────────────────
  function bindEvents() {
    // Landing: Begin Dialogue button
    dom.btnBeginDialogue.addEventListener('click', () => {
      const val = dom.landingInput.value.trim();
      if (!val) {
        dom.landingInput.classList.add('border-red-300');
        dom.landingInput.placeholder = 'Please enter a question or thought...';
        return;
      }
      startSession(val);
    });

    // Landing: Enter button
    dom.btnEnterLanding.addEventListener('click', () => {
      const val = dom.landingInput.value.trim();
      if (!val) {
        dom.landingInput.classList.add('border-red-300');
        dom.landingInput.placeholder = 'Please enter a question or thought...';
        return;
      }
      startSession(val);
    });

    // Landing: Enter key
    dom.landingInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = dom.landingInput.value.trim();
        if (val) startSession(val);
      }
    });

    // Landing: clear error state on input
    dom.landingInput.addEventListener('input', () => {
      dom.landingInput.classList.remove('border-red-300');
      if (dom.landingInput.placeholder.includes('Please enter')) {
        dom.landingInput.placeholder = "What's on your mind?";
      }
    });

    // Chat: Send button
    dom.btnSend.addEventListener('click', () => {
      const val = dom.chatInput.value.trim();
      if (!val) return;
      sendMessage(val);
    });

    // Chat: Enter key
    dom.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const val = dom.chatInput.value.trim();
        if (val) sendMessage(val);
      }
    });

    // Conclude buttons
    dom.btnConclude.addEventListener('click', concludeSession);
    dom.btnConcludeSidebar.addEventListener('click', concludeSession);

    // Start over
    dom.btnStartOver.addEventListener('click', resetSession);
  }

  function sendMessage(text) {
    dom.chatInput.value = '';
    appendUserMessage(text);
    sendToBackend();
  }

  // ── Init ───────────────────────────────────────────────────────────
  function init() {
    cacheDom();
    bindEvents();
    showView('landing');

    // Add some keyframe animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .animate-fadeIn {
        animation: fadeIn 0.4s ease-out;
      }
    `;
    document.head.appendChild(style);

    console.log('Socratica ChatApp initialized');
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
